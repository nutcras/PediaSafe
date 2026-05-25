'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Home,
  FileText,
  Users,
  CheckCircle2,
  Settings,
  Link2,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useRegistered } from '../lib/useLiff';
import { cn } from '@/lib/utils';

const NAV: { href: string; label: string; icon: LucideIcon }[] = [ 
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Don't run LIFF on the homepage (it has no shell and handles its own callback).
  const registered = useRegistered(pathname !== '/');

  // The homepage is already a navigation hub → no shell chrome there.
  if (pathname === '/') return <>{children}</>;

  // Hide "ลงทะเบียน" once the user is registered.
  const items = NAV.filter((n) => n.href !== '/register' || registered !== true);

  const Links = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex flex-col gap-1 p-3">
      {items.map((n) => {
        const active = pathname === n.href;
        const Icon = n.icon;
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-brand-foreground/80 hover:bg-white/10 hover:text-brand-foreground',
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  const Brand = () => (
    <div className="flex items-center gap-2 border-b border-white/10 px-4 py-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <CheckCircle2 className="h-[18px] w-[18px]" />
      </div>
      <span className="text-base font-bold tracking-tight text-brand-foreground">ระบบลางาน</span>
    </div>
  );

  return (
    <div className="md:pl-60">
      {/* Desktop sidebar */}
      <aside className="hidden bg-brand md:fixed md:inset-y-0 md:left-0 md:flex md:w-60 md:flex-col">
        <Brand />
        <Links />
      </aside>

      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label="เปิดเมนู"
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-brand shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
              <span className="text-base font-bold text-brand-foreground">ระบบลางาน</span>
              <button
                type="button"
                aria-label="ปิดเมนู"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-brand-foreground/70 hover:bg-white/10 hover:text-brand-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Links onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      {children}
    </div>
  );
}
