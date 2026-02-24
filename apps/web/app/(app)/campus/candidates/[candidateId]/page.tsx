import { apiFetch } from '../../../../lib/api';
import { env } from '../../../../lib/env';
import { Badge } from '../../../../ui/badge';
import { Button } from '../../../../ui/button';
import { Card } from '../../../../ui/card';
import { Table, Td, Th } from '../../../../ui/table';
import { redirect } from 'next/navigation';

type CandidateDetails = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  rollNumber?: string | null;
  resumeUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  stageStates: { stageKey: string; status: string; createdAt: string; updatedAt: string }[];
  batch: {
    id: string;
    name: string;
    college?: { name: string; code: string } | null;
    job?: { title: string } | null;
    flow: {
      id: string;
      name: string;
      version: number;
      stages: { key: string; name: string; kind: string; order: number }[];
      transitions: { fromStageKey: string; toStageKey: string }[];
    };
  };
  gdMemberships: { gdGroup: { id: string; name: string } }[];
  gdEvaluations: {
    id: string;
    shortlisted: boolean;
    notes?: string | null;
    metrics: any;
    createdAt: string;
    gdGroup: { id: string; name: string };
    evaluator: { id: string; email: string };
  }[];
  interviews: {
    id: string;
    mode: 'ONLINE' | 'OFFLINE';
    scheduledAt?: string | null;
    createdAt: string;
    interviewer: { id: string; email: string };
    feedback?: {
      recommendation: string;
      notes?: string | null;
      scores?: any;
      createdAt: string;
    } | null;
  }[];
  insights?: {
    currentStageKey: string | null;
    currentStageName: string | null;
    daysInStage: number | null;
    pendingInterviewFeedback: number;
  };
};

export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;

  async function uploadResume(formData: FormData) {
    'use server';
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      throw new Error('Missing resume file');
    }

    const fd = new FormData();
    fd.set('file', file);

    await apiFetch(`/api/v1/campus/candidates/${encodeURIComponent(candidateId)}/resume`, {
      method: 'POST',
      body: fd,
    });

    redirect(`/campus/candidates/${encodeURIComponent(candidateId)}`);
  }

  const res = await apiFetch(`/api/v1/campus/candidates/${encodeURIComponent(candidateId)}`);
  const c = (await res.json()) as CandidateDetails;

  const stageNameByKey = new Map(c.batch.flow.stages.map((s) => [s.key, s.name] as const));
  const currentStageLabel = c.insights?.currentStageName ?? (c.insights?.currentStageKey ? stageNameByKey.get(c.insights.currentStageKey) : null);

  const apiBase = env().ROZGA_API_BASE_URL;
  const resumeHref = c.resumeUrl
    ? (c.resumeUrl.startsWith('http') ? c.resumeUrl : `${apiBase}${c.resumeUrl}`)
    : null;

  const created = new Date(c.createdAt).toLocaleDateString();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xl font-semibold text-zinc-100">{c.fullName}</div>
          <div className="mt-1 text-sm text-zinc-500">
            {c.email ?? '—'}{c.phone ? ` • ${c.phone}` : ''}{c.department ? ` • ${c.department}` : ''}
          </div>
          <div className="mt-2 text-xs text-zinc-600">Created {created}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{currentStageLabel ?? c.insights?.currentStageKey ?? 'No stage'}</Badge>
          {typeof c.insights?.daysInStage === 'number' ? <Badge tone="neutral">{c.insights.daysInStage}d in stage</Badge> : null}
          {c.insights?.pendingInterviewFeedback ? <Badge tone="warn">{c.insights.pendingInterviewFeedback} pending feedback</Badge> : null}
        </div>
      </div>

      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Quick info</h3>
        <div className="grid gap-2 text-sm text-zinc-400">
          <div>
            <span className="text-zinc-600">Batch:</span> {c.batch.name}
          </div>
          <div>
            <span className="text-zinc-600">Flow:</span> {c.batch.flow.name} (v{c.batch.flow.version})
          </div>
          <div>
            <span className="text-zinc-600">College:</span> {c.batch.college?.name ?? '—'}
          </div>
          <div>
            <span className="text-zinc-600">Job:</span> {c.batch.job?.title ?? '—'}
          </div>
          {c.resumeUrl ? (
            <div>
              <a className="text-zinc-200 underline underline-offset-2" href={resumeHref ?? undefined} target="_blank" rel="noreferrer">
                Open resume
              </a>
            </div>
          ) : null}

          <div className="mt-3">
            <form action={uploadResume} className="flex flex-wrap items-center gap-2">
              <input
                className="text-sm text-zinc-300"
                type="file"
                name="file"
                accept=".pdf,.doc,.docx,.txt"
                required
              />
              <Button type="submit" variant="secondary">
                Upload resume
              </Button>
            </form>
            <div className="mt-1 text-xs text-zinc-600">Stores file and sets resumeUrl for AI grounding.</div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Stage states</h3>
        <Table>
          <thead>
            <tr>
              <Th>Stage</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {c.stageStates.map((s) => (
              <tr key={`${s.stageKey}-${s.updatedAt}`}>
                <Td className="font-medium text-zinc-200">{stageNameByKey.get(s.stageKey) ?? s.stageKey}</Td>
                <Td>{s.status}</Td>
                <Td className="text-zinc-500">{new Date(s.updatedAt).toLocaleDateString()}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-300">GD</h3>
            <Badge tone="neutral">{c.gdEvaluations.length}</Badge>
          </div>
          <div className="grid gap-3 text-sm text-zinc-400">
            <div>
              <span className="text-zinc-600">Groups:</span>{' '}
              {c.gdMemberships.length ? c.gdMemberships.map((m) => m.gdGroup.name).join(', ') : '—'}
            </div>
            {c.gdEvaluations.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Group</Th>
                    <Th>Result</Th>
                    <Th>Evaluator</Th>
                  </tr>
                </thead>
                <tbody>
                  {c.gdEvaluations.slice(0, 5).map((e) => (
                    <tr key={e.id}>
                      <Td className="text-zinc-200">{e.gdGroup.name}</Td>
                      <Td>{e.shortlisted ? 'Shortlisted' : 'Not shortlisted'}</Td>
                      <Td className="text-zinc-400">{e.evaluator.email}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <div>No GD evaluations yet.</div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-zinc-300">Interviews</h3>
            <Badge tone="neutral">{c.interviews.length}</Badge>
          </div>
          {c.interviews.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Interviewer</Th>
                  <Th>Mode</Th>
                  <Th>Feedback</Th>
                </tr>
              </thead>
              <tbody>
                {c.interviews.slice(0, 8).map((a) => (
                  <tr key={a.id}>
                    <Td className="text-zinc-200">{a.interviewer.email}</Td>
                    <Td>{a.mode}</Td>
                    <Td>{a.feedback ? a.feedback.recommendation : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="text-sm text-zinc-400">No interview assignments yet.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
