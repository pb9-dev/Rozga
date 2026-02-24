import { apiFetch } from '../../lib/api';
import { Badge } from '../../ui/badge';
import { Card } from '../../ui/card';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Boxes, CalendarClock, Sparkles, Users } from 'lucide-react';

export default async function DashboardPage() {
  const meRes = await apiFetch('/api/v1/auth/me');
  const me = (await meRes.json()) as { roles?: string[] };
  const roles = me.roles ?? [];
  const isHR = roles.includes('HR') || roles.includes('Admin');
  if (!isHR) redirect('/campus/interviews');

  const batchesRes = await apiFetch('/api/v1/campus/batches');
  const batchesJson = (await batchesRes.json()) as unknown;

  const count = Array.isArray((batchesJson as any)?.value)
    ? (batchesJson as any).value.length
    : Array.isArray(batchesJson)
      ? (batchesJson as any).length
      : 0;

  const quickLinks = [
    { href: '/campus/batches', label: 'Batches', description: 'Create campus drives', icon: Boxes },
    { href: '/campus/candidates', label: 'Candidates', description: 'Import & manage', icon: Users },
    { href: '/campus/interviews', label: 'Interviews', description: 'Schedule & evaluate', icon: CalendarClock },
    { href: '/campus/ai', label: 'AI Interview', description: 'Start AI sessions', icon: Sparkles },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Overview</h1>
        <p className="text-sm text-zinc-500 mt-1">Campus hiring operations at a glance</p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-500 font-medium">Active Batches</div>
              <div className="text-2xl font-semibold text-zinc-100 mt-1">{count}</div>
            </div>
            <Boxes className="h-8 w-8 text-zinc-700" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-500 font-medium">API Status</div>
              <div className="mt-1"><Badge tone="good">Connected</Badge></div>
            </div>
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
          </div>
        </Card>

        <Card className="col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-500 font-medium">Tenant</div>
              <div className="text-sm text-zinc-300 mt-1 font-medium">Demo</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Quick actions</h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href}>
                <Card className="hover:bg-zinc-800/50 transition-colors cursor-pointer h-full">
                  <div className="flex flex-col gap-2">
                    <Icon className="h-5 w-5 text-indigo-400" />
                    <div>
                      <div className="text-sm font-medium text-zinc-200">{link.label}</div>
                      <div className="text-xs text-zinc-500">{link.description}</div>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
