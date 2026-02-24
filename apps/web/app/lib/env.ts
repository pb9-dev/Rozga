import { z } from 'zod';

const EnvSchema = z.object({
  ROZGA_API_BASE_URL: z.string().url().default('http://localhost:3001'),
});

export function env() {
  // Next server runtime only (do not expose secrets here)
  return EnvSchema.parse({
    ROZGA_API_BASE_URL: process.env.ROZGA_API_BASE_URL,
  });
}
