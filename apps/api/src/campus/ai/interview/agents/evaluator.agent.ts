import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OpenRouterClient } from '../openrouter.client';
import { extractFirstJsonObject } from '../llm-json';

export const EvaluationSchema = z
  .object({
    technicalDepthScore: z.number().int().min(1).max(10),
    problemSolvingScore: z.number().int().min(1).max(10),
    communicationScore: z.number().int().min(1).max(10),
    strengths: z.array(z.string().min(1)).min(1).max(6),
    weaknesses: z.array(z.string().min(1)).min(1).max(6),
    summary: z.string().min(1).max(1200),
  })
  .strict();

export type EvaluationDto = z.infer<typeof EvaluationSchema>;

@Injectable()
export class EvaluatorAgent {
  constructor(private readonly llm: OpenRouterClient) {}

  private clampInt(value: unknown, min: number, max: number, fallback: number) {
    const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    if (!Number.isFinite(n)) return fallback;
    const i = Math.trunc(n);
    if (i < min) return min;
    if (i > max) return max;
    return i;
  }

  private coerceStringArray(value: unknown, maxItems: number): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string') continue;
      const s = item.trim();
      if (!s) continue;
      out.push(s);
      if (out.length >= maxItems) break;
    }
    return out;
  }

  private buildFallbackEvaluation(params: {
    roleTitle: string;
    qa: Array<{ question: string; answer: string; followUps: Array<{ question: string; answer: string }> }>;
  }): EvaluationDto {
    const answered = params.qa.length;
    const summary =
      answered === 0
        ? `No usable answers were provided for the ${params.roleTitle} interview.`
        : `Candidate answered ${answered} question(s). Responses show areas to improve depth and specificity for ${params.roleTitle}.`;

    return {
      technicalDepthScore: 1,
      problemSolvingScore: 1,
      communicationScore: 1,
      strengths: ['Participated in the interview process'],
      weaknesses: ['Answers lacked sufficient detail to assess depth'],
      summary: summary.slice(0, 1200),
    };
  }

  async evaluate(input: {
    roleTitle: string;
    qa: Array<{ question: string; answer: string; followUps: Array<{ question: string; answer: string }> }>;
  }): Promise<EvaluationDto> {
    const transcript = input.qa
      .slice(0, 8)
      .map((item, i) => {
        const fu = item.followUps
          .slice(0, 3)
          .map((f, j) => `  Follow-up ${j + 1} Q: ${f.question}\n  A: ${f.answer}`)
          .join('\n');
        return `Q${i + 1}: ${item.question}\nA${i + 1}: ${item.answer}${fu ? `\n${fu}` : ''}`;
      })
      .join('\n\n');

    const system =
      'You are EvaluatorAgent for a recruiter-facing evaluation. ' +
      'Score reasoning depth, practical understanding, and communication. ' +
      'Do NOT score purely on correctness. ' +
      'Return STRICT JSON only.';

    const user =
      `Role: ${input.roleTitle}\n\n` +
      `Transcript:\n${transcript}\n\n` +
      'Return JSON shape:\n' +
      '{"technicalDepthScore":1..10,"problemSolvingScore":1..10,"communicationScore":1..10,' +
      '"strengths":string[],"weaknesses":string[],"summary":string}' +
      '\nConstraints: strengths and weaknesses MUST each contain 1 to 6 non-empty items (never empty arrays).' +
      '\nKeep summary concise and human-readable for recruiters.';

    const content = await this.llm.chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 520, temperature: 0.25 },
    );

    let json: unknown;
    try {
      json = extractFirstJsonObject(content);
    } catch {
      return this.buildFallbackEvaluation(input);
    }

    // First try strict parsing.
    const strict = EvaluationSchema.safeParse(json);
    if (strict.success) return strict.data;

    // Repair common LLM failures (most frequently: empty strengths/weaknesses arrays).
    const obj = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
    const strengths = this.coerceStringArray(obj.strengths, 6);
    const weaknesses = this.coerceStringArray(obj.weaknesses, 6);

    if (strengths.length === 0) strengths.push('Communicated clearly when responding');
    if (weaknesses.length === 0) weaknesses.push('Responses lacked depth and concrete examples');

    const summaryRaw = typeof obj.summary === 'string' ? obj.summary.trim() : '';
    const summary = summaryRaw
      ? summaryRaw.slice(0, 1200)
      : this.buildFallbackEvaluation(input).summary;

    const repaired: EvaluationDto = {
      technicalDepthScore: this.clampInt(obj.technicalDepthScore, 1, 10, 1),
      problemSolvingScore: this.clampInt(obj.problemSolvingScore, 1, 10, 1),
      communicationScore: this.clampInt(obj.communicationScore, 1, 10, 1),
      strengths,
      weaknesses,
      summary,
    };

    // Final guard: enforce schema guarantees.
    try {
      return EvaluationSchema.parse(repaired);
    } catch {
      return this.buildFallbackEvaluation(input);
    }
  }
}
