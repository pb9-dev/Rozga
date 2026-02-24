'use client';

import { useActionState, useMemo } from 'react';
import { Button } from '../../../ui/button';

type ActionResult =
  | { ok: true; token: string; expiresAt?: string | null }
  | { ok: false; message: string };

export function InterviewRoomActionsClient({
  assignmentId,
  generateLink,
}: {
  assignmentId: string;
  generateLink: (formData: FormData) => Promise<ActionResult>;
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(
    async (_prev, formData) => {
      return generateLink(formData);
    },
    { ok: false, message: '' },
  );

  const link = useMemo(() => {
    if (!state.ok) return null;
    return `${window.location.origin}/interview/${state.token}`;
  }, [state]);

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
  };

  return (
    <div className="grid gap-2">
      <form action={action}>
        <input type="hidden" name="assignmentId" value={assignmentId} />
        <Button type="submit" variant="ghost" disabled={pending}>
          {pending ? 'Generating…' : 'Generate candidate link'}
        </Button>
      </form>

      {state.ok ? (
        <div className="rounded-md border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-400">
          <div className="break-all font-mono">{link}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={copy}>
              Copy
            </Button>
            {state.expiresAt ? <span className="text-zinc-500">Expires: {new Date(state.expiresAt).toLocaleString()}</span> : null}
          </div>
        </div>
      ) : state.message ? (
        <div className="text-xs text-red-400">{state.message}</div>
      ) : null}
    </div>
  );
}
