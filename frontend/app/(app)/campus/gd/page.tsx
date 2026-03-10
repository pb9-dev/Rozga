import { apiFetch } from '../../../lib/api';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';
import { Card } from '../../../ui/card';
import { Input } from '../../../ui/input';
import { MultiSelect } from '../../../ui/multiselect';
import { Select } from '../../../ui/select';
import { Table, Td, Th } from '../../../ui/table';
import { Textarea } from '../../../ui/textarea';
import { redirect } from 'next/navigation';
import { z } from 'zod';

type Batch = { id: string; name: string };
type Candidate = { id: string; fullName: string; email?: string | null };
type Interviewer = { id: string; email: string };

type GdGroup = {
  id: string;
  name: string;
  capacity: number;
  createdAt: string;
  _count?: { candidates: number; interviewers: number; evaluations: number };
  candidates?: { candidate: Candidate }[];
  interviewers?: { user: { id: string; email: string } }[];
};

const CreateGroupSchema = z.object({
  batchId: z.string().uuid(),
  name: z.string().min(2),
  capacity: z.coerce.number().int().min(1),
  candidateIds: z.array(z.string().uuid()).optional(),
  interviewerUserIds: z.array(z.string().uuid()).optional(),
});

const AutoCreateGroupsSchema = z.object({
  batchId: z.string().uuid(),
  groupSize: z.coerce.number().int().min(1).max(500),
  replaceExisting: z.boolean().optional(),
  onlyUnassigned: z.boolean().optional(),
  interviewerUserIds: z.array(z.string().uuid()).optional(),
});

async function createGroup(formData: FormData) {
  'use server';

  const parsed = CreateGroupSchema.safeParse({
    batchId: String(formData.get('batchId') ?? ''),
    name: String(formData.get('name') ?? ''),
    capacity: formData.get('capacity'),
    candidateIds: (formData.getAll('candidateIds') as string[]).filter(Boolean),
    interviewerUserIds: (formData.getAll('interviewerUserIds') as string[]).filter(Boolean),
  });
  if (!parsed.success) redirect(`/campus/gd?error=${encodeURIComponent('Invalid input')}`);

  try {
    await apiFetch('/api/v1/campus/gd/groups', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        batchId: parsed.data.batchId,
        name: parsed.data.name,
        capacity: parsed.data.capacity,
        candidateIds: parsed.data.candidateIds?.length ? parsed.data.candidateIds : undefined,
        interviewerUserIds: parsed.data.interviewerUserIds?.length ? parsed.data.interviewerUserIds : undefined,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Create failed';
    redirect(`/campus/gd?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/campus/gd?batchId=${encodeURIComponent(parsed.data.batchId)}&created=1`);
}

async function addCandidates(formData: FormData) {
  'use server';

  const gdGroupId = String(formData.get('gdGroupId') ?? '');
  const ids = (formData.getAll('candidateIds') as string[]).filter(Boolean);
  if (!gdGroupId || !ids.length) redirect(`/campus/gd?error=${encodeURIComponent('Select candidates to add')}`);

  try {
    await apiFetch(`/api/v1/campus/gd/groups/${gdGroupId}/candidates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    redirect(`/campus/gd?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/campus/gd?updated=1`);
}

async function addInterviewers(formData: FormData) {
  'use server';

  const gdGroupId = String(formData.get('gdGroupId') ?? '');
  const ids = (formData.getAll('interviewerUserIds') as string[]).filter(Boolean);
  if (!gdGroupId || !ids.length) redirect(`/campus/gd?error=${encodeURIComponent('Select interviewers to add')}`);

  try {
    await apiFetch(`/api/v1/campus/gd/groups/${gdGroupId}/interviewers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    redirect(`/campus/gd?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/campus/gd?updated=1`);
}

async function autoCreateGroups(formData: FormData) {
  'use server';

  const parsed = AutoCreateGroupsSchema.safeParse({
    batchId: String(formData.get('batchId') ?? ''),
    groupSize: formData.get('groupSize'),
    replaceExisting: String(formData.get('replaceExisting') ?? '') === 'on',
    onlyUnassigned: String(formData.get('onlyUnassigned') ?? '') === 'on',
    interviewerUserIds: (formData.getAll('interviewerUserIds') as string[]).filter(Boolean),
  });
  if (!parsed.success) redirect(`/campus/gd?error=${encodeURIComponent('Invalid input')}`);

  try {
    await apiFetch('/api/v1/campus/gd/groups/auto-create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        batchId: parsed.data.batchId,
        groupSize: parsed.data.groupSize,
        replaceExisting: parsed.data.replaceExisting,
        onlyUnassigned: parsed.data.onlyUnassigned,
        interviewerUserIds: parsed.data.interviewerUserIds?.length ? parsed.data.interviewerUserIds : undefined,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Auto-create failed';
    redirect(`/campus/gd?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/campus/gd?batchId=${encodeURIComponent(parsed.data.batchId)}&autoCreated=1`);
}

const EvaluationSchema = z.object({
  gdGroupId: z.string().uuid(),
  candidateId: z.string().uuid(),
  shortlisted: z.boolean(),
  notes: z.string().optional(),
  communication: z.coerce.number().int().min(0).max(10).optional(),
  leadership: z.coerce.number().int().min(0).max(10).optional(),
  confidence: z.coerce.number().int().min(0).max(10).optional(),
  collaboration: z.coerce.number().int().min(0).max(10).optional(),
});

async function submitEvaluation(formData: FormData) {
  'use server';

  const parsed = EvaluationSchema.safeParse({
    gdGroupId: String(formData.get('gdGroupId') ?? ''),
    candidateId: String(formData.get('candidateId') ?? ''),
    shortlisted: String(formData.get('shortlisted') ?? '') === 'on',
    notes: String(formData.get('notes') ?? '') || undefined,
    communication: formData.get('communication') ? formData.get('communication') : undefined,
    leadership: formData.get('leadership') ? formData.get('leadership') : undefined,
    confidence: formData.get('confidence') ? formData.get('confidence') : undefined,
    collaboration: formData.get('collaboration') ? formData.get('collaboration') : undefined,
  });
  if (!parsed.success) redirect(`/campus/gd?error=${encodeURIComponent('Invalid evaluation')}`);

  const metrics = {
    communication: parsed.data.communication,
    leadership: parsed.data.leadership,
    confidence: parsed.data.confidence,
    collaboration: parsed.data.collaboration,
  } as const;

  const hasAnyMetric = Object.values(metrics).some((v) => typeof v === 'number');

  try {
    await apiFetch('/api/v1/campus/gd/evaluations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gdGroupId: parsed.data.gdGroupId,
        candidateId: parsed.data.candidateId,
        evaluation: {
          shortlisted: parsed.data.shortlisted,
          notes: parsed.data.notes,
          metrics: hasAnyMetric ? metrics : undefined,
        },
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Submit failed';
    redirect(`/campus/gd?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/campus/gd?evaluated=1`);
}

export default async function GdPage({
  searchParams,
}: {
  searchParams?: { batchId?: string; error?: string; autoCreated?: string };
}) {
  const sp = searchParams ?? {};

  const meRes = await apiFetch('/api/v1/auth/me');
  const me = (await meRes.json()) as { roles?: string[] };
  const roles = me.roles ?? [];
  const isPrivileged = roles.includes('HR') || roles.includes('Admin');

  const batchesRes = await apiFetch('/api/v1/campus/batches');
  const batchesJson = (await batchesRes.json()) as any;
  const batches: Batch[] = Array.isArray(batchesJson?.value) ? batchesJson.value : batchesJson;

  const selectedBatchId = sp.batchId || batches[0]?.id;

  const candidatesRes = selectedBatchId
    ? await apiFetch(`/api/v1/campus/candidates?batchId=${encodeURIComponent(selectedBatchId)}`)
    : null;
  const candidatesJson = candidatesRes ? ((await candidatesRes.json()) as any) : [];
  const candidates: Candidate[] = Array.isArray(candidatesJson?.value) ? candidatesJson.value : candidatesJson;

  const interviewers: Interviewer[] = isPrivileged
    ? (((await (await apiFetch('/api/v1/campus/interviewers')).json()) as any) as Interviewer[])
    : [];

  const groupsRes = selectedBatchId
    ? await apiFetch(`/api/v1/campus/gd/groups?batchId=${encodeURIComponent(selectedBatchId)}`)
    : null;
  const groupsJson = groupsRes ? ((await groupsRes.json()) as any) : [];
  const groups: GdGroup[] = Array.isArray(groupsJson?.value) ? groupsJson.value : groupsJson;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">GD Rounds</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {isPrivileged ? 'Create groups, assign candidates, and evaluate' : 'Submit GD evaluations'}
          </p>
        </div>
      </div>

      {/* Batch filter */}
      <form action="/campus/gd" method="GET" className="flex items-end gap-3">
        <div className="min-w-[200px] flex-1 max-w-xs">
          <Select name="batchId" label="Batch" defaultValue={selectedBatchId ?? ''}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary" size="sm">Load</Button>
      </form>

      {/* Create group (HR only) */}
      {isPrivileged ? (
        <Card>
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Create GD group</h3>
          <form action={createGroup} className="grid gap-3">
            <input type="hidden" name="batchId" value={selectedBatchId ?? ''} />
            <div className="grid gap-3 md:grid-cols-2">
              <Input name="name" label="Group name" placeholder="Group A" />
              <Input name="capacity" label="Capacity" type="number" min={1} defaultValue={10} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <MultiSelect name="candidateIds" label="Candidates (optional)" hint="Ctrl/Cmd to multi-select">
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName}{c.email ? ` - ${c.email}` : ''}</option>
                ))}
              </MultiSelect>
              <MultiSelect name="interviewerUserIds" label="Interviewers (optional)" hint="Ctrl/Cmd to multi-select">
                {interviewers.map((u) => (
                  <option key={u.id} value={u.id}>{u.email}</option>
                ))}
              </MultiSelect>
            </div>
            <Button type="submit" variant="primary" size="sm">Create group</Button>
          </form>
        </Card>
      ) : null}

      {/* Auto-create (HR only) */}
      {isPrivileged ? (
        <Card>
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Auto-create groups</h3>
          <form action={autoCreateGroups} className="grid gap-3">
            <input type="hidden" name="batchId" value={selectedBatchId ?? ''} />
            <div className="grid gap-3 md:grid-cols-3">
              <Input name="groupSize" label="Candidates per group" type="number" min={1} max={500} defaultValue={10} />
              <label className="flex items-center gap-2 text-sm text-zinc-400 md:pt-6">
                <input name="onlyUnassigned" type="checkbox" defaultChecked className="h-3.5 w-3.5 rounded" />
                Only unassigned
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-400 md:pt-6">
                <input name="replaceExisting" type="checkbox" className="h-3.5 w-3.5 rounded" />
                Replace existing
              </label>
            </div>
            <MultiSelect name="interviewerUserIds" label="Interviewer pool (optional)" hint="Round-robin assignment">
              {interviewers.map((u) => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </MultiSelect>
            <Button type="submit" variant="secondary" size="sm">Auto-create</Button>
          </form>
        </Card>
      ) : null}

      {/* Groups table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-400">Groups</h2>
          <Badge tone="neutral">{groups.length}</Badge>
        </div>

        {groups.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500 text-center py-4">No groups yet for this batch.</p>
          </Card>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Group</Th>
                <Th>Candidates</Th>
                <Th>Interviewers</Th>
                <Th>Evaluations</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <Td className="font-medium text-zinc-200">{g.name}</Td>
                  <Td className="tabular-nums">{g._count?.candidates ?? g.candidates?.length ?? 0}/{g.capacity}</Td>
                  <Td className="tabular-nums">{g._count?.interviewers ?? g.interviewers?.length ?? 0}</Td>
                  <Td className="tabular-nums">{g._count?.evaluations ?? 0}</Td>
                  <Td className="text-zinc-500 text-xs">{new Date(g.createdAt).toLocaleDateString()}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {/* Group actions + evaluation */}
      {groups.map((g) => (
        <Card key={`${g.id}-actions`}>
          <h3 className="text-sm font-medium text-zinc-200 mb-3">{g.name}</h3>
          <div className="space-y-4">
            {isPrivileged ? (
              <div className="grid gap-3 md:grid-cols-2">
                <form action={addCandidates} className="grid gap-2">
                  <input type="hidden" name="gdGroupId" value={g.id} />
                  <MultiSelect name="candidateIds" label="Add candidates" hint="Batch candidates">
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>{c.fullName}</option>
                    ))}
                  </MultiSelect>
                  <Button type="submit" variant="secondary" size="sm">Add</Button>
                </form>
                <form action={addInterviewers} className="grid gap-2">
                  <input type="hidden" name="gdGroupId" value={g.id} />
                  <MultiSelect name="interviewerUserIds" label="Add interviewers">
                    {interviewers.map((u) => (
                      <option key={u.id} value={u.id}>{u.email}</option>
                    ))}
                  </MultiSelect>
                  <Button type="submit" variant="secondary" size="sm">Add</Button>
                </form>
              </div>
            ) : null}

            <form action={submitEvaluation} className="grid gap-3 border-t border-zinc-800 pt-3">
              <input type="hidden" name="gdGroupId" value={g.id} />
              <div className="grid gap-3 md:grid-cols-2">
                <Select name="candidateId" label="Evaluate candidate" defaultValue={g.candidates?.[0]?.candidate.id ?? ''}>
                  {(g.candidates ?? []).map((gc) => (
                    <option key={gc.candidate.id} value={gc.candidate.id}>{gc.candidate.fullName}</option>
                  ))}
                </Select>
                <label className="flex items-center gap-2 text-sm text-zinc-400 md:pt-6">
                  <input name="shortlisted" type="checkbox" className="h-3.5 w-3.5 rounded" />
                  Shortlisted
                </label>
              </div>
              <Textarea name="notes" label="Notes (optional)" placeholder="Key observations..." />
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                <Input name="communication" label="Communication" type="number" min={0} max={10} placeholder="0-10" />
                <Input name="leadership" label="Leadership" type="number" min={0} max={10} placeholder="0-10" />
                <Input name="confidence" label="Confidence" type="number" min={0} max={10} placeholder="0-10" />
                <Input name="collaboration" label="Collaboration" type="number" min={0} max={10} placeholder="0-10" />
              </div>
              <Button type="submit" variant="primary" size="sm" disabled={!g.candidates?.length}>Submit evaluation</Button>
            </form>
          </div>
        </Card>
      ))}
    </div>
  );
}