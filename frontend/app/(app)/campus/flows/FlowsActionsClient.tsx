'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '../../../ui/button';
import { Dialog } from '../../../ui/dialog';
import { Input } from '../../../ui/input';
import { Select } from '../../../ui/select';

type College = { id: string; code: string; name: string };

type StageKind = 'GD_OFFLINE' | 'AI_INTERVIEW' | 'TECH_TEST' | 'TECH_ROUND_ONLINE' | 'TECH_ROUND_OFFLINE';

type StageDraft = {
  name: string;
  key: string;
  kind: StageKind;
};

type ServerAction = (formData: FormData) => void | Promise<void>;

function baseKeyFromName(name: string) {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return cleaned || 'STAGE';
}

function ensureUniqueKey(desired: string, used: Set<string>) {
  if (!used.has(desired)) return desired;
  let i = 2;
  while (used.has(`${desired}_${i}`)) i += 1;
  return `${desired}_${i}`;
}

export function FlowsActionsClient({ colleges, createFlowAction }: { colleges: College[]; createFlowAction: ServerAction }) {
  const [open, setOpen] = useState(false);

  const [collegeId, setCollegeId] = useState(colleges[0]?.id ?? '');
  const [name, setName] = useState('Campus Hiring Flow');
  const [batchSize, setBatchSize] = useState<number>(100);
  const [isActive, setIsActive] = useState(true);

  const [stages, setStages] = useState<StageDraft[]>([
    { name: 'GD Round', key: 'GD', kind: 'GD_OFFLINE' },
    { name: 'Tech Round', key: 'TECH', kind: 'TECH_ROUND_ONLINE' },
  ]);

  const configJson = useMemo(() => {
    const orderedStages = stages.map((s, idx) => ({
      key: s.key,
      name: s.name,
      kind: s.kind,
      order: idx,
      config: {},
    }));

    const transitions = orderedStages.slice(0, -1).map((s, idx) => ({
      fromStageKey: s.key,
      toStageKey: orderedStages[idx + 1]!.key,
      condition: {},
    }));

    return JSON.stringify({
      name,
      batchSize,
      stages: orderedStages,
      transitions,
    });
  }, [stages, name, batchSize]);

  function regenerateKeys(nextStages: StageDraft[], idx: number) {
    const used = new Set<string>();
    const out = nextStages.map((s, i) => {
      if (i !== idx) {
        used.add(s.key);
        return s;
      }
      const desired = baseKeyFromName(s.name);
      const unique = ensureUniqueKey(desired, used);
      used.add(unique);
      return { ...s, key: unique };
    });
    return out;
  }

  function addStage() {
    const used = new Set(stages.map((s) => s.key));
    const key = ensureUniqueKey('STAGE', used);
    setStages((prev) => [...prev, { name: 'New Stage', key, kind: 'TECH_TEST' }]);
  }

  function moveStage(from: number, to: number) {
    setStages((prev) => {
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      if (!item) return prev;
      next.splice(to, 0, item);
      return next;
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Flows</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Define stage order, transitions, and per-stage config.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          Create flow
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen} title="Create flow">
        <form action={createFlowAction} className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              name="collegeId"
              label="College"
              value={collegeId}
              onChange={(e) => setCollegeId(e.currentTarget.value)}
            >
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </Select>

            <Input
              name="name"
              label="Flow name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Input
              name="batchSize"
              label="Batch size"
              type="number"
              min={1}
              max={5000}
              value={String(batchSize)}
              onChange={(e) => setBatchSize(Number(e.currentTarget.value || 0))}
            />
            <label className="flex items-center gap-2 text-sm text-zinc-400 md:pt-6">
              <input
                name="isActive"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.currentTarget.checked)}
                className="h-3.5 w-3.5 rounded"
              />
              Set as active
            </label>
          </div>

          <input type="hidden" name="config" value={configJson} readOnly />

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-zinc-300">Stages</div>
              <div className="text-xs text-zinc-500">Transitions are created linearly in this order.</div>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={addStage}>
              Add stage
            </Button>
          </div>

          <div className="grid gap-3">
            {stages.map((s, idx) => (
              <div key={`${s.key}-${idx}`} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="grid gap-3 md:grid-cols-6">
                  <div className="md:col-span-3">
                    <Input
                      label={`Stage ${idx + 1} name`}
                      value={s.name}
                      onChange={(e) => {
                        const next = stages.slice();
                        next[idx] = { ...next[idx]!, name: e.currentTarget.value };
                        setStages(regenerateKeys(next, idx));
                      }}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Input
                      label="Key"
                      value={s.key}
                      onChange={(e) => {
                        const next = stages.slice();
                        next[idx] = { ...next[idx]!, key: e.currentTarget.value.toUpperCase() };
                        setStages(next);
                      }}
                      hint="Used in transitions"
                    />
                  </div>

                  <div>
                    <Select
                      label="Kind"
                      value={s.kind}
                      onChange={(e) => {
                        const next = stages.slice();
                        next[idx] = { ...next[idx]!, kind: e.currentTarget.value as StageKind };
                        setStages(next);
                      }}
                    >
                      <option value="GD_OFFLINE">GD (offline)</option>
                      <option value="AI_INTERVIEW">AI interview</option>
                      <option value="TECH_TEST">Tech test</option>
                      <option value="TECH_ROUND_ONLINE">Tech round (online)</option>
                      <option value="TECH_ROUND_OFFLINE">Tech round (offline)</option>
                    </Select>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <Button type="button" variant="secondary" disabled={idx === 0} onClick={() => moveStage(idx, idx - 1)}>
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={idx === stages.length - 1}
                    onClick={() => moveStage(idx, idx + 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={stages.length <= 1}
                    onClick={() => setStages((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="sm" disabled={!collegeId || stages.length < 1}>
              Create flow
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
