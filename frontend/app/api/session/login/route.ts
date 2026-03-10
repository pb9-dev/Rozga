import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '../../../lib/env';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../../lib/session';

const BodySchema = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const body = BodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ message: 'Invalid input', issues: body.error.issues }, { status: 400 });
  }

  const { ROZGA_API_BASE_URL } = env();
  const upstream = await fetch(`${ROZGA_API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body.data),
  });

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    return NextResponse.json({ message: 'Login failed', upstream: text }, { status: 401 });
  }

  const tokens = (await upstream.json()) as { accessToken: string; refreshToken: string };

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });

  return res;
}
