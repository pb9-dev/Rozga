'use client';

import { useState } from 'react';
import { Button } from '../../../ui/button';
import { Card } from '../../../ui/card';

export function ResumeUpload({
  token,
  apiOrigin,
  existingResumeUrl,
  onUploaded,
}: {
  token: string;
  apiOrigin: string;
  existingResumeUrl?: string | null;
  onUploaded?: (resumeUrl: string | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [resumeUrl, setResumeUrl] = useState<string | null>(existingResumeUrl ?? null);

  async function onUpload() {
    if (!file) return;
    setStatus('uploading');
    setMessage('');

    try {
      const fd = new FormData();
      fd.set('file', file);

      const res = await fetch(`/api/public/interview-rooms/${encodeURIComponent(token)}/resume`, {
        method: 'POST',
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `Upload failed (${res.status})`);
      }

      const json = (await res.json()) as { ok: boolean; resumeUrl?: string };
      setResumeUrl(json.resumeUrl ?? null);
      onUploaded?.(json.resumeUrl ?? null);
      setStatus('done');
      setMessage('Resume uploaded successfully.');
    } catch (e) {
      setStatus('error');
      setMessage(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  const resumeHref = resumeUrl ? new URL(resumeUrl, apiOrigin).toString() : null;

  return (
    <Card>
      <h3 className="text-sm font-medium text-zinc-300 mb-3">Upload your resume</h3>
      <p className="text-xs text-zinc-500 mb-4">PDF/DOC/DOCX/TXT (max 10MB). This helps make your interview more relevant.</p>

      <div className="grid gap-3">
        {resumeHref ? (
          <a className="text-sm underline" href={resumeHref} target="_blank" rel="noreferrer">
            View current resume
          </a>
        ) : (
          <div className="text-sm text-zinc-500">No resume uploaded yet.</div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button type="button" size="sm" disabled={!file || status === 'uploading'} onClick={onUpload}>
            {status === 'uploading' ? 'Uploading…' : 'Upload resume'}
          </Button>
        </div>

        {message ? (
          <div className={status === 'error' ? 'text-sm text-red-300' : 'text-sm text-emerald-300'}>{message}</div>
        ) : null}
      </div>
    </Card>
  );
}
