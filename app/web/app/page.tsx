'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  FileText,
  Users,
  CheckCircle2,
  Settings,
  Link2,
  ChevronRight,
  CalendarCheck,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';

const LINKS: { href: string; icon: LucideIcon; title: string; desc: string; tint: string }[] = [
];

export default function HomePage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Only a genuine LINE OAuth callback carries a one-time authorization `code`.
    const { search, hash } = window.location;
    if (/[?&]code=/.test(search)) {
      window.location.replace(`/register${search}${hash}`);
      return;
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-brand px-6 pb-10 pt-9 text-brand-foreground">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CalendarCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">ระบบ PediaSafe</h1>
            <p className="mt-0.5 text-sm text-brand-muted">เลือกเมนูที่ต้องการ</p>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-5 max-w-2xl space-y-3 p-4">
        {LINKS.map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.href} href={l.href} className="block">
              <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-md">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${l.tint}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-card-foreground">{l.title}</p>
                  <p className="text-sm text-muted-foreground">{l.desc}</p>
                </div>
                <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-muted-foreground/60" />
              </Card>
            </Link>
          );
        })}

      </main>
    </div>
  );
}
