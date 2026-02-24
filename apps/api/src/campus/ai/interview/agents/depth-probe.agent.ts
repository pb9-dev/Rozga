import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { OpenRouterClient } from '../openrouter.client';
import { extractFirstJsonObject } from '../llm-json';

const DepthProbeResultSchema = z
  .object({
    answerDepthScore: z.number().int().min(1).max(5),
    needsFollowUp: z.boolean(),
    followUpQuestion: z.string().min(1).optional(),
    keyGaps: z.array(z.string().min(1)).max(5).default([]),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.needsFollowUp && !val.followUpQuestion) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'followUpQuestion required when needsFollowUp=true' });
    }
  });

export type DepthProbeResult = z.infer<typeof DepthProbeResultSchema>;

@Injectable()
export class DepthProbeAgent {
  constructor(private readonly llm: OpenRouterClient) {}

  async analyzeAnswer(input: {
    roleTitle: string;
    question: string;
    expectedTopics: string[];
    answer: string;
  }): Promise<DepthProbeResult> {
    const system =
      'You are DepthProbeAgent. Your job is to judge depth and reasoning, not correctness. ' +
      'If the answer is shallow, ask ONE concise follow-up starting with Why/What tradeoffs/What fails in production. ' +
      "If the candidate clearly says they don't know / gives no attempt, set needsFollowUp=false (move on). " +
      'Return STRICT JSON only.';

    const user =
      `Role: ${input.roleTitle}\n` +
      `Question: ${input.question}\n` +
      `Expected topics: ${input.expectedTopics.join(', ') || '(none)'}\n` +
      `Answer: ${input.answer}\n\n` +
      'Return JSON shape:\n' +
      '{"answerDepthScore":1|2|3|4|5,"needsFollowUp":boolean,"followUpQuestion"?:string,"keyGaps":string[]}' +
      "\nRules: needsFollowUp=true only if it would materially improve reasoning depth. If answer is 'I don't know'/no attempt, set needsFollowUp=false. No multi-part follow-ups.";

    const content = await this.llm.chat(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { maxTokens: 260, temperature: 0.2 },
    );

    const json = extractFirstJsonObject(content);
    return DepthProbeResultSchema.parse(json);
  }
}
