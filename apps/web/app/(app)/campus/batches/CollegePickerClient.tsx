'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../../lib/cn';
import { Input } from '../../../ui/input';

type DbCollege = { source: 'db'; id: string; name: string; code: string };
type DirectoryCollege = {
  source: 'directory';
  name: string;
  countryCode?: string;
  stateName?: string;
  districtName?: string;
  universityName?: string;
  collegeType?: string;
};

type SearchResponse = {
  q: string;
  db: DbCollege[];
  directory: DirectoryCollege[];
  directoryAvailable?: boolean;
  directoryError?: string | null;
};

type ExistingCollege = { id: string; code: string; name: string };

type DirectoryRefPayload = {
  name: string;
  countryCode?: string;
  stateName?: string;
  districtName?: string;
  universityName?: string;
  collegeType?: string;
};

function encodeDirectoryRef(p: DirectoryRefPayload) {
  const json = JSON.stringify(p);
  const b64 = window.btoa(encodeURIComponent(json));
  return `dir:${b64}`;
}

export function CollegePickerClient({
  name,
  label,
  defaultValue,
  existing,
}: {
  name: string;
  label?: string;
  defaultValue?: string;
  existing: ExistingCollege[];
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(defaultValue ?? '');
  const [selectedLabel, setSelectedLabel] = useState('');

  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [directory, setDirectory] = useState<DirectoryCollege[]>([]);
  const [directoryAvailable, setDirectoryAvailable] = useState<boolean>(true);
  const [directoryError, setDirectoryError] = useState<string | null>(null);

  const selectedFromExisting = useMemo(() => existing.find((c) => c.id === selectedId), [existing, selectedId]);

  useEffect(() => {
    if (!selectedLabel) {
      if (selectedFromExisting) setSelectedLabel(`${selectedFromExisting.code} — ${selectedFromExisting.name}`);
    }
  }, [selectedFromExisting, selectedLabel]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!open) return;
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onDocKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setDirectory([]);
      setDirectoryAvailable(true);
      setDirectoryError(null);
      setErr(null);
      setLoading(false);
      return;
    }

    const handle = window.setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/campus/colleges/search?q=${encodeURIComponent(q.trim())}`, { credentials: 'include' });
        const json = (await res.json()) as any;
        if (!res.ok) throw new Error(json?.message || 'Search failed');
        const parsed = json as SearchResponse;
        setDirectory(Array.isArray(parsed?.directory) ? parsed.directory : []);
        setDirectoryAvailable(parsed?.directoryAvailable !== false);
        setDirectoryError(parsed?.directoryError ? String(parsed.directoryError) : null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Search failed');
        setDirectory([]);
        setDirectoryAvailable(false);
        setDirectoryError(null);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(handle);
  }, [open, q]);

  function selectDirectoryCollege(college: DirectoryCollege) {
    const ref = encodeDirectoryRef({
      name: college.name,
      countryCode: college.countryCode,
      stateName: college.stateName,
      districtName: college.districtName,
      universityName: college.universityName,
      collegeType: college.collegeType,
    });

    setSelectedId(ref);
    setSelectedLabel(college.name);
    setOpen(false);
    buttonRef.current?.focus();
  }

  const display = selectedFromExisting
    ? `${selectedFromExisting.code} — ${selectedFromExisting.name}`
    : selectedLabel || 'Select a college…';

  return (
    <label className="block">
      {label ? <div className="mb-1 text-sm text-zinc-300">{label}</div> : null}

      <input type="hidden" name={name} value={selectedId} />

      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-left text-sm text-zinc-200 focus:outline-none focus:ring-2 focus-visible:ring-indigo-500',
            'flex items-center justify-between gap-3',
          )}
        >
          <span className={cn('truncate', !selectedId ? 'text-zinc-500' : '')}>{display}</span>
          <span className="text-zinc-500">▾</span>
        </button>

        {open ? (
          <div
            ref={popoverRef}
            role="listbox"
            className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg"
          >
            <div className="p-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.currentTarget.value)}
                placeholder="Search colleges (type 2+ chars)…"
              />
              <div className="mt-2 text-xs text-zinc-600">
                Searches your colleges{existing.length ? '' : ' (none saved yet)'} + a global directory.
              </div>
              {err ? <div className="mt-2 text-xs text-red-300">{err}</div> : null}
            </div>

            {existing.length ? (
              <>
                <div className="border-t border-zinc-800" />

                <div className="px-2 py-2">
                  <div className="px-2 pb-2 text-xs font-semibold text-zinc-500">Saved colleges</div>
                  {existing.slice(0, 30).map((c) => {
                    const isSel = c.id === selectedId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        onClick={() => {
                          setSelectedId(c.id);
                          setSelectedLabel(`${c.code} — ${c.name}`);
                          setOpen(false);
                          buttonRef.current?.focus();
                        }}
                        className={cn(
                          'w-full rounded-lg px-3 py-2 text-left text-sm',
                          'hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none',
                          isSel ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300',
                        )}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate">{c.code} — {c.name}</span>
                          {isSel ? <span className="text-zinc-400">✓</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            <div className="px-2 py-2">
              <div className="px-2 pb-2 text-xs font-semibold text-zinc-500">Directory results</div>
              {loading ? <div className="px-2 py-2 text-sm text-zinc-500">Searching…</div> : null}
              {!loading && q.trim().length < 2 ? (
                <div className="px-2 py-2 text-sm text-zinc-500">Type at least 2 characters to search.</div>
              ) : null}
              {!directoryAvailable && q.trim().length >= 2 ? (
                <div className="px-2 py-2 text-xs text-zinc-500">
                  College directory search isn’t available on this deployment. Use “Create” (below) or import colleges.
                </div>
              ) : null}
              {directoryError ? <div className="px-2 py-2 text-xs text-zinc-600">{directoryError}</div> : null}
              {!loading && q.trim().length >= 2 && directoryAvailable && !directory.length ? (
                <div className="px-2 py-2 text-sm text-zinc-500">No matches.</div>
              ) : null}

              {directory.slice(0, 25).map((rr) => {
                const key = [rr.name, rr.stateName, rr.districtName, rr.universityName, rr.collegeType]
                  .filter(Boolean)
                  .join('|');

                const chips: Array<{ label: string; value?: string }> = [
                  { label: 'State', value: rr.stateName },
                  { label: 'District', value: rr.districtName },
                  { label: 'University', value: rr.universityName },
                  { label: 'Type', value: rr.collegeType },
                ];

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectDirectoryCollege(rr)}
                    className={cn(
                      'w-full rounded-lg px-3 py-2 text-left text-sm',
                      'hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none',
                      'text-zinc-300',
                    )}
                  >
                    <div className="truncate">{rr.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {chips
                        .filter((c) => !!c.value)
                        .map((c) => (
                          <span
                            key={c.label}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/50 px-2 py-0.5',
                              'text-[11px] text-zinc-400',
                            )}
                          >
                            <span className="text-zinc-600">{c.label}:</span>
                            <span className="truncate">{c.value}</span>
                          </span>
                        ))}
                    </div>
                  </button>
                );
              })}

              {q.trim().length >= 2 ? (
                <button
                  type="button"
                  onClick={() => selectDirectoryCollege({ source: 'directory', name: q.trim() })}
                  className={cn(
                    'mx-2 mt-2 w-[calc(100%-16px)] rounded-lg border border-zinc-800 px-3 py-2 text-left text-sm',
                    'hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none',
                    'text-zinc-300',
                  )}
                >
                  Create “{q.trim()}”
                </button>
              ) : null}
            </div>

            {existing.length ? (
              <>
                <div className="border-t border-zinc-800" />
                <div className="px-2 py-2">
                  <div className="px-2 pb-2 text-xs font-semibold text-zinc-500">Saved (used in batches)</div>
                  {existing.slice(0, 30).map((c) => {
                    const isSel = c.id === selectedId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={isSel}
                        onClick={() => {
                          setSelectedId(c.id);
                          setSelectedLabel(`${c.code} — ${c.name}`);
                          setOpen(false);
                          buttonRef.current?.focus();
                        }}
                        className={cn(
                          'w-full rounded-lg px-3 py-2 text-left text-sm',
                          'hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none',
                          isSel ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300',
                        )}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate">{c.code} — {c.name}</span>
                          {isSel ? <span className="text-zinc-400">✓</span> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </label>
  );
}
