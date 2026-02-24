import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiFetch } from '../../../../lib/api';

const BodySchema = z.object({
  name: z.string().min(2).max(200),
  countryCode: z.string().min(1).max(10).optional(),
  state: z.string().min(1).max(300).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const body = BodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ message: 'Invalid input', issues: body.error.issues }, { status: 400 });
  }

  try {
    const upstream = await apiFetch('/api/v1/campus/colleges/ensure', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body.data),
    });
    const out = await upstream.json();
    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ensure failed';
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
