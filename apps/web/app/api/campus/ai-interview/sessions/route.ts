import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiFetch } from '../../../../lib/api';

const BodySchema = z.object({
  candidateId: z.string().uuid(),
  assignmentId: z.string().uuid().optional(),
  roleTitle: z.string().min(2).max(200),
  seniority: z.enum(['intern', 'junior', 'mid', 'senior']).optional(),
  maxQuestions: z.number().int().min(1).max(8).optional(),
  maxFollowUps: z.number().int().min(0).max(3).optional(),
  maxTotalTurns: z.number().int().min(6).max(60).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const body = BodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ message: 'Invalid input', issues: body.error.issues }, { status: 400 });
  }

  try {
    const upstream = await apiFetch('/api/v1/campus/ai/interview/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body.data),
    });
    const out = await upstream.json();
    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Start session failed';
    const status = typeof msg === 'string' && msg.includes(' 429 ') ? 429 : 400;
    return NextResponse.json({ message: msg }, { status });
  }
}
