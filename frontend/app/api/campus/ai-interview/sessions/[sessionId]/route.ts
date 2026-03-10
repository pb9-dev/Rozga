import { NextResponse } from 'next/server';
import { apiFetch } from '../../../../../lib/api';

export async function GET(_: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;

  try {
    const upstream = await apiFetch(`/api/v1/campus/ai/interview/sessions/${encodeURIComponent(sessionId)}`);
    const out = await upstream.json();
    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Get session failed';
    const status = typeof msg === 'string' && msg.includes(' 429 ') ? 429 : 400;
    return NextResponse.json({ message: msg }, { status });
  }
}
