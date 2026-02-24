import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiFetch } from '../../../../lib/api';

const BodySchema = z.object({
  colleges: z.array(
    z.object({
      name: z.string().min(2).max(200),
      code: z.string().min(1).max(20).optional(),
    }),
  ),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const body = BodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ message: 'Invalid input', issues: body.error.issues }, { status: 400 });
  }

  try {
    const upstream = await apiFetch('/api/v1/campus/colleges/bulk-import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body.data),
    });
    const out = await upstream.json();
    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bulk import failed';
    return NextResponse.json({ message: msg }, { status: 400 });
  }
}
