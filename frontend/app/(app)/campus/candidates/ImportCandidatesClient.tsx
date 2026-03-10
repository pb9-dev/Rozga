'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '../../../ui/button';
import { Select } from '../../../ui/select';
import { Textarea } from '../../../ui/textarea';

type BatchOption = { id: string; name: string; college?: { name: string }; job?: { title: string } };

type ServerAction = (formData: FormData) => void | Promise<void>;

function detectDelimiter(sampleLine: string): string {
  const candidates: Array<{ d: string; score: number }> = [
    { d: ',', score: 0 },
    { d: ';', score: 0 },
    { d: '\t', score: 0 },
    { d: '|', score: 0 },
  ];

  for (const c of candidates) {
    // Count delimiter occurrences outside quotes.
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
      if (!inQuotes && ch === c.d) count++;
    }
    c.score = count;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.score ? candidates[0].d : ',';
}

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
    if (!inQuotes && ch === delimiter) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function looksLikeEmail(v: string) {
  return /@/.test(v) && /\./.test(v);
}

function looksLikePhone(v: string) {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

const HEADER_SYNONYMS: Record<string, string[]> = {
  fullName: ['fullname', 'full name', 'name', 'candidate', 'candidate name', 'student name', 'applicant', 'applicant name'],
  firstName: ['firstname', 'first name', 'givenname', 'given name'],
  lastName: ['lastname', 'last name', 'surname', 'familyname', 'family name'],
  email: ['email', 'emailid', 'email id', 'mail', 'e-mail'],
  phone: ['phone', 'mobile', 'mobile number', 'contact', 'contact number', 'phonenumber', 'phone number'],
  rollNumber: ['roll', 'rollno', 'roll no', 'rollnumber', 'roll number', 'studentid', 'student id', 'id'],
  department: ['department', 'dept', 'branch', 'stream', 'major'],
  resumeUrl: ['resume', 'resumeurl', 'resume url', 'cv', 'cvurl', 'cv url', 'profile', 'profileurl', 'profile url'],
};

function normalizeHeader(h: string) {
  return h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

function guessHasHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const first = rows[0] ?? [];
  const second = rows[1] ?? [];

  const firstNorm = first.map(normalizeHeader);
  let headerHits = 0;
  for (const cell of firstNorm) {
    for (const synonyms of Object.values(HEADER_SYNONYMS)) {
      if (synonyms.includes(cell)) {
        headerHits++;
        break;
      }
    }
  }

  // If first row has multiple header-like cells and second row has email/phone-like values, treat as header.
  const secondFlat = second.join(' ');
  const secondLooksData = looksLikeEmail(secondFlat) || looksLikePhone(secondFlat);
  return headerHits >= 1 && secondLooksData;
}

function guessColumnIndexFromHeader(headers: string[], field: keyof typeof HEADER_SYNONYMS): number {
  const synonyms = HEADER_SYNONYMS[field];
  const normHeaders = headers.map(normalizeHeader);
  for (let i = 0; i < normHeaders.length; i++) {
    if (synonyms.includes(normHeaders[i])) return i;
  }
  return -1;
}

function guessColumnIndexFromData(rows: string[][], predicate: (v: string) => boolean): number {
  if (!rows.length) return -1;
  const cols = Math.max(...rows.map((r) => r.length));
  let best = -1;
  let bestScore = 0;
  for (let c = 0; c < cols; c++) {
    let score = 0;
    for (const r of rows.slice(0, 25)) {
      const v = (r[c] ?? '').trim();
      if (!v) continue;
      if (predicate(v)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return bestScore ? best : -1;
}

function guessNameColumnIndex(rows: string[][]): number {
  const cols = Math.max(...rows.map((r) => r.length));
  let best = 0;
  let bestScore = -1;
  for (let c = 0; c < cols; c++) {
    let score = 0;
    for (const r of rows.slice(0, 25)) {
      const v = (r[c] ?? '').trim();
      if (!v) continue;
      const hasLetters = /[A-Za-z]/.test(v);
      const hasSpace = /\s/.test(v);
      const hasAt = /@/.test(v);
      if (hasLetters && !hasAt) score += 2;
      if (hasSpace) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export function ImportCandidatesClient({
  batches,
  selectedBatchId,
  importAction,
}: {
  batches: BatchOption[];
  selectedBatchId: string;
  importAction: ServerAction;
}) {
  function readSelectValue(e: unknown): string {
    const anyEvent = e as { currentTarget?: { value?: unknown } | null; target?: { value?: unknown } | null } | null;
    const v = anyEvent?.currentTarget?.value ?? anyEvent?.target?.value;
    return typeof v === 'string' ? v : String(v ?? '');
  }

  const [batchId, setBatchId] = useState(selectedBatchId);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState<string>('');

  const preview = useMemo(() => {
    const raw = csv.replace(/^\uFEFF/, '').trim();
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const firstLine = lines[0] ?? '';
    const delimiter = detectDelimiter(firstLine);
    const rows = lines.slice(0, 30).map((l) => parseCsvLine(l, delimiter));
    const hasHeader = guessHasHeader(rows);

    const headerRow = hasHeader ? rows[0] ?? [] : [];
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const cols = Math.max(1, ...rows.map((r) => r.length));
    const colLabels = Array.from({ length: cols }, (_, i) => headerRow[i]?.trim() || `Column ${i + 1}`);

    const defaultsFromHeader = hasHeader
      ? {
          fullName: guessColumnIndexFromHeader(headerRow, 'fullName'),
          firstName: guessColumnIndexFromHeader(headerRow, 'firstName'),
          lastName: guessColumnIndexFromHeader(headerRow, 'lastName'),
          email: guessColumnIndexFromHeader(headerRow, 'email'),
          phone: guessColumnIndexFromHeader(headerRow, 'phone'),
          rollNumber: guessColumnIndexFromHeader(headerRow, 'rollNumber'),
          department: guessColumnIndexFromHeader(headerRow, 'department'),
          resumeUrl: guessColumnIndexFromHeader(headerRow, 'resumeUrl'),
        }
      : null;

    const defaults = {
      delimiter,
      hasHeader,
      cols,
      colLabels,
      dataRows,
      fullName:
        (defaultsFromHeader?.fullName ?? -1) >= 0 ? defaultsFromHeader!.fullName : guessNameColumnIndex(dataRows),
      firstName: defaultsFromHeader?.firstName ?? -1,
      lastName: defaultsFromHeader?.lastName ?? -1,
      email: (defaultsFromHeader?.email ?? -1) >= 0 ? defaultsFromHeader!.email : guessColumnIndexFromData(dataRows, looksLikeEmail),
      phone: (defaultsFromHeader?.phone ?? -1) >= 0 ? defaultsFromHeader!.phone : guessColumnIndexFromData(dataRows, looksLikePhone),
      rollNumber: defaultsFromHeader?.rollNumber ?? -1,
      department: defaultsFromHeader?.department ?? -1,
      resumeUrl: defaultsFromHeader?.resumeUrl ?? -1,
    };

    return defaults;
  }, [csv]);

  const [hasHeaderOverride, setHasHeaderOverride] = useState<boolean | null>(null);

  const effectiveHasHeader = hasHeaderOverride ?? preview.hasHeader;

  const [map, setMap] = useState(() => ({
    fullName: String(preview.fullName),
    firstName: String(preview.firstName),
    lastName: String(preview.lastName),
    email: String(preview.email),
    phone: String(preview.phone),
    rollNumber: String(preview.rollNumber),
    department: String(preview.department),
    resumeUrl: String(preview.resumeUrl),
  }));

  // Keep defaults aligned as user types new CSV.
  React.useEffect(() => {
    setMap({
      fullName: String(preview.fullName),
      firstName: String(preview.firstName),
      lastName: String(preview.lastName),
      email: String(preview.email),
      phone: String(preview.phone),
      rollNumber: String(preview.rollNumber),
      department: String(preview.department),
      resumeUrl: String(preview.resumeUrl),
    });
  }, [preview.fullName, preview.firstName, preview.lastName, preview.email, preview.phone, preview.rollNumber, preview.department, preview.resumeUrl]);

  const options = useMemo(() => {
    return [
      { value: '-1', label: '— (ignore)' },
      ...preview.colLabels.map((label, i) => ({ value: String(i), label })),
    ];
  }, [preview.colLabels]);

  const previewRows = useMemo(() => preview.dataRows.slice(0, 5), [preview.dataRows]);

  return (
    <form action={importAction} className="grid gap-3">
      <Select
        name="batchId"
        label="Batch"
        value={batchId}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setBatchId(v);
        }}
      >
        {batches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}{b.college?.name ? ` — ${b.college.name}` : ''}{b.job?.title ? ` — ${b.job.title}` : ''}
          </option>
        ))}
      </Select>

      <div className="grid gap-2">
        <label className="text-sm text-zinc-300">CSV file</label>
        <input
          name="file"
          type="file"
          accept=".csv,.tsv,text/csv,text/plain"
          onChange={async (e) => {
            const f = e.currentTarget.files?.[0];
            if (!f) {
              setFileName('');
              return;
            }
            setFileName(f.name);
            // Read for preview + mapping defaults. Server action will read the full file.
            try {
              const text = await f.text();
              setCsv(text);
            } catch {
              setCsv('');
            }
          }}
        />
        <div className="text-xs text-zinc-500">
          {fileName ? `Selected: ${fileName}` : 'Upload a file, or paste CSV below.'}
        </div>
      </div>

      <Textarea
        name="csv"
        label="Or paste CSV"
        value={csv}
        onChange={(e) => {
          setCsv(e.currentTarget.value);
          if (fileName) setFileName('');
        }}
        placeholder={`Paste anything (comma/semicolon/tab). Header optional.\n\nExamples:\nname,email,phone\nJane Doe,jane@college.edu,+91...\n\nOR\nFirst Name;Last Name;Mobile;Mail\nJane;Doe;+91...;jane@college.edu`}
        hint="We’ll auto-detect delimiter + headers. If detection is wrong, flip the toggle and map columns below."
      />

      <input type="hidden" name="delimiter" value={preview.delimiter} />
      <input type="hidden" name="hasHeader" value={String(effectiveHasHeader)} />

      <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">Column mapping</div>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={effectiveHasHeader}
              onChange={(e) => setHasHeaderOverride(e.currentTarget.checked)}
            />
            First row is header
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Select
            name="mapFullName"
            label="Full name column"
            value={map.fullName}
            onChange={(e) => {
              const v = readSelectValue(e);
              setMap((m) => ({ ...m, fullName: v }));
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <div className="grid gap-3 md:grid-cols-2">
            <Select
              name="mapFirstName"
              label="First name (optional)"
              value={map.firstName}
              onChange={(e) => {
                const v = readSelectValue(e);
                setMap((m) => ({ ...m, firstName: v }));
              }}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <Select
              name="mapLastName"
              label="Last name (optional)"
              value={map.lastName}
              onChange={(e) => {
                const v = readSelectValue(e);
                setMap((m) => ({ ...m, lastName: v }));
              }}
            >
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          <Select
            name="mapEmail"
            label="Email (optional)"
            value={map.email}
            onChange={(e) => {
              const v = readSelectValue(e);
              setMap((m) => ({ ...m, email: v }));
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <Select
            name="mapPhone"
            label="Phone (optional)"
            value={map.phone}
            onChange={(e) => {
              const v = readSelectValue(e);
              setMap((m) => ({ ...m, phone: v }));
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <Select
            name="mapRollNumber"
            label="Roll number / Student ID (optional)"
            value={map.rollNumber}
            onChange={(e) => {
              const v = readSelectValue(e);
              setMap((m) => ({ ...m, rollNumber: v }));
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <Select
            name="mapDepartment"
            label="Department (optional)"
            value={map.department}
            onChange={(e) => {
              const v = readSelectValue(e);
              setMap((m) => ({ ...m, department: v }));
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <Select
            name="mapResumeUrl"
            label="Resume URL (optional)"
            value={map.resumeUrl}
            onChange={(e) => {
              const v = readSelectValue(e);
              setMap((m) => ({ ...m, resumeUrl: v }));
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="text-xs text-zinc-500">
          Full name is required. If you map first + last name, they’ll be combined if full name is empty.
        </div>

        {previewRows.length ? (
          <div className="mt-2">
            <div className="mb-2 text-xs font-medium text-zinc-400">Preview (first 5 rows)</div>
            <div className="overflow-auto rounded-lg border border-zinc-800">
              <table className="w-full text-xs">
                <tbody>
                  {previewRows.map((r, i) => (
                    <tr key={i} className={i % 2 ? 'bg-zinc-900/30' : ''}>
                      {Array.from({ length: preview.cols }, (_, c) => (
                        <td key={c} className="max-w-64 truncate px-2 py-1 text-zinc-400">
                          {(r[c] ?? '').toString() || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <Button type="submit" variant="secondary">
        Import
      </Button>
    </form>
  );
}
