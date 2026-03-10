import { z } from 'zod';

export const CampusStageKindSchema = z.enum([
  'GD_OFFLINE',
  'AI_INTERVIEW',
  'TECH_TEST',
  'TECH_ROUND_ONLINE',
  'TECH_ROUND_OFFLINE',
]);

export const FlowStageInputSchema = z.object({
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  kind: CampusStageKindSchema,
  order: z.number().int().min(0),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const FlowTransitionInputSchema = z.object({
  fromStageKey: z.string().min(1).max(64),
  toStageKey: z.string().min(1).max(64),
  condition: z.record(z.string(), z.unknown()).default({}),
});

export const CampusHiringFlowUpsertSchema = z.object({
  name: z.string().min(1).max(128),
  batchSize: z.number().int().min(1).max(5000).default(100),
  stages: z.array(FlowStageInputSchema).min(1),
  transitions: z.array(FlowTransitionInputSchema).min(0),
});