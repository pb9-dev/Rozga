import { apiFetch } from '../../../lib/api';
import { z } from 'zod';
import { InterviewersClient } from './InterviewersClient';

type Interviewer = { id: string; email: string; roles?: string[] };

const UpsertSchema = z.object({
  email: z.string().email(),
  tempPassword: z.string().min(8).optional(),
});

async function upsertInterviewer(_: any, formData: FormData) {
  'use server';

  const parsed = UpsertSchema.safeParse({
    email: String(formData.get('email') ?? ''),
    tempPassword: String(formData.get('tempPassword') ?? '').trim() || undefined,
  });

  if (!parsed.success) {
    return { ok: false as const, message: 'Invalid input' };
  }

  try {
    const res = await apiFetch('/api/v1/campus/interviewers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    const json = (await res.json()) as any;

    if (json?.created) {
      return {
        ok: true as const,
        created: true as const,
        tempPassword: json?.tempPassword as string | undefined,
        message: `Created interviewer: ${json?.user?.email ?? parsed.data.email}`,
      };
    }

    return {
      ok: true as const,
      created: false as const,
      message: `Updated interviewer: ${json?.user?.email ?? parsed.data.email}`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return { ok: false as const, message: msg };
  }
}

export default async function InterviewersPage() {
  const res = await apiFetch('/api/v1/campus/interviewers');
  const json = (await res.json()) as any;
  const interviewers: Interviewer[] = Array.isArray(json?.value) ? json.value : json;

  return <InterviewersClient interviewers={interviewers} upsertAction={upsertInterviewer} />;
}
