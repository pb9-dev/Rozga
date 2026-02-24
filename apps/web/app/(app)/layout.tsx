import { redirect } from 'next/navigation';
import { apiFetch } from '../lib/api';
import { Shell } from './_shell';

async function getMe() {
  try {
    const res = await apiFetch('/api/v1/auth/me');
    return (await res.json()) as { email?: string; roles?: string[] };
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect('/login');

  return (
    <Shell userEmail={me.email} userRoles={me.roles ?? []}>
      {children}
    </Shell>
  );
}
