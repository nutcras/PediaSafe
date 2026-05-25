import Link from 'next/link';
import {
  ClipboardList,
  LayoutDashboard,
  ChevronRight,
  ShieldPlus,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';

const LINKS: { href: string; icon: LucideIcon; title: string; desc: string; tint: string }[] = [
  {
    href: '/assessment',
    icon: ClipboardList,
    title: 'New Risk Assessment',
    desc: 'Evaluate a patient and calculate readmission risk',
    tint: 'bg-primary/15 text-primary',
  },
  {
    href: '/dashboard',
    icon: LayoutDashboard,
    title: 'Monitoring Dashboard',
    desc: 'Review assessed patients and follow-up actions',
    tint: 'bg-success/15 text-success',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-brand px-6 pb-10 pt-9 text-brand-foreground">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldPlus className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">PediaSafe</h1>
            <p className="mt-0.5 text-sm text-brand-muted">
              Pneumonia Readmission Risk Assessment Tool
            </p>
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
