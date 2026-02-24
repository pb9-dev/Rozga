import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../../lib/session';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACCESS_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
