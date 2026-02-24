import { apiFetch } from '../../../lib/api';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';
import { Card } from '../../../ui/card';
import { Input } from '../../../ui/input';
import { Select } from '../../../ui/select';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { CandidatesTableClient } from './CandidatesTableClient';
import { CandidatesActionsClient } from './CandidatesActionsClient';

type Candidate = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  createdAt: string;
};

type BatchOption = { id: string; name: string; college?: { name: string }; job?: { title: string } };

type FlowStage = { key: string; name: string; kind: string; order: number };
type ProgressionItem = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  createdAt: string;
  batch: {
    id: string;
    name: string;
    flow: {
      id: string;
      name: string;
      version: number;
      stages: FlowStage[];
      transitions: { fromStageKey: string; toStageKey: string }[];
    };
  };
  currentStageKey: string | null;
  possibleNextStageKeys: string[];
};

const CreateCandidateSchema = z.object({
  batchId: z.string().uuid(),
  fullName: z.string().min(2),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  rollNumber: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
  resumeUrl: z.string().url().optional().or(z.literal('')),
});

function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function detectDelimiter(sampleLine: string): string {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestScore = 0;

  for (const d of candidates) {
    let inQuotes = false;
    let count = 0;
    for (let i = 0; i < sampleLine.length; i++) {
      const ch = sampleLine[i];
      if (ch === '"') {
        if (inQuotes && sampleLine[i + 1] === '"') {
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && ch === d) count++;
    }
    if (count > bestScore) {
      bestScore = count;
      best = d;
    }
  }

  return best;
}

function toIntOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickCol(row: string[], idx: number): string {
  if (idx < 0) return '';
  return (row[idx] ?? '').trim();
}

async function createCandidate(formData: FormData) {
  'use server';

  const parsed = CreateCandidateSchema.safeParse({
    batchId: String(formData.get('batchId') ?? ''),
    fullName: String(formData.get('fullName') ?? ''),
    email: String(formData.get('email') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    rollNumber: String(formData.get('rollNumber') ?? ''),
    department: String(formData.get('department') ?? ''),
    resumeUrl: String(formData.get('resumeUrl') ?? ''),
  });

  if (!parsed.success) {
    redirect(`/campus/candidates?error=${encodeURIComponent('Invalid input')}`);
  }

  const dto = {
    batchId: parsed.data.batchId,
    fullName: parsed.data.fullName,
    email: parsed.data.email || undefined,
    phone: parsed.data.phone || undefined,
    rollNumber: parsed.data.rollNumber || undefined,
    department: parsed.data.department || undefined,
    resumeUrl: parsed.data.resumeUrl || undefined,
  };

  try {
    await apiFetch('/api/v1/campus/candidates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(dto),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Create failed';
    redirect(`/campus/candidates?error=${encodeURIComponent(msg)}`);
  }

  redirect('/campus/candidates?created=1');
}

async function importCandidates(formData: FormData) {
  'use server';

  const batchId = String(formData.get('batchId') ?? '');
  const file = formData.get('file');
  const rawFromFile = file instanceof File && file.size > 0 ? await file.text() : '';
  const raw = (rawFromFile || String(formData.get('csv') ?? ''))
    .replace(/^\uFEFF/, '')
    .trim();

  if (!batchId) redirect(`/campus/candidates?error=${encodeURIComponent('Batch is required')}`);
  if (!raw) redirect(`/campus/candidates?error=${encodeURIComponent('CSV file or pasted CSV is required')}`);

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 1) redirect(`/campus/candidates?error=${encodeURIComponent('CSV must include at least one row')}`);

  const delimiter = String(formData.get('delimiter') ?? '') || detectDelimiter(lines[0] ?? '');
  const hasHeader = String(formData.get('hasHeader') ?? '').toLowerCase() === 'true';

  if (hasHeader && lines.length < 2) {
    redirect(`/campus/candidates?error=${encodeURIComponent('Header detected but no data rows found')}`);
  }

  const mapFullName = toIntOr(formData.get('mapFullName'), -1);
  const mapFirstName = toIntOr(formData.get('mapFirstName'), -1);
  const mapLastName = toIntOr(formData.get('mapLastName'), -1);
  const mapEmail = toIntOr(formData.get('mapEmail'), -1);
  const mapPhone = toIntOr(formData.get('mapPhone'), -1);
  const mapRollNumber = toIntOr(formData.get('mapRollNumber'), -1);
  const mapDepartment = toIntOr(formData.get('mapDepartment'), -1);
  const mapResumeUrl = toIntOr(formData.get('mapResumeUrl'), -1);

  const dataLines = hasHeader ? lines.slice(1) : lines;

  const mapped = dataLines.map((line) => {
    const cols = parseCsvLine(line, delimiter);

    const fullNameDirect = pickCol(cols, mapFullName);
    const first = pickCol(cols, mapFirstName);
    const last = pickCol(cols, mapLastName);

    const fullName = fullNameDirect || [first, last].filter(Boolean).join(' ').trim();

    return {
      batchId,
      fullName,
      email: pickCol(cols, mapEmail) || undefined,
      phone: pickCol(cols, mapPhone) || undefined,
      rollNumber: pickCol(cols, mapRollNumber) || undefined,
      department: pickCol(cols, mapDepartment) || undefined,
      resumeUrl: pickCol(cols, mapResumeUrl) || undefined,
    };
  });

  if (mapped.some((c) => !c.fullName)) {
    redirect(
      `/campus/candidates?error=${encodeURIComponent(
        'Some rows are missing a name. Map a Full name column (or First/Last name), then re-import.',
      )}`,
    );
  }

  try {
    await apiFetch('/api/v1/campus/candidates/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidates: mapped }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Import failed';
    redirect(`/campus/candidates?error=${encodeURIComponent(msg)}`);
  }

  redirect('/campus/candidates?imported=1');
}

async function transitionCandidate(formData: FormData) {
  'use server';

  const candidateId = String(formData.get('candidateId') ?? '');
  const toStageKey = String(formData.get('toStageKey') ?? '');
  const batchId = String(formData.get('batchId') ?? '');

  if (!candidateId || !toStageKey) {
    redirect(`/campus/candidates?error=${encodeURIComponent('Candidate + next stage required')}`);
  }

  try {
    await apiFetch(`/api/v1/campus/candidates/${encodeURIComponent(candidateId)}/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ toStageKey }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Transition failed';
    redirect(`/campus/candidates?error=${encodeURIComponent(msg)}&batchId=${encodeURIComponent(batchId)}`);
  }

  redirect(`/campus/candidates?batchId=${encodeURIComponent(batchId)}&moved=1`);
}

async function deleteCandidate(formData: FormData) {
  'use server';

  const candidateId = String(formData.get('candidateId') ?? '');
  const batchId = String(formData.get('batchId') ?? '');

  if (!candidateId) {
    redirect(`/campus/candidates?error=${encodeURIComponent('Candidate is required')}&batchId=${encodeURIComponent(batchId)}`);
  }

  try {
    await apiFetch(`/api/v1/campus/candidates/${encodeURIComponent(candidateId)}`, {
      method: 'DELETE',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Delete failed';
    redirect(`/campus/candidates?error=${encodeURIComponent(msg)}&batchId=${encodeURIComponent(batchId)}`);
  }

  redirect(`/campus/candidates?batchId=${encodeURIComponent(batchId)}&deleted=1`);
}

async function bulkTransition(formData: FormData) {
  'use server';

  const batchId = String(formData.get('batchId') ?? '');
  const toStageKey = String(formData.get('toStageKey') ?? '');
  const raw = String(formData.get('candidateIds') ?? '');
  const candidateIds = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!batchId || !toStageKey || !candidateIds.length) {
    redirect(`/campus/candidates?error=${encodeURIComponent('Select candidates + stage')}&batchId=${encodeURIComponent(batchId)}`);
  }

  try {
    await apiFetch('/api/v1/campus/candidates/bulk-transition', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateIds, toStageKey }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bulk transition failed';
    redirect(`/campus/candidates?error=${encodeURIComponent(msg)}&batchId=${encodeURIComponent(batchId)}`);
  }

  redirect(`/campus/candidates?batchId=${encodeURIComponent(batchId)}&bulkMoved=1`);
}

async function bulkDeleteCandidates(formData: FormData) {
  'use server';

  const batchId = String(formData.get('batchId') ?? '');
  const raw = String(formData.get('candidateIds') ?? '');
  const candidateIds = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!batchId || !candidateIds.length) {
    redirect(`/campus/candidates?error=${encodeURIComponent('Select candidates to delete')}&batchId=${encodeURIComponent(batchId)}`);
  }

  try {
    await apiFetch('/api/v1/campus/candidates/bulk-delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateIds }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Bulk delete failed';
    redirect(`/campus/candidates?error=${encodeURIComponent(msg)}&batchId=${encodeURIComponent(batchId)}`);
  }

  redirect(`/campus/candidates?batchId=${encodeURIComponent(batchId)}&bulkDeleted=1`);
}

async function uploadCandidateResume(formData: FormData) {
  'use server';

  const candidateId = String(formData.get('candidateId') ?? '');
  const batchId = String(formData.get('batchId') ?? '');
  const file = formData.get('file');

  if (!candidateId) {
    redirect(`/campus/candidates?error=${encodeURIComponent('Candidate is required')}&batchId=${encodeURIComponent(batchId)}`);
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/campus/candidates?error=${encodeURIComponent('Missing resume file')}&batchId=${encodeURIComponent(batchId)}`);
  }

  const fd = new FormData();
  fd.set('file', file);

  try {
    await apiFetch(`/api/v1/campus/candidates/${encodeURIComponent(candidateId)}/resume`, {
      method: 'POST',
      body: fd,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Resume upload failed';
    redirect(`/campus/candidates?error=${encodeURIComponent(msg)}&batchId=${encodeURIComponent(batchId)}`);
  }

  redirect(`/campus/candidates?batchId=${encodeURIComponent(batchId)}&resumeUploaded=1`);
}

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams?: Promise<{ batchId?: string; q?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const batchesRes = await apiFetch('/api/v1/campus/batches');
  const batchesJson = (await batchesRes.json()) as any;
  const batches: BatchOption[] = Array.isArray(batchesJson?.value) ? batchesJson.value : batchesJson;
  const selectedBatchId = sp.batchId || batches[0]?.id || '';

  const progRes = selectedBatchId
    ? await apiFetch(`/api/v1/campus/candidates/progression?batchId=${encodeURIComponent(selectedBatchId)}`)
    : await apiFetch('/api/v1/campus/candidates/progression');
  const progressionAll = (await progRes.json()) as ProgressionItem[];

  const q = (sp.q ?? '').trim().toLowerCase();
  const progression = q
    ? progressionAll.filter((c) =>
        [c.fullName, c.email ?? '', c.phone ?? ''].some((v) => String(v).toLowerCase().includes(q)),
      )
    : progressionAll;

  const stages: FlowStage[] = progression[0]?.batch?.flow?.stages ?? [];

  return (
    <div className="space-y-5">
      <CandidatesActionsClient
        batches={batches}
        selectedBatchId={selectedBatchId}
        createCandidateAction={createCandidate}
        importCandidatesAction={importCandidates}
      />

      {/* Filters */}
      <form action="/campus/candidates" method="GET" className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1 max-w-xs">
          <Select name="batchId" label="Batch" defaultValue={selectedBatchId}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}{b.college?.name ? ` — ${b.college.name}` : ''}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[180px] flex-1 max-w-xs">
          <Input name="q" label="Search" placeholder="Name, email, phone…" defaultValue={sp.q ?? ''} />
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Apply
        </Button>
      </form>

      {/* Stage progression */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-400">Stage progression</h2>
          <Badge tone="neutral">{progression.length} candidates</Badge>
        </div>

        <CandidatesTableClient
          items={progression}
          stages={stages}
          selectedBatchId={selectedBatchId}
          transitionAction={transitionCandidate}
          uploadResumeAction={uploadCandidateResume}
          bulkTransitionAction={bulkTransition}
          deleteAction={deleteCandidate}
          bulkDeleteAction={bulkDeleteCandidates}
        />
      </div>
    </div>
  );
}
