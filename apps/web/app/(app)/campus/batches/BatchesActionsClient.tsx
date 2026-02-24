'use client';

import React, { useState } from 'react';
import { Button } from '../../../ui/button';
import { Dialog } from '../../../ui/dialog';
import { Input } from '../../../ui/input';
import { Select } from '../../../ui/select';
import { CollegePickerClient } from './CollegePickerClient';
import { ImportCollegesClient } from './ImportCollegesClient';

type Lookups = {
  colleges: { id: string; code: string; name: string }[];
  jobs: { id: string; title: string }[];
  flows: { id: string; name: string; version: number; isActive: boolean; college?: { name: string; code: string } }[];
};

type ServerAction = (formData: FormData) => void | Promise<void>;

export function BatchesActionsClient({
  lookups,
  createBatchAction,
}: {
  lookups: Lookups;
  createBatchAction: ServerAction;
}) {
  const [openCreate, setOpenCreate] = useState(false);
  const [openImportColleges, setOpenImportColleges] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Batches</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Organize campus drives by college, job, and flow</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpenImportColleges(true)}>
            Import colleges
          </Button>
          <Button variant="primary" size="sm" onClick={() => setOpenCreate(true)}>
            Create batch
          </Button>
        </div>
      </div>

      <Dialog open={openCreate} onOpenChange={setOpenCreate} title="Create batch">
        <form action={createBatchAction} className="grid gap-3">
          <Input name="name" label="Name" placeholder="ABC - 2026 Batch" />

          <CollegePickerClient
            name="collegeId"
            label="College"
            existing={lookups.colleges}
          />

          <Select name="jobId" label="Job" defaultValue={lookups.jobs[0]?.id ?? ''}>
            {lookups.jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </Select>

          <Select name="flowId" label="Flow" defaultValue={lookups.flows[0]?.id ?? ''}>
            {lookups.flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.isActive ? '★ ' : ''}{f.name} (v{f.version}){f.college?.name ? ` — ${f.college.name}` : ''}
              </option>
            ))}
          </Select>

          <Input name="startsAt" type="datetime-local" label="Starts at (optional)" />

          <div className="flex justify-end">
            <Button type="submit" variant="secondary">
              Create
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={openImportColleges} onOpenChange={setOpenImportColleges} title="Import colleges">
        <ImportCollegesClient />
      </Dialog>
    </>
  );
}
