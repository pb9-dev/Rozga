import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiFetch } from '../../../../../../lib/api';

const BodySchema = z.object({
  answer: z.string().min(1).max(10_000),
});

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;

  const json = await req.json().catch(() => ({}));
  const body = BodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ message: 'Invalid input', issues: body.error.issues }, { status: 400 });
  }

  try {
    const upstream = await apiFetch(`/api/v1/campus/ai/interview/sessions/${encodeURIComponent(sessionId)}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body.data),
    });
    const out = await upstream.json();
    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Submit answer failed';
    const status = typeof msg === 'string' && msg.includes(' 429 ') ? 429 : 400;
    return NextResponse.json({ message: msg }, { status });
  }
}
