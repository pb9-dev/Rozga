'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '../../../ui/button';
import { Dialog } from '../../../ui/dialog';
import { Input } from '../../../ui/input';
import { Select } from '../../../ui/select';

type Interviewer = { id: string; email: string };

type UpdateAction = (formData: FormData) => void | Promise<void>;

type CancelAction = (formData: FormData) => void | Promise<void>;

export function ManageInterviewAssignmentClient({
  assignmentId,
  currentMode,
  currentScheduledAt,
  currentInterviewerId,
  interviewers,
  updateAssignment,
  cancelAssignment,
}: {
  assignmentId: string;
  currentMode: 'ONLINE' | 'OFFLINE';
  currentScheduledAt?: string | null;
  currentInterviewerId: string;
  interviewers: Interviewer[];
  updateAssignment: UpdateAction;
  cancelAssignment: CancelAction;
}) {
  const [open, setOpen] = useState(false);

  const defaultScheduledLocal = useMemo(() => {
    if (!currentScheduledAt) return '';
    const d = new Date(currentScheduledAt);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }, [currentScheduledAt]);

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Manage
      </Button>

      <Dialog open={open} onOpenChange={setOpen} title="Manage interview">
        <div className="grid gap-4">
          <form action={updateAssignment} className="grid gap-3">
            <input type="hidden" name="assignmentId" value={assignmentId} />

            <Select name="interviewerUserId" label="Interviewer" defaultValue={currentInterviewerId}>
              {interviewers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </Select>

            <Select name="mode" label="Mode" defaultValue={currentMode}>
              <option value="ONLINE">ONLINE</option>
              <option value="OFFLINE">OFFLINE</option>
            </Select>

            <Input name="scheduledAt" label="Scheduled at (optional)" type="datetime-local" defaultValue={defaultScheduledLocal} />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button type="submit" variant="primary" size="sm" onClick={() => setOpen(false)}>
                Save
              </Button>
            </div>
          </form>

          <form
            action={cancelAssignment}
            onSubmit={(e) => {
              if (!confirm('Cancel (delete) this interview assignment?')) {
                e.preventDefault();
              }
            }}
            className="flex justify-end"
          >
            <input type="hidden" name="assignmentId" value={assignmentId} />
            <Button type="submit" variant="danger" onClick={() => setOpen(false)}>
              Cancel interview
            </Button>
          </form>
        </div>
      </Dialog>
    </>
  );
}
