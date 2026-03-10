import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OpenRouterClient } from '../openrouter.client';
import { extractFirstJsonObject } from '../llm-json';

const DifficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);

const QuestionTypeSchema = z
  .enum([
    'SYSTEM_DESIGN',
    'DEBUGGING',
    'API_BACKEND',
    'DATABASE',
    'DISTRIBUTED_SYSTEMS',
    'SECURITY',
    'BEHAVIORAL',
  ])
  .optional();

const NextQuestionSchema = z
  .object({
    question: z.string().min(1),
    difficulty: DifficultySchema,
    questionType: QuestionTypeSchema,
    expectedTopics: z.array(z.string().min(1)).max(6).default([]),
    answerConstraints: z
      .object({
        maxSentences: z.number().int().min(3).max(12).optional(),
        maxWords: z.number().int().min(10).max(250).optional(),
      })
      .default({}),
  })
  .strict();

export type Difficulty = z.infer<typeof DifficultySchema>;
export type NextQuestion = z.infer<typeof NextQuestionSchema>;

export type QuestionFocus = 'RESUME' | 'JD';

@Injectable()
export class InterviewerAgent {
  constructor(private readonly llm: OpenRouterClient) {}

  async generateNextQuestion(input: {
    roleTitle: string;
    seniority?: 'intern' | 'junior' | 'mid' | 'senior';
    difficulty: Difficulty;
    priorQAPairs: Array<{ question: string; answer: string; depthScore?: number }>;
    askedQuestions?: string[];
    contextText?: string;
    focus?: QuestionFocus;
  }): Promise<NextQuestion> {
    const { roleTitle, seniority, difficulty, priorQAPairs, contextText, askedQuestions } = input;
    const focus: QuestionFocus = input.focus ?? 'JD';

    const prior = priorQAPairs
      .slice(-2)
      .map((p, i) => `#${i + 1} Q: ${p.question}\nA: ${p.answer}\nDepth: ${p.depthScore ?? 'n/a'}`)
      .join('\n\n');

    const focusRule =
      focus === 'RESUME'
        ? 'For this question, prioritize the candidate’s resume/projects/internships/experience. Ground it in resume highlights if present.'
        : 'For this question, prioritize the role requirements and job description. Ground it in JD highlights if present.';

    const system =
      `You are InterviewerAgent for a short, recruiter-friendly interview for the role "${roleTitle}". ` +
      'Always ask reasoning-first questions (no MCQs). ' +
      'Ask exactly ONE question. ' +
      'Adapt difficulty based on the candidate’s previous answers. ' +
      'Do not repeat a prior question or a close paraphrase. ' +
      `${focusRule} ` +
      'If resume/JD highlights are present, ground the question in them (but do not mention “resume/JD” explicitly). ' +
      'Return STRICT JSON only. No extra keys.';

    const user =
      `Role: ${roleTitle}\n` +
      `Seniority: ${seniority ?? 'unspecified'}\n` +
      `Target difficulty: ${difficulty}\n\n` +
      (contextText ? `Context (from tools/db):\n${contextText}\n\n` : '') +
      (prior ? `Recent context:\n${prior}\n\n` : '') +
      (askedQuestions?.length
        ? `Do NOT repeat or closely paraphrase any of these questions (avoid same topic/angle too):\n- ${askedQuestions
            .slice(-8)
            .map((q) => q.replace(/\s+/g, ' ').slice(0, 160))
            .join('\n- ')}\n\n`
        : '') +
      'Generate the next interview question. It must force the candidate to explain reasoning, tradeoffs, and production failure modes. ' +
      'Avoid multi-part questions. Avoid trivia. Prefer scenario-based questions tied to the role. Include concise answer constraints to keep the reply short.' +
      '\n\nJSON shape:\n' +
      '{"question":string,"difficulty":"EASY"|"MEDIUM"|"HARD","questionType"?:"SYSTEM_DESIGN"|"DEBUGGING"|"API_BACKEND"|"DATABASE"|"DISTRIBUTED_SYSTEMS"|"SECURITY"|"BEHAVIORAL","expectedTopics":string[],"answerConstraints":{"maxSentences"?:number,"maxWords"?:number}}';

    const attempt = async (temperature: number) => {
      const content = await this.llm.chat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { maxTokens: 320, temperature },
      );
      const json = extractFirstJsonObject(content);
      return NextQuestionSchema.parse(json);
    };

    try {
      return await attempt(0.35);
    } catch {
      try {
        // Retry with lower creativity to improve JSON compliance.
        return await attempt(0.15);
      } catch {
        // Production-safe fallback: never 500 the whole interview due to model formatting.
        return NextQuestionSchema.parse({
          question: `Walk me through a real production issue you solved that is relevant to "${roleTitle}"—what broke, how you diagnosed it, and what you changed to prevent recurrence?`,
          difficulty,
          questionType: 'DEBUGGING',
          expectedTopics: ['diagnosis', 'tradeoffs', 'prevention', 'monitoring'],
          answerConstraints: { maxSentences: 8 },
        });
      }
    }
  }
}
