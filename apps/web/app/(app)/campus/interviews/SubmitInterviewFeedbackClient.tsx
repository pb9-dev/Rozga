'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { Select } from '../../../ui/select';
import { Textarea } from '../../../ui/textarea';

type AssignmentLite = {
  id: string;
  candidate?: { id: string; fullName: string; email?: string | null };
  interviewer?: { id: string; email: string };
  candidateId: string;
  interviewerId: string;
  feedback?: unknown | null;
};

type TransitionOptions = {
  assignmentId: string;
  candidateId: string;
  currentStageKey: string;
  possibleNextStageKeys: string[];
  flowStages: { key: string; name: string; order: number }[];
};

export function SubmitInterviewFeedbackClient({
  assignments,
  apiOrigin,
  submitFeedback,
}: {
  assignments: AssignmentLite[];
  apiOrigin: string;
  submitFeedback: (formData: FormData) => void;
}) {
  const pendingAssignments = useMemo(() => assignments.filter((a) => !a.feedback), [assignments]);
  const [assignmentId, setAssignmentId] = useState(pendingAssignments[0]?.id ?? '');
  const [options, setOptions] = useState<TransitionOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!assignmentId) {
        setOptions(null);
        return;
      }

      setLoadingOptions(true);
      setOptionsError(null);

      try {
        const tokenRes = await fetch('/api/session/access-token', { cache: 'no-store' });
        if (!tokenRes.ok) throw new Error('Not authenticated');
        const { accessToken } = (await tokenRes.json()) as { accessToken: string };

        const res = await fetch(`${apiOrigin}/api/v1/campus/interviews/assignments/${assignmentId}/transition-options`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `Failed (${res.status})`);
        }

        const json = (await res.json()) as TransitionOptions;
        if (cancelled) return;
        setOptions(json);
      } catch (e) {
        if (cancelled) return;
        setOptions(null);
        setOptionsError(e instanceof Error ? e.message : 'Failed to load stage options');
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [apiOrigin, assignmentId]);

  return (
    <form action={submitFeedback} className="grid gap-3">
      <Select
        name="assignmentId"
        label="Assignment"
        value={assignmentId}
        onChange={(e) => setAssignmentId(e.target.value)}
      >
        {pendingAssignments.map((a) => (
          <option key={a.id} value={a.id}>
            {(a.candidate?.fullName ?? a.candidateId) + ' → ' + (a.interviewer?.email ?? a.interviewerId)}
          </option>
        ))}
      </Select>

      <Select name="recommendation" label="Recommendation" defaultValue="YES">
        <option value="STRONG_YES">STRONG_YES</option>
        <option value="YES">YES</option>
        <option value="MAYBE">MAYBE</option>
        <option value="NO">NO</option>
        <option value="STRONG_NO">STRONG_NO</option>
      </Select>

      <Textarea name="notes" label="Notes (optional)" placeholder="Strengths, concerns, follow-up topics" />

      <div className="grid gap-3 md:grid-cols-3">
        <Input name="fundamentals" label="Fundamentals (0-10)" type="number" min={0} max={10} />
        <Input name="problemSolving" label="Problem solving (0-10)" type="number" min={0} max={10} />
        <Input name="communication" label="Communication (0-10)" type="number" min={0} max={10} />
      </div>

      <Select name="toStageKey" label="Move candidate to (optional)" defaultValue="">
        <option value="">Don't move stage</option>
        {options?.possibleNextStageKeys?.map((k) => {
          const stageName = options.flowStages.find((s) => s.key === k)?.name;
          return (
            <option key={k} value={k}>
              {k}{stageName ? ` — ${stageName}` : ''}
            </option>
          );
        })}
      </Select>

      {loadingOptions ? <div className="text-xs text-zinc-500">Loading stage options…</div> : null}
      {optionsError ? <div className="text-xs text-red-400">{optionsError}</div> : null}
      {options?.currentStageKey ? (
        <div className="text-xs text-zinc-500">Current stage: {options.currentStageKey}</div>
      ) : null}

      <Button type="submit" variant="secondary" disabled={!pendingAssignments.length}>
        Submit feedback
      </Button>
    </form>
  );
}
