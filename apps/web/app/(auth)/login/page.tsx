'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { Input } from '../../ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const tenantSlug = String(formData.get('tenantSlug') ?? '');
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    const res = await fetch('/api/session/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantSlug, email, password }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setError(text || 'Login failed');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-8">
          <div className="text-xl font-semibold text-zinc-100">Rozga</div>
          <div className="text-sm text-zinc-500">Sign in to Campus Hiring</div>
        </div>

        <Card>
          <h3 className="text-base font-semibold text-zinc-200 mb-1">Sign in</h3>
          <p className="text-xs text-zinc-500 mb-4">Use the seeded demo admin to start exploring.</p>

          <form action={onSubmit} className="space-y-4">
            <Input name="tenantSlug" label="Tenant" defaultValue="demo" placeholder="demo" />
            <Input name="email" label="Email" defaultValue="admin@demo.local" placeholder="admin@demo.local" />
            <Input name="password" type="password" label="Password" defaultValue="Password123!" />

            {error ? (
              <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>

            <div className="text-xs text-zinc-600">
              Tip: ensure API is running at <span className="font-mono">http://localhost:3001</span>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
