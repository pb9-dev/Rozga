import { apiFetch } from '../../../lib/api';
import { Badge } from '../../../ui/badge';
import { Card } from '../../../ui/card';
import { Table, Td, Th } from '../../../ui/table';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { CampusHiringFlowUpsertSchema } from '@rozga/shared';
import { FlowsActionsClient } from './FlowsActionsClient';

type Stage = { id: string; key: string; name: string; kind: string; order: number };
type Transition = { id: string; fromStageKey: string; toStageKey: string };
type Flow = {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  updatedAt: string;
  stages?: Stage[];
  transitions?: Transition[];
};

type Lookups = {
  colleges: { id: string; code: string; name: string }[];
};

const CreateFlowFormSchema = z.object({
  collegeId: z.string().uuid(),
  name: z.string().min(1),
  isActive: z.boolean().optional(),
  config: z.string().min(2),
});

async function createFlow(formData: FormData) {
  'use server';

  const parsed = CreateFlowFormSchema.safeParse({
    collegeId: String(formData.get('collegeId') ?? ''),
    name: String(formData.get('name') ?? ''),
    isActive: String(formData.get('isActive') ?? '') === 'on',
    config: String(formData.get('config') ?? ''),
  });

  if (!parsed.success) redirect(`/campus/flows?error=${encodeURIComponent('Invalid input')}`);

  let config: unknown;
  try {
    config = JSON.parse(parsed.data.config);
  } catch {
    redirect(`/campus/flows?error=${encodeURIComponent('Invalid flow config')}`);
  }

  // Keep config.name aligned with DTO name.
  const validated = CampusHiringFlowUpsertSchema.safeParse({
    ...(typeof config === 'object' && config ? (config as any) : {}),
    name: parsed.data.name,
  });
  if (!validated.success) {
    redirect(`/campus/flows?error=${encodeURIComponent('Invalid stages/transitions')}`);
  }

  try {
    await apiFetch('/api/v1/campus/flows', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        collegeId: parsed.data.collegeId,
        name: parsed.data.name,
        isActive: parsed.data.isActive,
        config: validated.data,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Create failed';
    redirect(`/campus/flows?error=${encodeURIComponent(msg)}`);
  }

  redirect('/campus/flows?created=1');
}

export default async function FlowsPage() {
  const res = await apiFetch('/api/v1/campus/flows');
  const flowsJson = (await res.json()) as any;
  const flows: Flow[] = Array.isArray(flowsJson?.value) ? flowsJson.value : flowsJson;

  const lookupsRes = await apiFetch('/api/v1/campus/lookups');
  const lookups = (await lookupsRes.json()) as Lookups;

  const active = flows.filter((f) => f.isActive).length;

  return (
    <div className="space-y-5">
      <FlowsActionsClient colleges={lookups.colleges ?? []} createFlowAction={createFlow} />

      {flows.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500 text-center py-4">No flows defined yet.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {flows.map((f: Flow) => (
            <Card key={f.id}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-medium text-zinc-200">{f.name}</h3>
                  <p className="text-xs text-zinc-500">v{f.version} &middot; Updated {new Date(f.updatedAt).toLocaleDateString()}</p>
                </div>
                <Badge tone={f.isActive ? 'good' : 'neutral'}>{f.isActive ? 'Active' : 'Inactive'}</Badge>
              </div>

              <div className="grid gap-4">
                <div>
                  <div className="mb-1.5 text-xs font-medium text-zinc-400">Stages</div>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Order</Th>
                        <Th>Key</Th>
                        <Th>Name</Th>
                        <Th>Kind</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(f.stages ?? [])
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((s) => (
                          <tr key={s.id}>
                            <Td className="tabular-nums">{s.order}</Td>
                            <Td className="text-zinc-400 font-mono text-xs">{s.key}</Td>
                            <Td className="font-medium text-zinc-200">{s.name}</Td>
                            <Td className="text-zinc-400">{s.kind}</Td>
                          </tr>
                        ))}
                    </tbody>
                  </Table>
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-medium text-zinc-400">Transitions</div>
                  <Table>
                    <thead>
                      <tr>
                        <Th>From</Th>
                        <Th>To</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(f.transitions ?? []).map((t) => (
                        <tr key={t.id}>
                          <Td className="text-zinc-400 font-mono text-xs">{t.fromStageKey}</Td>
                          <Td className="text-zinc-200 font-mono text-xs">{t.toStageKey}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Active flows: <span className="text-zinc-300">{active}</span>
      </p>
    </div>
  );
}
