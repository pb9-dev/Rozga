'use client';

import { usePathname } from 'next/navigation';
import { AppShell } from '../ui/shell/app-shell';

export function Shell({
  children,
  userEmail,
  userRoles,
}: {
  children: React.ReactNode;
  userEmail?: string;
  userRoles: string[];
}) {
  const pathname = usePathname();
  return (
    <AppShell activePath={pathname} userEmail={userEmail} userRoles={userRoles}>
      {children}
    </AppShell>
  );
}
