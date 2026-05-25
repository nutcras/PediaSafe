'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Home,
  ClipboardList,
  LayoutDashboard,
  ShieldPlus,
  Users,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/assessment', label: 'New Assessment', icon: ClipboardList },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin', label: 'User Management', icon: Users, adminOnly: true },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();

  // No shell chrome on the home hub or the login page.
  if (pathname === '/' || pathname === '/login') return <>{children}</>;

  const items = NAV.filter((n) => !n.adminOnly || user?.role === 'admin');

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
        <ShieldPlus className="h-[18px] w-[18px]" />
      </div>
      <span className="text-base font-bold tracking-tight text-brand-foreground">PediaSafe</span>
    </div>
  );

  const UserFooter = () => {
    if (!user) return null;
    return (
      <div className="mt-auto border-t border-white/10 p-3">
        <div className="px-1 pb-2">
          <p className="truncate text-sm font-medium text-brand-foreground">{user.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant={user.role === 'admin' ? 'warning' : 'secondary'}>
              {user.role === 'admin' ? 'Admin' : 'Assessor'}
            </Badge>
            <span className="truncate text-xs text-brand-foreground/60">@{user.username}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-foreground/80 transition-colors hover:bg-white/10 hover:text-brand-foreground"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          Sign out
        </button>
      </div>
    );
  };

  return (
    <div className="md:pl-60">
      {/* Desktop sidebar */}
      <aside className="hidden bg-brand md:fixed md:inset-y-0 md:left-0 md:flex md:w-60 md:flex-col">
        <Brand />
        <Links />
        <UserFooter />
      </aside>

      {/* Mobile hamburger */}
      <button
        type="button"
        aria-label="Open menu"
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
              <span className="text-base font-bold text-brand-foreground">PediaSafe</span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-brand-foreground/70 hover:bg-white/10 hover:text-brand-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <Links onNavigate={() => setOpen(false)} />
            <UserFooter />
          </aside>
        </div>
      )}

      {children}
    </div>
  );
}
