import { NextResponse } from 'next/server';
import { getAccessToken } from '../../../lib/session';

export async function GET() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json({ accessToken }, { headers: { 'cache-control': 'no-store' } });
}
