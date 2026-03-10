import { z } from 'zod';

export const ScheduleAiInterviewSchema = z
  .object({
    candidateId: z.string().uuid(),
    batchId: z.string().uuid(),
    scheduledAt: z.string().datetime().optional(),
    expiresInMinutes: z.number().int().min(10).max(60 * 24 * 30).optional(),
    regenerateLink: z.boolean().optional().default(true),
  })
  .strict();

export type ScheduleAiInterviewDto = z.infer<typeof ScheduleAiInterviewSchema>;
