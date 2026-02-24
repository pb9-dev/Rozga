import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ACCESS_COOKIE = 'rozga_access';
const REFRESH_COOKIE = 'rozga_refresh';

const protectedPrefixes = ['/dashboard', '/campus'];

function base64UrlDecode(input: string): string {
  const pad = '='.repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, '+').replace(/_/g, '/');
  // eslint-disable-next-line no-undef
  return Buffer.from(b64, 'base64').toString('utf8');
}

function isJwtExpiredOrInvalid(token: string): boolean {
  const parts = token.split('.');
  if (parts.length < 2) return true;
  try {
    const payloadJson = base64UrlDecode(parts[1]);
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload?.exp) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp <= nowSec;
  } catch {
    return true;
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtected = protectedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token || isJwtExpiredOrInvalid(token)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';

    const res = NextResponse.redirect(url);
    res.cookies.set(ACCESS_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    res.cookies.set(REFRESH_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/campus/:path*'],
};
