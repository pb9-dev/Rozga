import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  throw new BadRequestException({
    message: 'Validation failed',
    issues: result.error.issues,
  });
}
