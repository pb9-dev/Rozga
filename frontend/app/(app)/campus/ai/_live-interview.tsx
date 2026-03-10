'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';
import { Card } from '../../../ui/card';
import { Input } from '../../../ui/input';
import { Select } from '../../../ui/select';
import { Textarea } from '../../../ui/textarea';

type Candidate = { id: string; fullName: string; email?: string | null };

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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

function readPath<T = unknown>(obj: Record<string, unknown> | null, path: string[]): T | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    const rec = asRecord(cur);
    if (!rec) return undefined;
    cur = rec[key];
  }
  return cur as T;
}

function formatMaybeNumber(n: unknown, digits = 2): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const f = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(f);
}

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

export function LiveAiInterview({ candidates, defaultCandidateId }: { candidates: Candidate[]; defaultCandidateId?: string }) {
  const [candidateId, setCandidateId] = useState(defaultCandidateId ?? candidates[0]?.id ?? '');
  const [roleTitle, setRoleTitle] = useState('Java Backend Engineer');
  const [seniority, setSeniority] = useState<'intern' | 'junior' | 'mid' | 'senior'>('junior');

  const [sessionId, setSessionId] = useState<string>('');
  const [status, setStatus] = useState<'IDLE' | 'ACTIVE' | 'ENDED'>('IDLE');
  const [nextPrompt, setNextPrompt] = useState<string>('');
  const [answer, setAnswer] = useState<string>('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);

  const [showDebug, setShowDebug] = useState(false);

  const [resumeId, setResumeId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCandidate = useMemo(
    () => candidates.find((c) => c.id === candidateId) ?? null,
    [candidates, candidateId],
  );

  async function onStart() {
    setError(null);
    setLoading(true);
    try {
      const out = await jsonFetch<StartResponse>('/api/campus/ai-interview/sessions', {
        method: 'POST',
        body: JSON.stringify({
          candidateId,
          roleTitle,
          seniority,
          maxQuestions: 3,
          maxFollowUps: 1,
          maxTotalTurns: 12,
        }),
      });

      setSessionId(out.sessionId);
      setStatus(out.status === 'ENDED' ? 'ENDED' : 'ACTIVE');
      setEvaluation(null);

      // Pull the canonical transcript from the server (includes agent metadata).
      await refreshSession(out.sessionId);
      setAnswer('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start');
    } finally {
      setLoading(false);
    }
  }

  async function refreshSession(id: string) {
    const out = await jsonFetch<GetSessionResponse>(`/api/campus/ai-interview/sessions/${encodeURIComponent(id)}`);
    setStatus(out.status === 'ENDED' ? 'ENDED' : 'ACTIVE');
    setTurns(out.transcript ?? []);
    setEvaluation(out.evaluation);

    if (out.status === 'ACTIVE') {
      const lastAssistant = [...(out.transcript ?? [])].reverse().find((t) => t.speaker === 'ASSISTANT');
      setNextPrompt(lastAssistant?.content ?? '');
    } else {
      setNextPrompt('');
    }
  }

  async function onSubmitAnswer() {
    if (!sessionId) return;

    const trimmed = answer.trim();
    if (!trimmed) return;

    setError(null);
    setLoading(true);

    try {
      const out = await jsonFetch<StartResponse | { sessionId: string; status: 'ACTIVE' | 'ENDED'; nextPrompt?: string; evaluation?: Evaluation }>(
        `/api/campus/ai-interview/sessions/${encodeURIComponent(sessionId)}/answer`,
        {
          method: 'POST',
          body: JSON.stringify({ answer: trimmed }),
        },
      );
      setAnswer('');

      // Always refresh from server so transcript is authoritative (and includes agent meta).
      await refreshSession((out as any).sessionId ?? sessionId);
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
      const out = await jsonFetch<{ sessionId: string; status: 'ENDED'; evaluation: Evaluation }>(
        `/api/campus/ai-interview/sessions/${encodeURIComponent(sessionId)}/end`,
        { method: 'POST' },
      );
      await refreshSession(out.sessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to end session');
    } finally {
      setLoading(false);
    }
  }

  async function onResume() {
    const id = resumeId.trim();
    if (!id) return;

    setError(null);
    setLoading(true);

    try {
      setSessionId(id);
      await refreshSession(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }

  const canStart = !!candidateId && roleTitle.trim().length >= 2 && !loading;
  const canAnswer = status === 'ACTIVE' && !!sessionId && !loading;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status === 'ACTIVE' ? 'good' : status === 'ENDED' ? 'neutral' : 'neutral'}>{status}</Badge>
        {sessionId ? <Badge tone="neutral">Session: {sessionId.slice(0, 8)}…</Badge> : null}
        {selectedCandidate ? (
          <Badge tone="neutral">
            Candidate: {selectedCandidate.fullName}
            {selectedCandidate.email ? ` (${selectedCandidate.email})` : ''}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Select
          label="Candidate"
          value={candidateId}
          onChange={(e) => setCandidateId(e.currentTarget.value)}
          disabled={loading || status !== 'IDLE'}
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}{c.email ? ` — ${c.email}` : ''}
            </option>
          ))}
        </Select>

        <Select
          label="Seniority"
          value={seniority}
          onChange={(e) => setSeniority(e.currentTarget.value as any)}
          disabled={loading || status !== 'IDLE'}
        >
          <option value="intern">intern</option>
          <option value="junior">junior</option>
          <option value="mid">mid</option>
          <option value="senior">senior</option>
        </Select>

        <div className="md:col-span-2">
          <Input
            label="Role title"
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.currentTarget.value)}
            disabled={loading || status !== 'IDLE'}
          />
        </div>

        <div className="md:col-span-2 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onStart} disabled={!canStart}>
            {loading ? 'Starting…' : 'Start demo interview'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => window.location.href = '/campus/candidates'} disabled={loading}>
            Manage candidates
          </Button>
        </div>
      </div>

      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Prompt</h3>
        <div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-200 whitespace-pre-wrap">
            {nextPrompt || '—'}
          </div>

          <div className="mt-4 grid gap-3">
            <Textarea
              label="Candidate answer"
              value={answer}
              onChange={(e) => setAnswer(e.currentTarget.value)}
              placeholder="Type the candidate answer here…"
              disabled={!canAnswer}
            />

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={onSubmitAnswer} disabled={!canAnswer || !answer.trim()}>
                {loading ? 'Sending…' : 'Submit answer'}
              </Button>
              <Button type="button" variant="ghost" onClick={onEnd} disabled={loading || status !== 'ACTIVE'}>
                End interview
              </Button>
            </div>

            {error ? (
              <div className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-400 whitespace-pre-wrap">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-300">Transcript</h3>
          <Badge tone="neutral">{turns.length}</Badge>
        </div>
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowDebug((v) => !v)}>
              {showDebug ? 'Hide debug meta' : 'Show debug meta'}
            </Button>
          </div>
          {turns.length ? (
            <div className="grid gap-2">
              {turns.map((t, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg border px-4 py-3 text-sm whitespace-pre-wrap ${
                    t.speaker === 'ASSISTANT'
                      ? 'border-zinc-800 bg-zinc-900/50'
                      : t.speaker === 'CANDIDATE'
                        ? 'border-indigo-900/40 bg-indigo-950/20'
                        : 'border-zinc-800 bg-zinc-950'
                  }`}
                >
                  <div className="mb-1 text-xs text-zinc-500">
                    {t.speaker} · {t.kind}
                  </div>
                  <div className="text-zinc-200">{t.content}</div>
                  {showDebug && t.meta ? (() => {
                    const meta = asRecord(t.meta);
                    const agent = readPath<string>(meta, ['agent']);
                    const questionIndex = readPath<number>(meta, ['questionIndex']);
                    const followUpIndex = readPath<number>(meta, ['followUpIndex']);

                    const nonAnswer = readPath<boolean>(meta, ['nonAnswer']);

                    const depthScore = readPath<number>(meta, ['depthProbe', 'answerDepthScore']);
                    const needsFollowUp = readPath<boolean>(meta, ['depthProbe', 'needsFollowUp']);

                    const intent = readPath<string>(meta, ['classifier', 'intent']);
                    const quality = readPath<string>(meta, ['classifier', 'quality']);
                    const shift = readPath<string>(meta, ['classifier', 'recommendedDifficultyShift']);
                    const cheating = readPath<boolean>(meta, ['classifier', 'cheatingSuspected']);
                    const confidence = readPath<number>(meta, ['classifier', 'confidence']);

                    const qDifficulty = readPath<string>(meta, ['question', 'difficulty']);

                    const hasSummary =
                      agent ||
                      typeof questionIndex === 'number' ||
                      typeof followUpIndex === 'number' ||
                      typeof nonAnswer === 'boolean' ||
                      typeof depthScore === 'number' ||
                      typeof needsFollowUp === 'boolean' ||
                      intent ||
                      quality ||
                      shift ||
                      typeof cheating === 'boolean' ||
                      typeof confidence === 'number' ||
                      qDifficulty;

                    return (
                      <div className="mt-2 grid gap-2">
                        {hasSummary ? (
                          <div className="flex flex-wrap gap-2">
                            {agent ? <Badge tone="neutral">agent: {agent}</Badge> : null}
                            {typeof questionIndex === 'number' ? <Badge tone="neutral">q#: {questionIndex}</Badge> : null}
                            {typeof followUpIndex === 'number' ? <Badge tone="neutral">fu#: {followUpIndex}</Badge> : null}
                            {qDifficulty ? <Badge tone="neutral">difficulty: {qDifficulty}</Badge> : null}
                            {typeof nonAnswer === 'boolean' ? (
                              <Badge tone={nonAnswer ? 'neutral' : 'good'}>{nonAnswer ? 'non-answer' : 'answer'}</Badge>
                            ) : null}
                            {typeof depthScore === 'number' ? <Badge tone="neutral">depth: {depthScore}/5</Badge> : null}
                            {typeof needsFollowUp === 'boolean' ? (
                              <Badge tone={needsFollowUp ? 'neutral' : 'neutral'}>
                                follow-up: {needsFollowUp ? 'yes' : 'no'}
                              </Badge>
                            ) : null}
                            {intent ? <Badge tone="neutral">intent: {intent}</Badge> : null}
                            {quality ? <Badge tone="neutral">quality: {quality}</Badge> : null}
                            {shift ? <Badge tone="neutral">shift: {shift}</Badge> : null}
                            {typeof cheating === 'boolean' ? (
                              <Badge tone={cheating ? 'neutral' : 'good'}>{cheating ? 'cheating: suspected' : 'cheating: no'}</Badge>
                            ) : null}
                            {typeof confidence === 'number' ? (
                              <Badge tone="neutral">conf: {formatMaybeNumber(confidence, 2)}</Badge>
                            ) : null}
                          </div>
                        ) : null}

                        <details className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2">
                          <summary className="cursor-pointer select-none text-xs text-zinc-500">Raw meta JSON</summary>
                          <pre className="mt-2 overflow-auto text-xs text-zinc-500">{JSON.stringify(t.meta, null, 2)}</pre>
                        </details>
                      </div>
                    );
                  })() : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-zinc-500">No transcript yet.</div>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Evaluation</h3>
        <div>
          {evaluation ? (
            <div className="grid gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">Depth: {evaluation.technicalDepthScore}/10</Badge>
                <Badge tone="neutral">Problem solving: {evaluation.problemSolvingScore}/10</Badge>
                <Badge tone="neutral">Communication: {evaluation.communicationScore}/10</Badge>
              </div>
              <div className="text-sm text-zinc-300">{evaluation.summary}</div>

              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-zinc-500 mb-1">Strengths</div>
                  <ul className="list-disc pl-5 text-sm text-zinc-300">
                    {evaluation.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-500 mb-1">Weaknesses</div>
                  <ul className="list-disc pl-5 text-sm text-zinc-300">
                    {evaluation.weaknesses.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-zinc-500">End the interview to see evaluation.</div>
          )}

          <div className="mt-4 grid gap-2">
            <div className="text-xs font-semibold text-zinc-500">Resume by session ID (demo)</div>
            <div className="flex flex-wrap gap-2">
              <Input value={resumeId} onChange={(e) => setResumeId(e.currentTarget.value)} placeholder="Paste session UUID…" />
              <Button type="button" variant="secondary" onClick={onResume} disabled={loading || !resumeId.trim()}>
                Load
              </Button>
            </div>
            <div className="text-xs text-zinc-600">
              Tip: you can copy the session id from the badge above.
            </div>
          </div>

          <div className="mt-4 text-xs text-zinc-600">
            Want a dedicated public interview room experience? See{' '}
            <Link className="underline" href="/public/interview">
              public interview
            </Link>
            .
          </div>
        </div>
      </Card>
    </div>
  );
}
