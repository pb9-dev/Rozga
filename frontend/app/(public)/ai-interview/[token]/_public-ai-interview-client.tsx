'use client';

import { useMemo, useState } from 'react';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';
import { Card } from '../../../ui/card';
import { Textarea } from '../../../ui/textarea';
import { ResumeUpload } from '../../interview/[token]/_resume-upload';

type StartResponse = {
  sessionId: string;
  status: 'ACTIVE' | 'ENDED';
  nextPrompt?: string;
  limits?: { maxQuestions: number; maxFollowUps: number; maxTotalTurns: number };
};

type Turn = {
  index?: number;
  kind: string;
  speaker: 'ASSISTANT' | 'CANDIDATE' | 'SYSTEM';
  content: string;
  meta?: unknown;
};

type Evaluation = {
  technicalDepthScore: number;
  problemSolvingScore: number;
  communicationScore: number;
  strengths: string[];
  weaknesses: string[];
  summary: string;
};

type GetSessionResponse = {
  id: string;
  status: 'ACTIVE' | 'ENDED';
  roleTitle: string;
  limits: { maxQuestions: number; maxFollowUps: number; maxTotalTurns: number };
  startedAt: string;
  endedAt: string | null;
  transcript: Turn[];
  evaluation: Evaluation | null;
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function PublicAiInterviewClient(props: {
  token: string;
  apiOrigin: string;
  candidateName: string | null;
  batchName: string | null;
  scheduledAt: string | null;
  existingResumeUrl: string | null;
}) {
  const { token, apiOrigin, candidateName, batchName, scheduledAt } = props;

  const [resumeUrl, setResumeUrl] = useState<string | null>(props.existingResumeUrl ?? null);

  const [sessionId, setSessionId] = useState<string>('');
  const [status, setStatus] = useState<'IDLE' | 'ACTIVE' | 'ENDED'>('IDLE');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState<string>('');
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canStart = !!resumeUrl && !loading && status === 'IDLE';
  const canAnswer = status === 'ACTIVE' && !!sessionId && !loading;

  const lastAssistantPrompt = useMemo(() => {
    const last = [...turns].reverse().find((t) => t.speaker === 'ASSISTANT');
    return last?.content ?? '';
  }, [turns]);

  async function refreshSession(id: string) {
    const out = await jsonFetch<GetSessionResponse>(`/api/public/ai-interview/${encodeURIComponent(token)}/sessions/${encodeURIComponent(id)}`);
    setStatus(out.status === 'ENDED' ? 'ENDED' : 'ACTIVE');
    setTurns(out.transcript ?? []);
    setEvaluation(out.evaluation);
  }

  async function onStart() {
    setError(null);
    setLoading(true);
    try {
      const out = await jsonFetch<StartResponse>(`/api/public/ai-interview/${encodeURIComponent(token)}/sessions`, { method: 'POST' });
      setSessionId(out.sessionId);
      setStatus(out.status === 'ENDED' ? 'ENDED' : 'ACTIVE');
      await refreshSession(out.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitAnswer() {
    if (!sessionId) return;
    const trimmed = answer.trim();
    if (!trimmed) return;

    setError(null);
    setLoading(true);
    try {
      await jsonFetch<unknown>(`/api/public/ai-interview/${encodeURIComponent(token)}/sessions/${encodeURIComponent(sessionId)}/answer`, {
        method: 'POST',
        body: JSON.stringify({ answer: trimmed }),
      });
      setAnswer('');
      await refreshSession(sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit answer');
    } finally {
      setLoading(false);
    }
  }

  async function onEnd() {
    if (!sessionId) return;

    setError(null);
    setLoading(true);
    try {
      await jsonFetch<unknown>(`/api/public/ai-interview/${encodeURIComponent(token)}/sessions/${encodeURIComponent(sessionId)}/end`, {
        method: 'POST',
      });
      await refreshSession(sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to end');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xl font-semibold text-zinc-100">AI Interview</div>
        <div className="text-sm text-zinc-500">{batchName ? `Batch: ${batchName}` : 'Please answer clearly and concisely.'}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status === 'ACTIVE' ? 'good' : status === 'ENDED' ? 'neutral' : 'neutral'}>{status}</Badge>
        {candidateName ? <Badge tone="neutral">Candidate: {candidateName}</Badge> : null}
        {scheduledAt ? <Badge tone="neutral">Scheduled: {new Date(scheduledAt).toLocaleDateString()}</Badge> : null}
        {sessionId ? <Badge tone="neutral">Session: {sessionId.slice(0, 8)}</Badge> : null}
      </div>

      <ResumeUpload
        token={token}
        apiOrigin={apiOrigin}
        existingResumeUrl={resumeUrl}
        onUploaded={(url) => {
          setResumeUrl(url);
          if (status === 'IDLE') setError(null);
        }}
      />

      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-1">Start the AI interview</h3>
        <p className="text-xs text-zinc-500 mb-4">
          {resumeUrl
            ? 'Resume uploaded. When you start, the first two questions will be based on your resume/projects, then JD-based questions.'
            : 'Resume upload is required before starting.'}
        </p>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onStart} disabled={!canStart}>
            {loading ? 'Starting\u2026' : 'Start interview'}
          </Button>
          <Button type="button" variant="secondary" onClick={onEnd} disabled={status !== 'ACTIVE' || loading}>
            End interview
          </Button>
        </div>
      </Card>

      {status === 'ACTIVE' ? (
        <Card>
          <h3 className="text-sm font-medium text-zinc-300 mb-1">Question</h3>
          <p className="text-sm text-zinc-400 mb-4">{lastAssistantPrompt || 'Waiting for the first question\u2026'}</p>

          <div className="grid gap-3">
            <Textarea label="Your answer" value={answer} onChange={(e) => setAnswer(e.currentTarget.value)} disabled={!canAnswer} />
            <div className="flex gap-2">
              <Button type="button" onClick={onSubmitAnswer} disabled={!canAnswer}>
                {loading ? 'Submitting\u2026' : 'Submit answer'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => refreshSession(sessionId)} disabled={!canAnswer}>
                Refresh
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {evaluation ? (
        <Card>
          <h3 className="text-sm font-medium text-zinc-300 mb-1">Evaluation</h3>
          <p className="text-sm text-zinc-400">{evaluation.summary}</p>
        </Card>
      ) : null}

      {error ? <div className="text-sm text-red-300">{error}</div> : null}
    </div>
  );
}