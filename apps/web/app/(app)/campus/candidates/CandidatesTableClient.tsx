'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../../lib/cn';
import { Badge } from '../../../ui/badge';
import { Button } from '../../../ui/button';
import { Select } from '../../../ui/select';
import { Table, Td, Th } from '../../../ui/table';

type FlowStage = { key: string; name: string; kind: string; order: number };

type ProgressionItem = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  createdAt: string;
  currentStageKey: string | null;
  possibleNextStageKeys: string[];
};

type ServerAction = (formData: FormData) => void | Promise<void>;

export function CandidatesTableClient({
  items,
  stages,
  selectedBatchId,
  transitionAction,
  uploadResumeAction,
  bulkTransitionAction,
  deleteAction,
  bulkDeleteAction,
}: {
  items: ProgressionItem[];
  stages: FlowStage[];
  selectedBatchId: string;
  transitionAction: ServerAction;
  uploadResumeAction: ServerAction;
  bulkTransitionAction: ServerAction;
  deleteAction: ServerAction;
  bulkDeleteAction: ServerAction;
}) {
  const router = useRouter();

  const stageNameByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stages) map.set(s.key, s.name);
    return map;
  }, [stages]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [activeIndex, setActiveIndex] = useState(0);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [bulkToStageKey, setBulkToStageKey] = useState('');
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  const allVisibleSelected = items.length > 0 && items.every((c) => selected.has(c.id));
  const someVisibleSelected = selected.size > 0 && !allVisibleSelected;

  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (!el) return;
    el.indeterminate = someVisibleSelected;
  }, [someVisibleSelected, selected]);

  useEffect(() => {
    const row = rowRefs.current[activeIndex];
    if (row) row.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  useEffect(() => {
    setSelected(new Set());
    setBulkToStageKey('');
    setActiveIndex(0);
    setLastClickedIndex(null);
  }, [selectedBatchId]);

  useEffect(() => {
    if (!items.length) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((i) => Math.min(items.length - 1, Math.max(0, i)));
  }, [items.length]);

  const selectedIdsCsv = useMemo(() => Array.from(selected).join(','), [selected]);

  const commonNextStageKeys = useMemo(() => {
    const selectedItems = items.filter((c) => selected.has(c.id));
    if (!selectedItems.length) return [] as string[];

    const intersection = new Set(selectedItems[0].possibleNextStageKeys);
    for (const it of selectedItems.slice(1)) {
      for (const k of Array.from(intersection)) {
        if (!it.possibleNextStageKeys.includes(k)) intersection.delete(k);
      }
    }
    return Array.from(intersection);
  }, [items, selected]);

  useEffect(() => {
    if (bulkToStageKey && !commonNextStageKeys.includes(bulkToStageKey)) {
      setBulkToStageKey('');
    }
  }, [bulkToStageKey, commonNextStageKeys]);

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const it of items) next.delete(it.id);
        return next;
      }
      for (const it of items) next.add(it.id);
      return next;
    });
  }

  function toggleOne(index: number, checked: boolean, shiftKey: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);

      if (shiftKey && lastClickedIndex !== null) {
        const [from, to] = [lastClickedIndex, index].sort((a, b) => a - b);
        for (let i = from; i <= to; i++) {
          const id = items[i]?.id;
          if (!id) continue;
          if (checked) next.add(id);
          else next.delete(id);
        }
      } else {
        const id = items[index]?.id;
        if (id) {
          if (checked) next.add(id);
          else next.delete(id);
        }
      }

      return next;
    });

    setLastClickedIndex(index);
    setActiveIndex(index);
  }

  useEffect(() => {
    function shouldIgnoreKeyTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return true;
      if (el.isContentEditable) return true;
      return false;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (shouldIgnoreKeyTarget(e.target)) return;
      if (!items.length) return;

      const key = e.key;
      const lower = key.toLowerCase();

      if (lower === 'j' || key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(items.length - 1, i + 1));
        return;
      }
      if (lower === 'k' || key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key === ' ') {
        e.preventDefault();
        const id = items[activeIndex]?.id;
        if (!id) return;
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        setLastClickedIndex(activeIndex);
        return;
      }
      if (key === 'Enter') {
        e.preventDefault();
        const id = items[activeIndex]?.id;
        if (!id) return;
        router.push(`/campus/candidates/${id}`);
        return;
      }
      if (lower === 'a') {
        e.preventDefault();
        toggleAllVisible();
        return;
      }
      if (key === 'Escape') {
        e.preventDefault();
        setSelected(new Set());
        setBulkToStageKey('');
        return;
      }
      if (lower === 'b') {
        e.preventDefault();
        const el = document.getElementById('bulk-stage-select') as HTMLSelectElement | null;
        el?.focus();
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, items, router, allVisibleSelected, lastClickedIndex]);

  return (
    <div className="relative">
      {selected.size ? (
        <div className="sticky bottom-3 z-10 mt-3">
          <div className="rounded-md border border-zinc-700 bg-zinc-900 p-3 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tone="info">{selected.size} selected</Badge>
                <span className="text-[10px] text-zinc-500 hidden lg:inline">J/K ↑↓ Space select Enter open</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <form action={bulkTransitionAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="batchId" value={selectedBatchId} />
                <input type="hidden" name="candidateIds" value={selectedIdsCsv} />

                <Select
                  id="bulk-stage-select"
                  name="toStageKey"
                  value={bulkToStageKey}
                  onChange={(e) => setBulkToStageKey(e.currentTarget.value)}
                  className="min-w-[160px]"
                >
                  <option value="">Move to…</option>
                  {(commonNextStageKeys.length ? commonNextStageKeys : []).map((k) => (
                    <option key={k} value={k}>
                      {stageNameByKey.get(k) ?? k}
                    </option>
                  ))}
                </Select>

                <Button type="submit" variant="secondary" size="sm" disabled={!commonNextStageKeys.length || !bulkToStageKey}>
                  Bulk move
                </Button>
                </form>

                <Button type="button" variant="danger" size="sm" onClick={() => setShowBulkDelete(true)}>
                  Delete selected
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelected(new Set());
                    setBulkToStageKey('');
                  }}
                >
                  Clear
                </Button>
              </div>
            </div>

            {!commonNextStageKeys.length ? (
              <div className="mt-1.5 text-[10px] text-zinc-500">
                No common next-stage across selection.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showBulkDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowBulkDelete(false);
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5">
            <div className="text-base font-semibold text-zinc-100">Delete {selected.size} candidates?</div>
            <div className="mt-2 text-sm text-zinc-400">
              This will permanently delete the selected candidates and all related data.
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowBulkDelete(false)}>
                Cancel
              </Button>
              <form action={bulkDeleteAction} onSubmit={() => setShowBulkDelete(false)}>
                <input type="hidden" name="batchId" value={selectedBatchId} />
                <input type="hidden" name="candidateIds" value={selectedIdsCsv} />
                <Button type="submit" variant="danger">
                  Confirm delete
                </Button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <Table className="mt-3">
        <thead>
          <tr>
            <Th className="w-10">
              <input
                ref={headerCheckboxRef}
                type="checkbox"
                checked={allVisibleSelected}
                onChange={() => toggleAllVisible()}
                aria-label="Select all visible"
              />
            </Th>
            <Th>ID</Th>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Current stage</Th>
            <Th>Next</Th>
            <Th>Action</Th>
            <Th>Resume</Th>
            <Th>Delete</Th>
            <Th>Created</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((c, index) => {
            const currentLabel = c.currentStageKey ? stageNameByKey.get(c.currentStageKey) ?? c.currentStageKey : '—';
            const nextOptions = c.possibleNextStageKeys;
            const defaultNext = nextOptions[0] ?? '';

            const isSelected = selected.has(c.id);
            const isActive = index === activeIndex;

            return (
              <tr
                key={c.id}
                ref={(el) => {
                  rowRefs.current[index] = el;
                }}
                className={cn(
                  'transition-colors',
                  isActive ? 'bg-white/5' : '',
                  isSelected ? 'bg-white/10' : '',
                )}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const tag = target.tagName.toLowerCase();
                  if (tag === 'input' || tag === 'select' || tag === 'option' || tag === 'button' || tag === 'a') return;
                  setActiveIndex(index);
                }}
              >
                <Td>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) =>
                      toggleOne(
                        index,
                        e.currentTarget.checked,
                        Boolean((e.nativeEvent as unknown as MouseEvent | KeyboardEvent).shiftKey),
                      )
                    }
                    aria-label={`Select ${c.fullName}`}
                  />
                </Td>
                <Td className="text-zinc-500 font-mono text-xs">
                  <span className="truncate block max-w-[80px]">{c.id.slice(0, 8)}…</span>
                </Td>
                <Td className="font-medium text-zinc-200">
                  <Link className="hover:text-indigo-400 truncate block max-w-[180px]" href={`/campus/candidates/${c.id}`}>
                    {c.fullName}
                  </Link>
                </Td>
                <Td>
                  <span className="truncate block max-w-[180px]">{c.email ?? '—'}</span>
                </Td>
                <Td>
                  <span className="truncate block max-w-[150px]">{currentLabel}</span>
                </Td>
                <Td>
                  <Select
                    name="toStageKey"
                    form={`move-${c.id}`}
                    defaultValue={defaultNext}
                    disabled={!nextOptions.length}
                    className="min-w-[160px] max-w-[200px]"
                  >
                    {nextOptions.length ? null : <option value="">No transitions</option>}
                    {nextOptions.map((k) => (
                      <option key={k} value={k}>
                        {stageNameByKey.get(k) ?? k}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <form id={`move-${c.id}`} action={transitionAction}>
                    <input type="hidden" name="candidateId" value={c.id} />
                    <input type="hidden" name="batchId" value={selectedBatchId} />
                    <Button type="submit" variant="secondary" size="sm" disabled={!nextOptions.length}>
                      Move
                    </Button>
                  </form>
                </Td>
                <Td>
                  <form action={uploadResumeAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="candidateId" value={c.id} />
                    <input type="hidden" name="batchId" value={selectedBatchId} />
                    <input
                      className="block max-w-[220px] text-xs text-zinc-500"
                      type="file"
                      name="file"
                      accept=".pdf,.doc,.docx,.txt"
                      aria-label={`Upload resume for ${c.fullName}`}
                      required
                    />
                    <Button type="submit" variant="secondary" size="sm">
                      Upload
                    </Button>
                  </form>
                </Td>
                <Td>
                  <form action={deleteAction}>
                    <input type="hidden" name="candidateId" value={c.id} />
                    <input type="hidden" name="batchId" value={selectedBatchId} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-950"
                    >
                      Delete
                    </Button>
                  </form>
                </Td>
                <Td className="text-zinc-500 text-xs whitespace-nowrap">{new Date(c.createdAt).toLocaleDateString()}</Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
