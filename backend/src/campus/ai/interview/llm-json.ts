import { InternalServerErrorException } from '@nestjs/common';

export function extractFirstJsonObject(text: string): unknown {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new InternalServerErrorException('AI returned empty content');

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    throw new InternalServerErrorException('AI did not return JSON');
  }

  const candidate = trimmed.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    throw new InternalServerErrorException('AI returned invalid JSON');
  }
}
