'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Plus, RefreshCw } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { RISK_META } from '@/lib/risk';
import type { PatientAssessment, RiskLevel } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

type RiskFilter = 'ALL' | RiskLevel | 'MODERATE_HIGH';

const FILTER_OPTIONS: { value: RiskFilter; label: string }[] = [
  { value: 'ALL', label: 'All risk levels' },
  { value: 'LOW', label: 'Low risk only' },
  { value: 'MODERATE', label: 'Moderate risk only' },
  { value: 'HIGH', label: 'High risk only' },
  { value: 'MODERATE_HIGH', label: 'Moderate & High risk' },
];

function matchesFilter(level: RiskLevel, filter: RiskFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'MODERATE_HIGH') return level === 'MODERATE' || level === 'HIGH';
  return level === filter;
}

export default function DashboardPage() {
  const [patients, setPatients] = useState<PatientAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RiskFilter>('ALL');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/patients`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as { patients: PatientAssessment[] };
      setPatients(data.patients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () => patients.filter((p) => matchesFilter(p.riskLevel, filter)),
    [patients, filter],
  );

  const counts = useMemo(() => {
    const c: Record<RiskLevel, number> = { LOW: 0, MODERATE: 0, HIGH: 0 };
    for (const p of patients) c[p.riskLevel]++;
    return c;
  }, [patients]);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-brand px-6 pb-8 pt-9 text-brand-foreground md:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <LayoutDashboard className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight">Monitoring Dashboard</h1>
            <p className="mt-0.5 text-sm text-brand-muted">Assessed patients & follow-up actions</p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link href="/assessment">
              <Plus className="h-4 w-4" /> New Assessment
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto -mt-4 max-w-6xl space-y-4 p-4 md:p-6">
        {/* Risk count summary */}
        <div className="grid gap-3 sm:grid-cols-3">
          {(['LOW', 'MODERATE', 'HIGH'] as RiskLevel[]).map((level) => {
            const meta = RISK_META[level];
            return (
              <Card key={level}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{meta.label}</p>
                    <p className="text-2xl font-bold tabular-nums">{counts[level]}</p>
                  </div>
                  <Badge variant={meta.badgeVariant}>{meta.range}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Patients</CardTitle>
              <CardDescription>
                {loading ? 'Loading…' : `${filtered.length} of ${patients.length} shown`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filter} onValueChange={(v) => setFilter(v as RiskFilter)}>
                <SelectTrigger className="w-[190px]">
                  <SelectValue placeholder="Filter by risk" />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HN</TableHead>
                  <TableHead>Patient Name</TableHead>
                  <TableHead>Assessment Date</TableHead>
                  <TableHead className="text-center">Total Score</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead>Next Follow-up Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-destructive">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No patients match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => {
                    const meta = RISK_META[p.riskLevel];
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.hn}</TableCell>
                        <TableCell>{p.patientName}</TableCell>
                        <TableCell className="tabular-nums">{p.assessmentDate}</TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">
                          {p.totalScore}/12
                        </TableCell>
                        <TableCell>
                          <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.followUpAction}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
