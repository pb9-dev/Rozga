import { NextResponse } from 'next/server';
import { apiFetch } from '../../../../lib/api';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';

  try {
    const upstream = await apiFetch(`/api/v1/campus/colleges/search?q=${encodeURIComponent(q)}`);
    const json = await upstream.json();
    return NextResponse.json(json, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Search failed';
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
