import { z } from 'zod';

export const InterviewAllocationSchema = z.object({
  candidateId: z.string().uuid(),
  interviewerUserId: z.string().uuid(),
  mode: z.enum(['ONLINE', 'OFFLINE']),
  scheduledAt: z.string().datetime().optional(),
});

export const InterviewFeedbackSchema = z.object({
  recommendation: z.enum(['STRONG_YES', 'YES', 'MAYBE', 'NO', 'STRONG_NO']),
  notes: z.string().max(4000).optional(),
  scores: z
    .object({
      problemSolving: z.number().int().min(0).max(10).optional(),
      fundamentals: z.number().int().min(0).max(10).optional(),
      communication: z.number().int().min(0).max(10).optional(),
    })
    .optional(),
});

export type InterviewAllocationInput = z.infer<typeof InterviewAllocationSchema>;
export type InterviewFeedbackInput = z.infer<typeof InterviewFeedbackSchema>;
