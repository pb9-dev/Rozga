import { apiFetch } from '../../../lib/api';
import { env } from '../../../lib/env';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';
import { Card } from '../../../ui/card';
import { Input } from '../../../ui/input';
import { Select } from '../../../ui/select';
import { Table, Td, Th } from '../../../ui/table';
import { Textarea } from '../../../ui/textarea';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { InterviewRoomActionsClient } from './InterviewRoomActionsClient';
import { ManageInterviewAssignmentClient } from './ManageInterviewAssignmentClient';
import { SubmitInterviewFeedbackClient } from './SubmitInterviewFeedbackClient';

type Batch = { id: string; name: string };
type Candidate = { id: string; fullName: string; email?: string | null };
type Interviewer = { id: string; email: string };

type Assignment = {
  id: string;
  createdAt: string;
  batchId: string;
  candidateId: string;
  interviewerId: string;
  mode: 'ONLINE' | 'OFFLINE';
  scheduledAt?: string | null;
  candidate?: Candidate;
  interviewer?: { id: string; email: string };
  batch?: { id: string; name: string };
  feedback?: {
    recommendation: string;
    notes?: string | null;
    scores?: Record<string, number>;
    createdAt: string;
  } | null;
  room?: {
    id: string;
    expiresAt?: string | null;
    endedAt?: string | null;
  } | null;
};

const GenerateRoomLinkSchema = z.object({
  assignmentId: z.string().uuid(),
});

async function generateCandidateLink(formData: FormData) {
  'use server';

  const parsed = GenerateRoomLinkSchema.safeParse({
    assignmentId: String(formData.get('assignmentId') ?? ''),
  });

  if (!parsed.success) {
    return { ok: false as const, message: 'Invalid assignment' };
  }

  try {
    const res = await apiFetch(`/api/v1/campus/interviews/assignments/${parsed.data.assignmentId}/room`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ regenerate: true }),
    });
    const json = (await res.json()) as { candidateJoinToken: string | null; expiresAt?: string | null };
    if (!json.candidateJoinToken) {
      return { ok: false as const, message: 'Could not generate link' };
    }
    return { ok: true as const, token: json.candidateJoinToken, expiresAt: json.expiresAt ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to generate link';
    return { ok: false as const, message: msg };
  }
}

const CreateAssignmentSchema = z.object({
  batchId: z.string().uuid(),
  candidateId: z.string().uuid(),
  interviewerUserId: z.string().uuid(),
  mode: z.enum(['ONLINE', 'OFFLINE']),
  scheduledAt: z.string().optional(),
});

async function createAssignment(formData: FormData) {
  'use server';

  const parsed = CreateAssignmentSchema.safeParse({
    batchId: String(formData.get('batchId') ?? ''),
    candidateId: String(formData.get('candidateId') ?? ''),
    interviewerUserId: String(formData.get('interviewerUserId') ?? ''),
    mode: String(formData.get('mode') ?? ''),
    scheduledAt: String(formData.get('scheduledAt') ?? '') || undefined,
  });

  if (!parsed.success) redirect(`/campus/interviews?error=${encodeURIComponent('Invalid input')}`);

  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt).toISOString() : undefined;

  let createdAssignmentId: string | null = null;

  try {
    const res = await apiFetch('/api/v1/campus/interviews/assignments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        batchId: parsed.data.batchId,
        allocation: {
          candidateId: parsed.data.candidateId,
          interviewerUserId: parsed.data.interviewerUserId,
          mode: parsed.data.mode,
          scheduledAt,
        },
      }),
    });

    const json = (await res.json().catch(() => null)) as any;
    createdAssignmentId = json?.id ? String(json.id) : null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Create failed';
    redirect(`/campus/interviews?error=${encodeURIComponent(msg)}`);
  }

  const extra = createdAssignmentId ? `&assignmentId=${encodeURIComponent(createdAssignmentId)}` : '';
  redirect(`/campus/interviews?batchId=${encodeURIComponent(parsed.data.batchId)}&created=1${extra}`);
}

const UpdateAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  interviewerUserId: z.string().uuid().optional(),
  mode: z.enum(['ONLINE', 'OFFLINE']).optional(),
  scheduledAt: z.string().optional(),
});

async function updateAssignment(formData: FormData) {
  'use server';

  const parsed = UpdateAssignmentSchema.safeParse({
    assignmentId: String(formData.get('assignmentId') ?? ''),
    interviewerUserId: String(formData.get('interviewerUserId') ?? '') || undefined,
    mode: String(formData.get('mode') ?? '') || undefined,
    scheduledAt: String(formData.get('scheduledAt') ?? ''),
  });

  if (!parsed.success) redirect(`/campus/interviews?error=${encodeURIComponent('Invalid update')}`);

  const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt).toISOString() : null;

  try {
    await apiFetch(`/api/v1/campus/interviews/assignments/${parsed.data.assignmentId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        interviewerUserId: parsed.data.interviewerUserId,
        mode: parsed.data.mode,
        scheduledAt,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    redirect(`/campus/interviews?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/campus/interviews?updated=1`);
}

const CancelAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
});

async function cancelAssignment(formData: FormData) {
  'use server';

  const parsed = CancelAssignmentSchema.safeParse({
    assignmentId: String(formData.get('assignmentId') ?? ''),
  });

  if (!parsed.success) redirect(`/campus/interviews?error=${encodeURIComponent('Invalid cancel')}`);

  try {
    await apiFetch(`/api/v1/campus/interviews/assignments/${parsed.data.assignmentId}`, {
      method: 'DELETE',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Cancel failed';
    redirect(`/campus/interviews?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/campus/interviews?cancelled=1`);
}

const FeedbackSchema = z.object({
  assignmentId: z.string().uuid(),
  recommendation: z.enum(['STRONG_YES', 'YES', 'MAYBE', 'NO', 'STRONG_NO']),
  notes: z.string().optional(),
  fundamentals: z.coerce.number().int().min(0).max(10).optional(),
  problemSolving: z.coerce.number().int().min(0).max(10).optional(),
  communication: z.coerce.number().int().min(0).max(10).optional(),
  toStageKey: z.string().optional(),
});

async function submitFeedback(formData: FormData) {
  'use server';

  const parsed = FeedbackSchema.safeParse({
    assignmentId: String(formData.get('assignmentId') ?? ''),
    recommendation: String(formData.get('recommendation') ?? ''),
    notes: String(formData.get('notes') ?? '') || undefined,
    fundamentals: formData.get('fundamentals') ? formData.get('fundamentals') : undefined,
    problemSolving: formData.get('problemSolving') ? formData.get('problemSolving') : undefined,
    communication: formData.get('communication') ? formData.get('communication') : undefined,
    toStageKey: String(formData.get('toStageKey') ?? '') || undefined,
  });
  if (!parsed.success) redirect(`/campus/interviews?error=${encodeURIComponent('Invalid feedback')}`);

  const scores = {
    fundamentals: parsed.data.fundamentals,
    problemSolving: parsed.data.problemSolving,
    communication: parsed.data.communication,
  } as const;
  const hasAnyScore = Object.values(scores).some((v) => typeof v === 'number');

  try {
    await apiFetch(`/api/v1/campus/interviews/assignments/${parsed.data.assignmentId}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        feedback: {
          recommendation: parsed.data.recommendation,
          notes: parsed.data.notes,
          scores: hasAnyScore ? scores : undefined,
        },
        toStageKey: parsed.data.toStageKey,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Submit failed';
    redirect(`/campus/interviews?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/campus/interviews?feedback=1`);
}

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    batchId?: string;
    created?: string;
    feedback?: string;
    updated?: string;
    cancelled?: string;
    assignmentId?: string;
    error?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const meRes = await apiFetch('/api/v1/auth/me');
  const me = (await meRes.json()) as { roles?: string[] };
  const roles = me.roles ?? [];
  const isPrivileged = roles.includes('HR') || roles.includes('Admin');

  const banner = (() => {
    const error = resolvedSearchParams?.error ? String(resolvedSearchParams.error) : '';
    if (error) {
      return (
        <div className="rounded-md border border-red-500/20 bg-red-950/50 p-3 text-sm text-red-300">
          {error}
        </div>
      );
    }
    if (resolvedSearchParams?.created === '1') {
      return (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-950/50 p-3 text-sm text-emerald-300">
          Interview scheduled.
        </div>
      );
    }
    if (resolvedSearchParams?.updated === '1') {
      return (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-950/50 p-3 text-sm text-emerald-300">
          Interview updated.
        </div>
      );
    }
    if (resolvedSearchParams?.cancelled === '1') {
      return (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-950/50 p-3 text-sm text-emerald-300">
          Interview cancelled.
        </div>
      );
    }
    if (resolvedSearchParams?.feedback === '1') {
      return (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-950/50 p-3 text-sm text-emerald-300">
          Feedback submitted.
        </div>
      );
    }
    return null;
  })();

  const { ROZGA_API_BASE_URL } = env();
  const apiOrigin = new URL(ROZGA_API_BASE_URL).origin;

  const batches: Batch[] = isPrivileged
    ? (() => {
        // HR/Admin only endpoint
        return [] as Batch[];
      })()
    : [];

  let selectedBatchId: string | undefined = undefined;
  let candidates: Candidate[] = [];

  if (isPrivileged) {
    const batchesRes = await apiFetch('/api/v1/campus/batches');
    const batchesJson = (await batchesRes.json()) as any;
    const loaded: Batch[] = Array.isArray(batchesJson?.value) ? batchesJson.value : batchesJson;
    batches.splice(0, batches.length, ...loaded);

    selectedBatchId = resolvedSearchParams?.batchId || batches[0]?.id;

    const candidatesRes = selectedBatchId
      ? await apiFetch(`/api/v1/campus/candidates?batchId=${encodeURIComponent(selectedBatchId)}`)
      : null;
    const candidatesJson = candidatesRes ? ((await candidatesRes.json()) as any) : [];
    candidates = Array.isArray(candidatesJson?.value) ? candidatesJson.value : candidatesJson;
  }

  const interviewers: Interviewer[] = isPrivileged
    ? (((await (await apiFetch('/api/v1/campus/interviewers')).json()) as any) as Interviewer[])
    : [];

  const assignmentsRes = selectedBatchId
    ? await apiFetch(`/api/v1/campus/interviews/assignments?batchId=${encodeURIComponent(selectedBatchId)}`)
    : await apiFetch('/api/v1/campus/interviews/assignments');
  const assignmentsJson = (await assignmentsRes.json()) as any;
  const assignments: Assignment[] = Array.isArray(assignmentsJson?.value) ? assignmentsJson.value : assignmentsJson;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Interviews</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {isPrivileged ? 'Schedule interviews and capture feedback' : 'View your assigned interviews'}
          </p>
        </div>
      </div>

      {banner}

      {/* Batch filter - only for HR */}
      {isPrivileged ? (
        <form action="/campus/interviews" method="GET" className="flex items-end gap-3">
          <div className="min-w-[200px] flex-1 max-w-xs">
            <Select name="batchId" label="Batch" defaultValue={selectedBatchId ?? ''}>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary" size="sm">Load</Button>
        </form>
      ) : null}

      {/* Schedule form - HR only */}
      {isPrivileged && selectedBatchId && candidates.length > 0 && interviewers.length > 0 ? (
        <Card>
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Schedule new interview</h3>
          <form action={createAssignment} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="batchId" value={selectedBatchId} />
            <Select name="candidateId" label="Candidate" defaultValue={candidates[0]?.id ?? ''}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}{c.email ? ` — ${c.email}` : ''}
                </option>
              ))}
            </Select>
            <Select name="interviewerUserId" label="Interviewer" defaultValue={interviewers[0]?.id ?? ''}>
              {interviewers.map((u) => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </Select>
            <Select name="mode" label="Mode" defaultValue="ONLINE">
              <option value="ONLINE">Online</option>
              <option value="OFFLINE">Offline</option>
            </Select>
            <Input name="scheduledAt" label="Scheduled at" type="datetime-local" />
            <div className="md:col-span-2">
              <Button type="submit" variant="primary" size="sm">Schedule</Button>
            </div>
          </form>
        </Card>
      ) : isPrivileged && selectedBatchId && !candidates.length ? (
        <Card>
          <p className="text-sm text-zinc-500">
            No candidates for this batch.{' '}
            <Link className="text-indigo-400 hover:text-indigo-300" href={`/campus/candidates?batchId=${encodeURIComponent(selectedBatchId)}`}>
              Import candidates
            </Link>
          </p>
        </Card>
      ) : null}

      {/* Assignments table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-400">Assignments</h2>
          <Badge tone="neutral">{assignments.length}</Badge>
        </div>

        {assignments.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500 text-center py-4">No interview assignments yet.</p>
          </Card>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Candidate</Th>
                <Th>Interviewer</Th>
                <Th>Mode</Th>
                <Th>Scheduled</Th>
                <Th>Room</Th>
                {isPrivileged ? <Th>Manage</Th> : null}
                <Th>Feedback</Th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <Td className="font-medium text-zinc-200">{a.candidate?.fullName ?? a.candidateId}</Td>
                  <Td>{a.interviewer?.email ?? a.interviewerId}</Td>
                  <Td><Badge tone={a.mode === 'ONLINE' ? 'info' : 'neutral'}>{a.mode}</Badge></Td>
                  <Td className="text-zinc-400 text-xs">{a.scheduledAt ? new Date(a.scheduledAt).toLocaleString() : '—'}</Td>
                  <Td>
                    {a.mode === 'ONLINE' ? (
                      <div className="flex items-center gap-2">
                        <Link className="text-xs text-indigo-400 hover:text-indigo-300" href={`/campus/interviews/${a.id}/room`}>
                          Join
                        </Link>
                        {isPrivileged ? (
                          <InterviewRoomActionsClient assignmentId={a.id} generateLink={generateCandidateLink} />
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </Td>
                  {isPrivileged ? (
                    <Td>
                      <ManageInterviewAssignmentClient
                        assignmentId={a.id}
                        currentMode={a.mode}
                        currentScheduledAt={a.scheduledAt ?? null}
                        currentInterviewerId={a.interviewer?.id ?? a.interviewerId}
                        interviewers={interviewers}
                        updateAssignment={updateAssignment}
                        cancelAssignment={cancelAssignment}
                      />
                    </Td>
                  ) : null}
                  <Td>
                    {a.feedback ? (
                      <Badge tone={a.feedback.recommendation.includes('YES') ? 'good' : a.feedback.recommendation === 'NO' || a.feedback.recommendation === 'STRONG_NO' ? 'danger' : 'warn'}>
                        {a.feedback.recommendation}
                      </Badge>
                    ) : (
                      <span className="text-zinc-600">Pending</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {/* Feedback form */}
      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Submit feedback</h3>
        <SubmitInterviewFeedbackClient assignments={assignments} apiOrigin={apiOrigin} submitFeedback={submitFeedback} />
      </Card>
    </div>
  );
}
