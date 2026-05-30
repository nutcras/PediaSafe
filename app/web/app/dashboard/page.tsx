'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  CheckCircle2,
  ClipboardEdit,
  LayoutDashboard,
  Loader2,
  MessageSquareText,
  Minus,
  Phone,
  Pill,
  Plus,
  RefreshCw,
  Stethoscope,
  Thermometer,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { formatAge } from '@/lib/age';
import {
  DOMAINS,
  RISK_META,
  TEACHING_ITEMS,
  teachingStatusFor,
  type TeachingStatus,
} from '@/lib/risk';
import {
  buildFollowUpSchedule,
  computeNextFollowUp,
  FOLLOWUP_STATUS_META,
  NEXT_FOLLOWUP_STATUS_META,
  SYMPTOM_OPTIONS,
  type FollowUpStep,
} from '@/lib/followup';
import type {
  FollowUpEntry,
  FollowUpSymptom,
  PatientAssessment,
  RiskLevel,
} from '@/lib/types';

type RiskFilter = 'ALL' | RiskLevel | 'MODERATE_HIGH';

const FILTER_OPTIONS: { value: RiskFilter; label: string }[] = [
  { value: 'ALL', label: 'All risk levels' },
  { value: 'LOW', label: 'Low risk only' },
  { value: 'MODERATE', label: 'Moderate risk only' },
  { value: 'HIGH', label: 'High risk only' },
  { value: 'MODERATE_HIGH', label: 'Moderate & High risk' },
];

const SYMPTOM_ICONS: Record<FollowUpSymptom, LucideIcon> = {
  normal: CheckCircle2,
  fever: Thermometer,
  dyspnea: Wind,
  incomplete_meds: Pill,
  early_doctor_visit: Stethoscope,
};

function matchesFilter(level: RiskLevel, filter: RiskFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'MODERATE_HIGH') return level === 'MODERATE' || level === 'HIGH';
  return level === filter;
}

function formatDateDisplay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function DashboardPage() {
  const [patients, setPatients] = useState<PatientAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RiskFilter>('ALL');
  const [selected, setSelected] = useState<PatientAssessment | null>(null);
  const [logging, setLogging] = useState<PatientAssessment | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/patients');
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

  // Replace a patient in the list (after a follow-up is logged).
  function upsertPatient(updated: PatientAssessment) {
    setPatients((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelected((prev) => (prev?.id === updated.id ? updated : prev));
  }

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
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead>Next Follow-up</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-destructive">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No patients match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => {
                    const meta = RISK_META[p.riskLevel];
                    const next = computeNextFollowUp(
                      p.assessmentDate,
                      p.riskLevel,
                      p.followUps ?? [],
                      p.nextAppointmentDate,
                    );
                    const statusMeta = NEXT_FOLLOWUP_STATUS_META[next.status];
                    return (
                      <TableRow
                        key={p.id}
                        onClick={() => setSelected(p)}
                        className="cursor-pointer"
                      >
                        <TableCell className="font-medium">{p.hn}</TableCell>
                        <TableCell>{p.patientName}</TableCell>
                        <TableCell className="tabular-nums">{p.assessmentDate}</TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">
                          {p.totalScore}/12
                        </TableCell>
                        <TableCell>
                          <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {next.date ? (
                            <span className="flex flex-col">
                              <span className="font-medium text-card-foreground">
                                {formatDateDisplay(next.date)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Round {next.round}
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusMeta.badgeVariant}>
                            {statusMeta.thaiLabel}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLogging(p)}
                          >
                            <ClipboardEdit className="h-4 w-4" />
                            Log
                          </Button>
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

      <PatientDetailSheet patient={selected} onClose={() => setSelected(null)} />
      <LogFollowUpDialog
        patient={logging}
        onClose={() => setLogging(null)}
        onLogged={upsertPatient}
      />
    </div>
  );
}

// ── Patient details slide-over ──────────────────────────────────────────────
function PatientDetailSheet({
  patient,
  onClose,
}: {
  patient: PatientAssessment | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!patient} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        {patient && <PatientDetailBody patient={patient} />}
      </SheetContent>
    </Sheet>
  );
}

function PatientDetailBody({ patient }: { patient: PatientAssessment }) {
  const meta = RISK_META[patient.riskLevel];
  const schedule = buildFollowUpSchedule(
    patient.assessmentDate,
    patient.riskLevel,
    patient.followUps ?? [],
    patient.nextAppointmentDate,
  );
  const teachBack = patient.teachBack;
  const showTeachBack = patient.riskLevel !== 'LOW';

  return (
    <>
      {/* Header */}
      <SheetHeader className="border-b bg-muted/40 p-6 pr-12">
        <SheetTitle className="text-xl">{patient.patientName}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">{patient.hn}</span>
          <span aria-hidden>·</span>
          <span>{formatAge(patient.dob)}</span>
        </SheetDescription>
        <div className="pt-1">
          <Badge variant={meta.badgeVariant} className="px-3 py-1 text-sm">
            {meta.label} · {patient.totalScore}/12
          </Badge>
        </div>
      </SheetHeader>

      <div className="space-y-6 p-6">
        {/* Contact */}
        <Section title="Contact">
          <DetailRow label="Caregiver's phone">
            <a
              href={`tel:${patient.caregiverPhone}`}
              className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
            >
              <Phone className="h-3.5 w-3.5" />
              {patient.caregiverPhone}
            </a>
          </DetailRow>
          <DetailRow label="Assessment date">{patient.assessmentDate}</DetailRow>
          <DetailRow label="Assessor">
            {patient.assessorName}
            <span className="block text-xs text-muted-foreground">
              {patient.assessorRole === 'admin' ? 'Manager' : 'Pediatric Nurse'}
            </span>
          </DetailRow>
        </Section>

        {/* Domain scores */}
        <Section title="Assessment history">
          <div className="space-y-2">
            {DOMAINS.map((d) => {
              const score = patient.domains[d.key];
              const optionLabel = d.options.find((o) => o.value === score)?.label ?? '—';
              return (
                <div
                  key={d.key}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-card-foreground">{d.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{optionLabel}</p>
                  </div>
                  <Badge variant="muted" className="shrink-0">
                    {score}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Discharge teaching — 3-state */}
        <Section title="Discharge teaching">
          <ul className="space-y-1.5">
            {TEACHING_ITEMS.map((item) => {
              const status = teachingStatusFor(
                item.key,
                patient.teachingCompleted ?? [],
                patient.teachingNA ?? [],
              );
              return (
                <li key={item.key} className="flex items-center gap-2.5 text-sm">
                  <StatusDot status={status} />
                  <span
                    className={cn(
                      status === 'TAUGHT' && 'text-card-foreground',
                      status === 'NA' && 'text-muted-foreground italic',
                      status === 'NOT_DONE' && 'text-muted-foreground',
                    )}
                  >
                    {item.label}
                  </span>
                  {status === 'NA' && (
                    <Badge variant="muted" className="ml-auto">N/A</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>

        {/* Teach-back */}
        {showTeachBack && teachBack && (
          <Section title="Teach-back">
            {teachBack.performed ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={teachBack.result === 'PASS' ? 'success' : 'destructive'}
                  >
                    {teachBack.result === 'PASS' ? 'Passed' : 'Did not pass'}
                  </Badge>
                </div>
                {teachBack.note && (
                  <p className="rounded-lg bg-muted/50 p-3 text-sm text-card-foreground">
                    {teachBack.note}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">Not yet performed.</p>
            )}
          </Section>
        )}

        {/* Follow-up schedule */}
        <Section title="Follow-up schedule">
          <div className="space-y-2">
            <FollowUpRow step={schedule.call48to72} />
            <FollowUpRow step={schedule.day7} />
            <FollowUpRow step={schedule.nextAppointment} highlight />
          </div>
        </Section>

        {/* Follow-up history */}
        <Section title="Follow-up contacts">
          {(patient.followUps ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No contacts logged yet.</p>
          ) : (
            <ul className="space-y-2">
              {patient.followUps.map((entry) => (
                <FollowUpHistoryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

function FollowUpRow({ step, highlight }: { step: FollowUpStep; highlight?: boolean }) {
  const status = FOLLOWUP_STATUS_META[step.status];
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-lg border p-3',
        highlight && 'border-primary/40 bg-accent/40',
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-card-foreground">{step.label}</p>
        <p className="text-xs text-muted-foreground">{step.date ?? 'Not scheduled'}</p>
      </div>
      <Badge variant={status.badgeVariant} className="shrink-0">
        {status.label}
      </Badge>
    </div>
  );
}

function FollowUpHistoryRow({ entry }: { entry: FollowUpEntry }) {
  const symptom = SYMPTOM_OPTIONS.find((s) => s.key === entry.symptomsStatus);
  const Icon = SYMPTOM_ICONS[entry.symptomsStatus];
  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Round {entry.round}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(entry.followUpDate).toLocaleString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <Badge variant={symptom?.variant ?? 'muted'} className="shrink-0">
          <Icon className="h-3 w-3" />
          {symptom?.thaiLabel ?? entry.symptomsStatus}
        </Badge>
      </div>
      {entry.note && (
        <p className="mt-2 text-sm text-card-foreground">{entry.note}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">by {entry.assessorName}</p>
    </li>
  );
}

function StatusDot({ status }: { status: TeachingStatus }) {
  if (status === 'TAUGHT') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (status === 'NA') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Minus className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40" />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-card-foreground">{children}</span>
    </div>
  );
}

// ── Log Follow-up dialog ────────────────────────────────────────────────────
function LogFollowUpDialog({
  patient,
  onClose,
  onLogged,
}: {
  patient: PatientAssessment | null;
  onClose: () => void;
  onLogged: (p: PatientAssessment) => void;
}) {
  const [symptom, setSymptom] = useState<FollowUpSymptom | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset state whenever the dialog opens for a new patient.
  useEffect(() => {
    if (patient) {
      setSymptom(null);
      setNote('');
    }
  }, [patient?.id]);

  if (!patient) return null;

  const nextRound = (patient.followUps?.length ?? 0) + 1;

  async function submit() {
    if (!symptom || !patient) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/patients/${patient.id}/follow-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptomsStatus: symptom,
          note,
          followUpDate: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { patient: PatientAssessment };
      onLogged(data.patient);
      toast.success(`Follow-up round ${nextRound} saved`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save follow-up');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!patient} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log follow-up — {patient.patientName}</DialogTitle>
          <DialogDescription>
            Round {nextRound} · {patient.hn} ·{' '}
            <Badge variant={RISK_META[patient.riskLevel].badgeVariant} className="ml-1">
              {RISK_META[patient.riskLevel].label}
            </Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Symptoms (เลือกอาการ)
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SYMPTOM_OPTIONS.map((opt) => {
                const Icon = SYMPTOM_ICONS[opt.key];
                const selected = symptom === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSymptom(opt.key)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors',
                      selected
                        ? 'border-primary bg-accent text-foreground shadow-sm'
                        : 'border-border bg-card hover:bg-muted/40',
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-6 w-6',
                        opt.variant === 'success' && 'text-success',
                        opt.variant === 'warning' && 'text-warning',
                        opt.variant === 'destructive' && 'text-destructive',
                      )}
                    />
                    <span className="text-xs font-medium leading-tight">{opt.thaiLabel}</span>
                    <span className="text-[10px] text-muted-foreground">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="follow-up-note"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Notes (บันทึกเพิ่มเติม)
            </label>
            <Textarea
              id="follow-up-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Caregiver reports fever 38.2°C since yesterday."
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!symptom || saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquareText className="h-4 w-4" />
            )}
            {saving ? 'Saving…' : 'Save follow-up'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
