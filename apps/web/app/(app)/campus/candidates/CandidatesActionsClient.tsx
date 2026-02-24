'use client';

import React, { useState } from 'react';
import { Button } from '../../../ui/button';
import { Dialog } from '../../../ui/dialog';
import { Input } from '../../../ui/input';
import { Select } from '../../../ui/select';
import { ImportCandidatesClient } from './ImportCandidatesClient';

type BatchOption = { id: string; name: string; college?: { name: string }; job?: { title: string } };

type ServerAction = (formData: FormData) => void | Promise<void>;

export function CandidatesActionsClient({
  batches,
  selectedBatchId,
  createCandidateAction,
  importCandidatesAction,
}: {
  batches: BatchOption[];
  selectedBatchId: string;
  createCandidateAction: ServerAction;
  importCandidatesAction: ServerAction;
}) {
  const [openCreate, setOpenCreate] = useState(false);
  const [openImport, setOpenImport] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Candidates</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Import, manage, and move candidates across stages</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpenImport(true)}>
            Import CSV
          </Button>
          <Button variant="primary" size="sm" onClick={() => setOpenCreate(true)}>
            Add candidate
          </Button>
        </div>
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate} title="Add candidate">
        <form action={createCandidateAction} className="grid gap-3">
          <Select name="batchId" label="Batch" defaultValue={selectedBatchId}>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}{b.college?.name ? ` — ${b.college.name}` : ''}{b.job?.title ? ` — ${b.job.title}` : ''}
              </option>
            ))}
          </Select>

          <Input name="fullName" label="Full name" placeholder="Jane Doe" />

          <div className="grid gap-3 md:grid-cols-2">
            <Input name="email" label="Email (optional)" placeholder="jane@college.edu" />
            <Input name="phone" label="Phone (optional)" placeholder="+91..." />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Input name="department" label="Department (optional)" placeholder="CSE" />
            <Input name="rollNumber" label="Roll number (optional)" placeholder="ABC123" />
          </div>

          <Input name="resumeUrl" label="Resume URL (optional)" placeholder="https://..." />

          <div className="flex justify-end">
            <Button type="submit" variant="secondary">
              Create candidate
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={openImport} onOpenChange={setOpenImport} title="Import candidates">
        <ImportCandidatesClient batches={batches} selectedBatchId={selectedBatchId} importAction={importCandidatesAction} />
      </Dialog>
    </>
  );
}
