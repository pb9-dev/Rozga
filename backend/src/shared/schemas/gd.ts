import { z } from 'zod';

export const GDEvaluationSchema = z.object({
  shortlisted: z.boolean(),
  notes: z.string().max(2000).optional(),
  metrics: z
    .object({
      communication: z.number().int().min(0).max(10).optional(),
      leadership: z.number().int().min(0).max(10).optional(),
      confidence: z.number().int().min(0).max(10).optional(),
      collaboration: z.number().int().min(0).max(10).optional(),
    })
    .optional(),
});

export type GDEvaluationInput = z.infer<typeof GDEvaluationSchema>;