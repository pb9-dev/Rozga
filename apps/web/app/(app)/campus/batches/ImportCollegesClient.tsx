'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import { Textarea } from '../../../ui/textarea';

type ParsedCollege = { name: string; code?: string };

function detectDelimiter(line: string) {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const c = line.split(d).length;
    if (c > bestCount) {
      bestCount = c;
      best = d;
    }
  }
  return best;
}

function parseColleges(text: string): ParsedCollege[] {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!rawLines.length) return [];

  const delim = detectDelimiter(rawLines[0]);
  const rows = rawLines.map((l) => l.split(delim).map((x) => x.trim()));

  // If header contains name/code, skip it.
  const header = rows[0].map((h) => h.toLowerCase());
  const hasHeader = header.some((h) => h.includes('name'));
  const body = hasHeader ? rows.slice(1) : rows;

  const out: ParsedCollege[] = [];
  for (const r of body) {
    const a = r[0] ?? '';
    const b = r[1] ?? '';

    // common patterns:
    // - name
    // - code,name
    // - name,code
    let name = a;
    let code: string | undefined = undefined;

    if (a && b) {
      // heuristics: code is short-ish and more symboly
      const aLooksCode = a.length <= 12 && /^[A-Za-z0-9_-]+$/.test(a);
      const bLooksCode = b.length <= 12 && /^[A-Za-z0-9_-]+$/.test(b);

      if (aLooksCode && !bLooksCode) {
        code = a;
        name = b;
      } else if (!aLooksCode && bLooksCode) {
        name = a;
        code = b;
      } else {
        // default assume first column is name
        name = a;
        code = bLooksCode ? b : undefined;
      }
    }

    name = name.trim();
    if (name.length < 2) continue;

    out.push({ name, code: code?.trim() || undefined });
  }

  // de-dupe
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = `${(c.code ?? '').toLowerCase()}|${c.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ImportCollegesClient() {
  const [fileName, setFileName] = useState<string>('');
  const [text, setText] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseColleges(text), [text]);

  async function onPickFile(file: File | null) {
    if (!file) return;
    setFileName(file.name);
    const content = await file.text();
    setText(content);
  }

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/campus/colleges/bulk-import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ colleges: parsed.slice(0, 500) }),
      });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json?.message || 'Import failed');
      setText('');
      setFileName('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <Input
        type="file"
        label="Upload CSV/TSV (optional)"
        hint="Format: name OR code,name OR name,code. Header optional."
        onChange={(e) => onPickFile(e.currentTarget.files?.[0] ?? null)}
      />

      <Textarea
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        label="Or paste"
        placeholder="IITD,Indian Institute of Technology Delhi\nIITB,Indian Institute of Technology Bombay\nNational Institute of Technology Karnataka"
        hint={fileName ? `Loaded: ${fileName}` : 'Paste one college per line.'}
      />

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-400">
        Parsed: <span className="text-zinc-200">{parsed.length}</span> colleges (imports up to 500 at a time)
      </div>

      {err ? <div className="text-sm text-red-300">{err}</div> : null}

      <div className="flex justify-end">
        <Button variant="secondary" disabled={busy || parsed.length === 0} onClick={submit}>
          {busy ? 'Importing…' : 'Import colleges'}
        </Button>
      </div>
    </div>
  );
}
