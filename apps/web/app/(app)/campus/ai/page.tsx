import { apiFetch } from '../../../lib/api';
import { Button } from '../../../ui/button';
import { Card } from '../../../ui/card';
import { Select } from '../../../ui/select';
import { LiveAiInterview } from './_live-interview';

type Batch = { id: string; name: string };
type Candidate = { id: string; fullName: string; email?: string | null; batchId: string };

export default async function AiPage({
  searchParams,
}: {
  searchParams?: Promise<{ batchId?: string; candidateId?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const batchesRes = await apiFetch('/api/v1/campus/batches');
  const batchesJson = (await batchesRes.json()) as any;
  const batches: Batch[] = Array.isArray(batchesJson?.value) ? batchesJson.value : batchesJson;

  const selectedBatchId = resolvedSearchParams?.batchId || batches[0]?.id;

  const candidatesRes = selectedBatchId
    ? await apiFetch(`/api/v1/campus/candidates?batchId=${encodeURIComponent(selectedBatchId)}`)
    : null;
  const candidatesJson = candidatesRes ? ((await candidatesRes.json()) as any) : [];
  const candidates: Candidate[] = Array.isArray(candidatesJson?.value) ? candidatesJson.value : candidatesJson;

  const selectedCandidateId = resolvedSearchParams?.candidateId;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">AI Interviews</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Start a session, submit answers, and get an evaluation.</p>
      </div>

      {/* Batch/candidate filter */}
      <form action="/campus/ai" method="GET" className="flex items-end gap-3 flex-wrap">
        <div className="min-w-[180px] flex-1 max-w-xs">
          <Select name="batchId" label="Batch" defaultValue={selectedBatchId ?? ''}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </div>
        <div className="min-w-[180px] flex-1 max-w-xs">
          <Select name="candidateId" label="Candidate (optional)" defaultValue={selectedCandidateId ?? ''}>
            <option value="">All candidates</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.fullName}</option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary" size="sm">Load</Button>
      </form>

      {/* Live interview */}
      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Live AI Interview</h3>
        {candidates.length ? (
          <LiveAiInterview candidates={candidates} defaultCandidateId={selectedCandidateId ?? candidates[0]?.id} />
        ) : (
          <p className="text-sm text-zinc-500">
            No candidates found for this batch. Create one in the Candidates page first.
          </p>
        )}
      </Card>
    </div>
  );
}
