import { apiFetch } from '../../../lib/api';
import { Badge } from '../../../ui/badge';
import { Card } from '../../../ui/card';
import { Table, Td, Th } from '../../../ui/table';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BatchesActionsClient } from './BatchesActionsClient';

type Batch = {
  id: string;
  name: string;
  createdAt: string;
  college?: { name: string };
  job?: { title: string };
  _count?: { candidates: number; gdGroups: number; interviewAssignments: number };
};

type Lookups = {
  colleges: { id: string; code: string; name: string }[];
  jobs: { id: string; title: string }[];
  flows: { id: string; name: string; version: number; isActive: boolean; college?: { name: string; code: string } }[];
};

const CreateBatchSchema = z.object({
  name: z.string().min(2),
  collegeId: z.union([z.string().uuid(), z.string().startsWith('dir:')]),
  jobId: z.string().uuid(),
  flowId: z.string().uuid(),
  startsAt: z.string().optional(),
});

function decodeDirectoryRef(ref: string) {
  const b64 = ref.slice('dir:'.length);
  const json = decodeURIComponent(Buffer.from(b64, 'base64').toString('utf8'));
  return JSON.parse(json) as {
    name: string;
    countryCode?: string;
    stateName?: string;
    districtName?: string;
    universityName?: string;
    collegeType?: string;
  };
}

async function createBatch(formData: FormData) {
  'use server';

  const parsed = CreateBatchSchema.safeParse({
    name: String(formData.get('name') ?? ''),
    collegeId: String(formData.get('collegeId') ?? ''),
    jobId: String(formData.get('jobId') ?? ''),
    flowId: String(formData.get('flowId') ?? ''),
    startsAt: String(formData.get('startsAt') ?? '') || undefined,
  });

  if (!parsed.success) {
    redirect(`/campus/batches?error=${encodeURIComponent('Invalid input')}`);
  }

  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt).toISOString() : undefined;

  let collegeId = parsed.data.collegeId;
  if (collegeId.startsWith('dir:')) {
    const dir = decodeDirectoryRef(collegeId);
    const state = [dir.stateName, dir.districtName, dir.universityName, dir.collegeType].filter(Boolean).join(' • ');
    const ensured = await apiFetch('/api/v1/campus/colleges/ensure', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: dir.name, countryCode: dir.countryCode, state: state || undefined }),
    });
    const ensuredJson = (await ensured.json()) as any;
    collegeId = String(ensuredJson?.id ?? '');
    if (!collegeId) {
      redirect(`/campus/batches?error=${encodeURIComponent('Failed to create college')}`);
    }
  }

  try {
    await apiFetch('/api/v1/campus/batches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: parsed.data.name,
        collegeId,
        jobId: parsed.data.jobId,
        flowId: parsed.data.flowId,
        startsAt,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Create failed';
    redirect(`/campus/batches?error=${encodeURIComponent(msg)}`);
  }

  redirect('/campus/batches?created=1');
}

export default async function BatchesPage() {
  const res = await apiFetch('/api/v1/campus/batches');
  const json = (await res.json()) as any;
  const batches: Batch[] = Array.isArray(json?.value) ? json.value : json;

  const lookupsRes = await apiFetch('/api/v1/campus/lookups');
  const lookups = (await lookupsRes.json()) as Lookups;

  return (
    <div className="space-y-5">
      <BatchesActionsClient lookups={lookups} createBatchAction={createBatch} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-400">All batches</h2>
          <Badge tone="neutral">{batches.length}</Badge>
        </div>

        {batches.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500 text-center py-6">No batches yet. Create one to get started.</p>
          </Card>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>College</Th>
                <Th>Job</Th>
                <Th>Candidates</Th>
                <Th>GD</Th>
                <Th>Interviews</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <Td className="font-medium text-zinc-200">
                    <span className="truncate block max-w-[200px]">{b.name}</span>
                  </Td>
                  <Td>
                    <span className="truncate block max-w-[180px]">{b.college?.name ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="truncate block max-w-[140px]">{b.job?.title ?? '—'}</span>
                  </Td>
                  <Td className="text-center tabular-nums">{b._count?.candidates ?? 0}</Td>
                  <Td className="text-center tabular-nums">{b._count?.gdGroups ?? 0}</Td>
                  <Td className="text-center tabular-nums">{b._count?.interviewAssignments ?? 0}</Td>
                  <Td className="text-zinc-500 text-xs whitespace-nowrap">{new Date(b.createdAt).toLocaleDateString()}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
