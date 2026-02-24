import Link from 'next/link';
import { Button } from './ui/button';
import { Card } from './ui/card';

export default function Home() {
  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1 text-xs text-zinc-400">
            Campus Hiring • v1
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">Rozga Hiring Platform</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500">
            A modern SaaS-ready Hiring Management Platform. You’re currently focused on Campus Hiring: flows,
            candidate import, GD rounds, and interview allocation.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/login">
              <Button>Sign in</Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="secondary">Go to dashboard</Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Flow Builder</h3>
            <div className="text-sm text-zinc-400">APIs: /api/v1/campus/flows</div>
          </Card>
          <Card>
            <h3 className="text-sm font-medium text-zinc-300 mb-3">GD Rounds</h3>
            <div className="text-sm text-zinc-400">APIs: /api/v1/campus/gd/*</div>
          </Card>
          <Card>
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Interviews</h3>
            <div className="text-sm text-zinc-400">APIs: /api/v1/campus/interviews/*</div>
          </Card>
        </div>
      </div>
    </div>
  );
}
