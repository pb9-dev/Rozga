'use client';

import React, { useEffect } from 'react';
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../ui/button';
import { Card } from '../../../ui/card';
import { Input } from '../../../ui/input';
import { Table, Td, Th } from '../../../ui/table';

type Interviewer = { id: string; email: string; roles?: string[] };

type ActionState =
  | { ok: true; message: string; created: boolean; tempPassword?: string }
  | { ok: false; message: string };

type UpsertAction = (prevState: ActionState | null, formData: FormData) => Promise<ActionState>;

export function InterviewersClient({ interviewers, upsertAction }: { interviewers: Interviewer[]; upsertAction: UpsertAction }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState | null, FormData>(upsertAction as any, null);

  useEffect(() => {
    if (!state) return;
    // Refresh to reflect new interviewer list.
    router.refresh();
  }, [state, router]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Interviewers</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Add interviewers and manage access.</p>
        </div>
      </div>

      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Add interviewer</h3>
        <form action={formAction} className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Input name="email" label="Email" placeholder="interviewer@company.com" />
            <Input name="tempPassword" label="Temp password (optional)" placeholder="Leave blank to auto-generate" />
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" size="sm" disabled={isPending}>
              {isPending ? 'Saving...' : 'Add / promote'}
            </Button>
          </div>

          {state ? (
            <div className={state.ok ? 'text-sm text-green-400' : 'text-sm text-red-400'}>
              {state.message}
              {state.ok && state.created && state.tempPassword ? (
                <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <div className="text-xs text-zinc-500">One-time temp password</div>
                  <div className="mt-1 font-mono text-sm text-zinc-200">{state.tempPassword}</div>
                  <div className="mt-1 text-xs text-zinc-600">Copy it now - it will not be shown again.</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </form>
      </Card>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-400">All interviewers</h2>
        </div>

        {interviewers.length === 0 ? (
          <Card>
            <p className="text-sm text-zinc-500 text-center py-4">No interviewers yet.</p>
          </Card>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Roles</Th>
              </tr>
            </thead>
            <tbody>
              {interviewers.map((u) => (
                <tr key={u.id}>
                  <Td className="font-medium text-zinc-200">{u.email}</Td>
                  <Td className="text-zinc-400">{(u.roles ?? []).join(', ') || 'Interviewer'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}