import { env } from '../../../../../../../lib/env';

export async function POST(req: Request, ctx: { params: Promise<{ token: string; sessionId: string }> }) {
  const { token, sessionId } = await ctx.params;
  const { ROZGA_API_BASE_URL } = env();

  const upstream = await fetch(
    `${ROZGA_API_BASE_URL}/api/v1/public/ai-interview/${encodeURIComponent(token)}/sessions/${encodeURIComponent(sessionId)}/end`,
    {
      method: 'POST',
      cache: 'no-store',
    },
  );

  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  const body = await upstream.arrayBuffer();
  return new Response(body, { status: upstream.status, headers: { 'content-type': contentType } });
}
