import {
  Briefcase,
  Boxes,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  LayoutGrid,
  LogOut,
  Menu,
  Sparkles,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '../../lib/cn';

const hrNav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutGrid },
  { href: '/campus/batches', label: 'Batches', icon: Boxes },
  { href: '/campus/candidates', label: 'Candidates', icon: Users },
  { href: '/campus/jobs', label: 'Jobs', icon: FileText },
  { href: '/campus/flows', label: 'Flows', icon: ClipboardList },
  { href: '/campus/gd', label: 'GD Rounds', icon: Briefcase },
  { href: '/campus/interviews', label: 'Interviews', icon: CalendarClock },
  { href: '/campus/interviewers', label: 'Interviewers', icon: UserCog },
  { href: '/campus/ai', label: 'AI Interview', icon: Sparkles },
];

const interviewerNav = [
  { href: '/campus/interviews', label: 'My Interviews', icon: CalendarClock },
  { href: '/campus/gd', label: 'GD Evaluations', icon: Briefcase },
  { href: '/campus/ai', label: 'AI Interview', icon: Sparkles },
];

export function AppShell({
  children,
  activePath,
  userEmail,
  userRoles,
}: {
  children: React.ReactNode;
  activePath: string;
  userEmail?: string;
  userRoles: string[];
}) {
  const isHR = userRoles.includes('HR') || userRoles.includes('Admin');
  const nav = isHR ? hrNav : interviewerNav;
  const roleLabel = isHR ? 'HR / Admin' : 'Interviewer';

  async function onLogout() {
    try {
      await fetch('/api/session/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  }

  // Get the current page title from nav
  const currentPage = nav.find(
    (item) => activePath === item.href || activePath.startsWith(item.href + '/'),
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-zinc-800 bg-zinc-950 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-zinc-800 flex-shrink-0">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-indigo-600 text-white text-xs font-bold">
            R
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-100">Rozga</div>
            <div className="text-[10px] text-zinc-500 leading-none">Campus Hiring</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          <div className="space-y-0.5">
            {nav.map((item) => {
              const Icon = item.icon;
              const active =
                activePath === item.href || activePath.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                    active
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200',
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User footer */}
        <div className="border-t border-zinc-800 p-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="h-7 w-7 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-medium flex-shrink-0">
              {userEmail?.charAt(0).toUpperCase() ?? 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-xs text-zinc-300">{userEmail ?? '—'}</div>
              <div className="text-[10px] text-zinc-500">{roleLabel}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between h-14 px-5 border-b border-zinc-800 flex-shrink-0 bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-zinc-100">
              {currentPage?.label ?? 'Rozga'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 hidden sm:inline">{roleLabel}</span>
            {/* Mobile menu & logout */}
            <button
              type="button"
              onClick={onLogout}
              className="md:hidden flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Mobile nav bar */}
        <nav className="md:hidden flex items-center gap-1 px-3 py-2 border-b border-zinc-800 overflow-x-auto flex-shrink-0 bg-zinc-950/30">
          {nav.map((item) => {
            const Icon = item.icon;
            const active =
              activePath === item.href || activePath.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-5 py-5">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
