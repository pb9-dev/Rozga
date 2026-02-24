import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),

  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().min(3600).default(60 * 60 * 24 * 30),

  OPENROUTER_API_KEY: z.string().optional().default(''),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_DEFAULT_MODEL: z.string().default('qwen/qwen3-next-80b-a3b-instruct:free'),

  ROZGA_WEB_BASE_URL: z.string().url().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return EnvSchema.parse(config);
}
