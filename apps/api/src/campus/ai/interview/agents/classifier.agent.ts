import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OpenRouterClient } from '../openrouter.client';
import { extractFirstJsonObject } from '../llm-json';
import type { Difficulty } from './interviewer.agent';

const AnswerIntentSchema = z.enum(['ANSWER', 'NON_ANSWER', 'OFF_TOPIC', 'CLARIFICATION', 'HINT_REQUEST']);
const AnswerQualitySchema = z.enum(['POOR', 'FAIR', 'GOOD', 'EXCELLENT']);
const DifficultyShiftSchema = z.enum(['DOWN', 'SAME', 'UP']);

const ClassificationSchema = z
  .object({
    intent: AnswerIntentSchema,
    quality: AnswerQualitySchema,
    recommendedDifficultyShift: DifficultyShiftSchema,
    cheatingSuspected: z.boolean(),
    cheatingSignals: z.array(z.string().min(1)).max(6).default([]),
    confidence: z.number().min(0).max(1),
    notes: z.string().max(600).optional(),
  })
  .strict();

export type AnswerClassification = z.infer<typeof ClassificationSchema>;

@Injectable()
export class ClassifierAgent {
  constructor(private readonly llm: OpenRouterClient) {}

  async classifyAnswer(input: {
    roleTitle: string;
    difficulty: Difficulty;
    question: string;
    expectedTopics: string[];
    answer: string;
  }): Promise<AnswerClassification> {
    const system =
      'You are ClassifierAgent for a production interview system. ' +
      'Classify the candidate message to help routing, scoring, and difficulty adaptation. ' +
      'Be conservative about cheating: only mark cheatingSuspected=true when there are clear textual signals (e.g., admitting to using AI, copy/paste artifacts, refusing to explain, or contradictory implausible claims). ' +
      'Return STRICT JSON only.';

    const user =
      `Role: ${input.roleTitle}\n` +
      `Question difficulty: ${input.difficulty}\n` +
      `Question: ${input.question}\n` +
      `Expected topics: ${input.expectedTopics.join(', ') || '(none)'}\n` +
      `Candidate answer: ${input.answer}\n\n` +
      'Decide:\n' +
      '- intent: ANSWER | NON_ANSWER | OFF_TOPIC | CLARIFICATION | HINT_REQUEST\n' +
      '- quality: POOR | FAIR | GOOD | EXCELLENT (judge usefulness + correctness signals; do not require perfect correctness)\n' +
      '- recommendedDifficultyShift: DOWN | SAME | UP\n' +
      '- cheatingSuspected: boolean (conservative)\n' +
      '- cheatingSignals: short phrases that justify suspicion\n' +
      '- confidence: 0..1\n\n' +
      'Rules for recommendedDifficultyShift:\n' +
      '- UP only if the answer is clearly GOOD/EXCELLENT for this difficulty.\n' +
      '- DOWN if the answer is NON_ANSWER/OFF_TOPIC/very POOR.\n' +
      '- Otherwise SAME.\n\n' +
      'JSON shape:\n' +
      '{"intent":"ANSWER"|"NON_ANSWER"|"OFF_TOPIC"|"CLARIFICATION"|"HINT_REQUEST","quality":"POOR"|"FAIR"|"GOOD"|"EXCELLENT","recommendedDifficultyShift":"DOWN"|"SAME"|"UP","cheatingSuspected":boolean,"cheatingSignals":string[],"confidence":number,"notes"?:string}';

    const attempt = async (temperature: number) => {
      const content = await this.llm.chat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { maxTokens: 260, temperature },
      );
      const json = extractFirstJsonObject(content);
      return ClassificationSchema.parse(json);
    };

    try {
      return await attempt(0.2);
    } catch {
      try {
        return await attempt(0.05);
      } catch {
        // Safe fallback: treat as an answer but avoid aggressive actions.
        return ClassificationSchema.parse({
          intent: 'ANSWER',
          quality: 'FAIR',
          recommendedDifficultyShift: 'SAME',
          cheatingSuspected: false,
          cheatingSignals: [],
          confidence: 0.3,
          notes: 'fallback',
        });
      }
    }
  }
}
