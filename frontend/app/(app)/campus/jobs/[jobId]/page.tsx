import { redirect } from 'next/navigation';
import { z } from 'zod';
import { apiFetch } from '../../../../lib/api';
import { env } from '../../../../lib/env';
import { Badge } from '../../../../ui/badge';
import { Button } from '../../../../ui/button';
import { Card } from '../../../../ui/card';

const UpdateSchema = z.object({
  description: z.string().min(10),
});

async function updateDescription(jobId: string, formData: FormData) {
  'use server';

  const parsed = UpdateSchema.safeParse({
    description: String(formData.get('description') ?? ''),
  });

  if (!parsed.success) {
    redirect(`/campus/jobs/${jobId}?error=${encodeURIComponent('Invalid description')}`);
  }

  try {
    await apiFetch(`/api/v1/campus/jobs/${encodeURIComponent(jobId)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: parsed.data.description }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    redirect(`/campus/jobs/${jobId}?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/campus/jobs/${jobId}?saved=1`);
}

async function uploadJd(jobId: string, formData: FormData) {
  'use server';

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/campus/jobs/${jobId}?error=${encodeURIComponent('Please choose a file')}`);
  }

  const fd = new FormData();
  fd.set('file', file);

  try {
    await apiFetch(`/api/v1/campus/jobs/${encodeURIComponent(jobId)}/jd`, {
      method: 'POST',
      body: fd,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    redirect(`/campus/jobs/${jobId}?error=${encodeURIComponent(msg)}`);
  }

  redirect(`/campus/jobs/${jobId}?uploaded=1`);
}

type Job = {
  id: string;
  title: string;
  description: string;
  jdUrl?: string | null;
  updatedAt: string;
};

export default async function JobEditPage({ params, searchParams }: { params: Promise<{ jobId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { jobId } = await params;
  const sp = await searchParams;

  const res = await apiFetch(`/api/v1/campus/jobs/${encodeURIComponent(jobId)}`);
  const job = (await res.json()) as Job;

  const { ROZGA_API_BASE_URL } = env();
  const jdHref = job.jdUrl ? new URL(job.jdUrl, ROZGA_API_BASE_URL).toString() : null;

  const error = typeof sp.error === 'string' ? sp.error : undefined;
  const saved = sp.saved === '1';
  const uploaded = sp.uploaded === '1';

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xl font-semibold text-zinc-100">{job.title}</div>
        <div className="text-sm text-zinc-500">Manage the JD text/file used for interviews</div>
      </div>

      {error ? (
        <Card>
          <h3 className="text-sm font-medium text-red-400 mb-1">Action failed</h3>
          <p className="text-sm text-zinc-400">{error}</p>
        </Card>
      ) : null}

      {saved || uploaded ? (
        <Card>
          <h3 className="text-sm font-medium text-emerald-400 mb-1">Updated</h3>
          <p className="text-sm text-zinc-400">{saved ? 'Saved description.' : 'Uploaded JD file.'}</p>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-medium text-zinc-300">JD file</h3>
            <p className="text-xs text-zinc-500">Upload a file (pdf/doc/docx/txt). If you upload a .txt file, we will also overwrite the JD text from it.</p>
          </div>
          {job.jdUrl ? <Badge tone="good">Uploaded</Badge> : <Badge tone="neutral">Not uploaded</Badge>}
        </div>

        <div className="grid gap-3">
          {jdHref ? (
            <a className="text-sm underline" href={jdHref} target="_blank" rel="noreferrer">
              View current JD file
            </a>
          ) : null}

          <form action={uploadJd.bind(null, jobId)} className="flex flex-wrap items-center gap-3">
            <input name="file" type="file" accept=".pdf,.doc,.docx,.txt" />
            <Button type="submit" size="sm">
              Upload JD
            </Button>
          </form>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-1">JD text</h3>
        <p className="text-xs text-zinc-500 mb-3">Paste/edit the job description used for AI interview grounding.</p>

        <form action={updateDescription.bind(null, jobId)} className="grid gap-3">
          <textarea
            name="description"
            defaultValue={job.description}
            rows={12}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm"
          />
          <div>
            <Button type="submit">Save description</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
