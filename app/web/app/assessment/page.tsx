'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  CalendarIcon,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MessageSquareText,
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
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatAge } from '@/lib/age';
import {
  DOMAINS,
  TEACHING_ITEMS,
  riskMetaFromScore,
  type TeachingStatus,
} from '@/lib/risk';
import type { DomainKey, TeachBackResult } from '@/lib/types';

interface PatientInfo {
  hn: string;
  patientName: string;
  dob: string; // YYYY-MM-DD
  assessmentDate: string;
  caregiverPhone: string;
}

const EMPTY_INFO: PatientInfo = {
  hn: '',
  patientName: '',
  dob: '',
  assessmentDate: new Date().toISOString().slice(0, 10),
  caregiverPhone: '',
};

// Local-date helpers (avoid UTC shifting a calendar selection by a day).
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromISODate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}
function formatDateDisplay(iso: string): string {
  return fromISODate(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const POSITION_LABEL: Record<'admin' | 'assessor', string> = {
  admin: 'Manager / Pediatric Lead',
  assessor: 'Pediatric Nurse',
};

export default function AssessmentPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [info, setInfo] = useState<PatientInfo>(EMPTY_INFO);
  const [dobOpen, setDobOpen] = useState(false);
  const [assessmentOpen, setAssessmentOpen] = useState(false);
  const [apptOpen, setApptOpen] = useState(false);
  const [nextAppointmentDate, setNextAppointmentDate] = useState<string>('');
  const [domains, setDomains] = useState<Partial<Record<DomainKey, number>>>({});
  const [teaching, setTeaching] = useState<Record<string, TeachingStatus>>({});
  const [teachBackPerformed, setTeachBackPerformed] = useState(false);
  const [teachBackResult, setTeachBackResult] = useState<TeachBackResult | null>(null);
  const [teachBackNote, setTeachBackNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const today = new Date();
  const earliestDob = new Date(today.getFullYear() - 18, 0, 1);
  const earliestAssessment = new Date(today.getFullYear() - 2, 0, 1);
  const latestAppt = new Date(today.getFullYear() + 2, 11, 31);

  // ── Reactive scoring ────────────────────────────────────────────────────────
  const answeredCount = Object.keys(domains).length;
  const totalScore = useMemo(
    () => DOMAINS.reduce((sum, d) => sum + (domains[d.key] ?? 0), 0),
    [domains],
  );
  const risk = riskMetaFromScore(totalScore);
  const complete = answeredCount === DOMAINS.length;
  const needsTeachBack = risk.level === 'MODERATE' || risk.level === 'HIGH';

  const setField = (key: keyof PatientInfo, value: string) =>
    setInfo((prev) => ({ ...prev, [key]: value }));

  const setTeachingFor = (key: string, status: TeachingStatus | null) =>
    setTeaching((prev) => {
      if (!status) {
        const { [key]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: status };
    });

  const infoComplete = Object.values(info).every((v) => v.trim() !== '');
  const teachBackOk = !needsTeachBack || !teachBackPerformed || teachBackResult !== null;
  const canSubmit = infoComplete && complete && teachBackOk && !submitting;

  async function handleSubmit() {
    if (!canSubmit) {
      toast.error('Please complete all patient fields and score all 4 domains.');
      return;
    }
    setSubmitting(true);
    try {
      const teachingCompleted = Object.entries(teaching)
        .filter(([, v]) => v === 'TAUGHT')
        .map(([k]) => k);
      const teachingNA = Object.entries(teaching)
        .filter(([, v]) => v === 'NA')
        .map(([k]) => k);

      const res = await apiFetch('/api/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...info,
          assessorName: user?.name,
          domains: {
            clinicalSeverity: domains.clinicalSeverity,
            hostFactors: domains.hostFactors,
            caregiverCompetency: domains.caregiverCompetency,
            environment: domains.environment,
          },
          teachingCompleted,
          teachingNA,
          teachBack: {
            performed: needsTeachBack && teachBackPerformed,
            result: needsTeachBack && teachBackPerformed ? teachBackResult : null,
            note: teachBackNote,
          },
          nextAppointmentDate: nextAppointmentDate || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      toast.success(`Assessment saved — ${risk.label} (score ${totalScore}/12)`);
      router.push('/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save assessment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-brand px-6 pb-8 pt-9 text-brand-foreground md:px-8">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Risk Assessment</h1>
            <p className="mt-0.5 text-sm text-brand-muted">
              Pneumonia readmission risk evaluation
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-4 max-w-5xl p-4 md:p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* ── Form column ───────────────────────────────────────────────── */}
          <div className="space-y-6">
            {/* Patient information */}
            <Card>
              <CardHeader>
                <CardTitle>Patient Information</CardTitle>
                <CardDescription>Identification and contact details</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field id="patientName" label="Patient Name">
                  <Input
                    id="patientName"
                    value={info.patientName}
                    onChange={(e) => setField('patientName', e.target.value)}
                    placeholder="e.g. Nong Mali"
                  />
                </Field>
                <Field id="hn" label="HN (Hospital Number)">
                  <Input
                    id="hn"
                    value={info.hn}
                    onChange={(e) => setField('hn', e.target.value)}
                    placeholder="e.g. HN-67-0012"
                  />
                </Field>
                <Field id="dob" label="Date of Birth">
                  <Popover open={dobOpen} onOpenChange={setDobOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="dob"
                        type="button"
                        variant="outline"
                        className={cn('w-full justify-start font-normal', !info.dob && 'text-muted-foreground')}
                      >
                        <CalendarIcon className="h-4 w-4" />
                        {info.dob ? formatDateDisplay(info.dob) : 'Select date of birth'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" align="start">
                      <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        startMonth={earliestDob}
                        endMonth={today}
                        defaultMonth={info.dob ? fromISODate(info.dob) : today}
                        selected={info.dob ? fromISODate(info.dob) : undefined}
                        onSelect={(d) => {
                          if (d) {
                            setField('dob', toISODate(d));
                            setDobOpen(false);
                          }
                        }}
                        disabled={{ after: today }}
                        className="p-3"
                      />
                    </PopoverContent>
                  </Popover>
                  {info.dob && (
                    <p className="text-xs text-muted-foreground">
                      Age:{' '}
                      <span className="font-medium text-foreground">{formatAge(info.dob)}</span>
                    </p>
                  )}
                </Field>
                <Field id="assessmentDate" label="Assessment Date">
                  <Popover open={assessmentOpen} onOpenChange={setAssessmentOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="assessmentDate"
                        type="button"
                        variant="outline"
                        className={cn(
                          'w-full justify-start font-normal',
                          !info.assessmentDate && 'text-muted-foreground',
                        )}
                      >
                        <CalendarIcon className="h-4 w-4" />
                        {info.assessmentDate
                          ? formatDateDisplay(info.assessmentDate)
                          : 'Select assessment date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" align="start">
                      <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        startMonth={earliestAssessment}
                        endMonth={today}
                        defaultMonth={
                          info.assessmentDate ? fromISODate(info.assessmentDate) : today
                        }
                        selected={
                          info.assessmentDate ? fromISODate(info.assessmentDate) : undefined
                        }
                        onSelect={(d) => {
                          if (d) {
                            setField('assessmentDate', toISODate(d));
                            setAssessmentOpen(false);
                          }
                        }}
                        disabled={{ after: today }}
                        className="p-3"
                      />
                    </PopoverContent>
                  </Popover>
                </Field>
                <Field id="assessorName" label="Assessor Name">
                  <Input
                    id="assessorName"
                    value={user?.name ?? ''}
                    disabled
                    readOnly
                    aria-describedby="assessorHint"
                  />
                  <p id="assessorHint" className="text-xs text-muted-foreground">
                    Auto-filled from your account — recorded as the assessor.
                  </p>
                </Field>
                <Field id="assessorPosition" label="Position">
                  <Input
                    id="assessorPosition"
                    value={user ? POSITION_LABEL[user.role] : ''}
                    disabled
                    readOnly
                  />
                  <p className="text-xs text-muted-foreground">
                    Derived from your account role.
                  </p>
                </Field>
                <Field id="caregiverPhone" label="Caregiver's Phone Number">
                  <Input
                    id="caregiverPhone"
                    type="tel"
                    value={info.caregiverPhone}
                    onChange={(e) => setField('caregiverPhone', e.target.value)}
                    placeholder="e.g. 081-234-5678"
                  />
                </Field>
                <Field id="nextAppointment" label="Next Appointment (optional)">
                  <Popover open={apptOpen} onOpenChange={setApptOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        id="nextAppointment"
                        type="button"
                        variant="outline"
                        className={cn(
                          'w-full justify-start font-normal',
                          !nextAppointmentDate && 'text-muted-foreground',
                        )}
                      >
                        <CalendarPlus className="h-4 w-4" />
                        {nextAppointmentDate
                          ? formatDateDisplay(nextAppointmentDate)
                          : 'Select appointment date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" align="start">
                      <Calendar
                        mode="single"
                        captionLayout="dropdown"
                        startMonth={today}
                        endMonth={latestAppt}
                        defaultMonth={
                          nextAppointmentDate ? fromISODate(nextAppointmentDate) : today
                        }
                        selected={
                          nextAppointmentDate ? fromISODate(nextAppointmentDate) : undefined
                        }
                        onSelect={(d) => {
                          if (d) {
                            setNextAppointmentDate(toISODate(d));
                            setApptOpen(false);
                          }
                        }}
                        disabled={{ before: today }}
                        className="p-3"
                      />
                    </PopoverContent>
                  </Popover>
                  {nextAppointmentDate && (
                    <button
                      type="button"
                      onClick={() => setNextAppointmentDate('')}
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Clear appointment
                    </button>
                  )}
                </Field>
              </CardContent>
            </Card>

            {/* Risk domains */}
            <Card>
              <CardHeader>
                <CardTitle>Risk Assessment</CardTitle>
                <CardDescription>
                  Score each of the 4 domains from 0 (best) to 3 (worst)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {DOMAINS.map((domain) => (
                  <div key={domain.key}>
                    <p className="mb-3 text-sm font-semibold text-card-foreground">
                      {domain.title}
                    </p>
                    <RadioGroup
                      value={domains[domain.key]?.toString() ?? ''}
                      onValueChange={(v) =>
                        setDomains((prev) => ({ ...prev, [domain.key]: Number(v) }))
                      }
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      {domain.options.map((opt) => {
                        const id = `${domain.key}-${opt.value}`;
                        const selected = domains[domain.key] === opt.value;
                        return (
                          <Label
                            key={id}
                            htmlFor={id}
                            className={cn(
                              'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                              selected
                                ? 'border-primary bg-accent'
                                : 'border-border hover:bg-muted/50',
                            )}
                          >
                            <RadioGroupItem id={id} value={opt.value.toString()} />
                            <span className="flex-1 text-sm font-normal">{opt.label}</span>
                            <Badge variant={selected ? 'default' : 'muted'}>{opt.value}</Badge>
                          </Label>
                        );
                      })}
                    </RadioGroup>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Discharge teaching — 3-state per item: Taught / N/A / not done */}
            <Card>
              <CardHeader>
                <CardTitle>Discharge Teaching Record</CardTitle>
                <CardDescription>
                  Mark each topic as <b>Taught</b> or <b>N/A</b> (not required for this patient).
                  Leave both unchecked if the topic still needs to be covered.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="hidden grid-cols-[1fr_5rem_5rem] items-center gap-2 px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                  <span>Topic</span>
                  <span className="text-center">Taught</span>
                  <span className="text-center">N/A</span>
                </div>
                {TEACHING_ITEMS.map((item) => {
                  const status = teaching[item.key] ?? null;
                  const taught = status === 'TAUGHT';
                  const na = status === 'NA';
                  return (
                    <div
                      key={item.key}
                      className={cn(
                        'grid grid-cols-[1fr_5rem_5rem] items-center gap-2 rounded-lg border p-3 transition-colors',
                        taught
                          ? 'border-success/40 bg-success/10'
                          : na
                            ? 'border-border bg-muted/40'
                            : 'border-border hover:bg-muted/30',
                      )}
                    >
                      <span className="text-sm font-medium text-card-foreground">
                        {item.label}
                      </span>
                      <label
                        htmlFor={`teach-${item.key}-taught`}
                        className="flex cursor-pointer items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground"
                      >
                        <Checkbox
                          id={`teach-${item.key}-taught`}
                          checked={taught}
                          onCheckedChange={(c) =>
                            setTeachingFor(item.key, c === true ? 'TAUGHT' : null)
                          }
                        />
                        <span className="sm:hidden">Taught</span>
                      </label>
                      <label
                        htmlFor={`teach-${item.key}-na`}
                        className="flex cursor-pointer items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground"
                      >
                        <Checkbox
                          id={`teach-${item.key}-na`}
                          checked={na}
                          onCheckedChange={(c) =>
                            setTeachingFor(item.key, c === true ? 'NA' : null)
                          }
                        />
                        <span className="sm:hidden">N/A</span>
                      </label>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Teach-Back — only shown for Moderate / High risk */}
            {needsTeachBack && (
              <Card className="border-warning/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquareText className="h-5 w-5 text-warning" />
                    Teach-Back Closure
                  </CardTitle>
                  <CardDescription>
                    Required for Moderate / High risk discharges — confirm the caregiver
                    can repeat back the key instructions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Label
                    htmlFor="teachBackPerformed"
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                      teachBackPerformed
                        ? 'border-primary bg-accent'
                        : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <Checkbox
                      id="teachBackPerformed"
                      checked={teachBackPerformed}
                      onCheckedChange={(c) => {
                        const v = c === true;
                        setTeachBackPerformed(v);
                        if (!v) setTeachBackResult(null);
                      }}
                    />
                    <span className="text-sm font-medium">
                      Teach-back performed with caregiver
                    </span>
                  </Label>

                  {teachBackPerformed && (
                    <div className="space-y-2 pl-1">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Outcome
                      </Label>
                      <RadioGroup
                        value={teachBackResult ?? ''}
                        onValueChange={(v) => setTeachBackResult(v as TeachBackResult)}
                        className="grid gap-2 sm:grid-cols-2"
                      >
                        {(
                          [
                            { value: 'PASS', label: 'Passed', icon: CheckCircle2, className: 'border-success/50 text-success' },
                            { value: 'FAIL', label: 'Did not pass', icon: MessageSquareText, className: 'border-destructive/50 text-destructive' },
                          ] as const
                        ).map((opt) => {
                          const id = `teachback-${opt.value}`;
                          const selected = teachBackResult === opt.value;
                          const Icon = opt.icon;
                          return (
                            <Label
                              key={id}
                              htmlFor={id}
                              className={cn(
                                'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                                selected ? `${opt.className} bg-accent` : 'border-border hover:bg-muted/50',
                              )}
                            >
                              <RadioGroupItem id={id} value={opt.value} />
                              <Icon className="h-4 w-4" />
                              <span className="text-sm font-medium">{opt.label}</span>
                            </Label>
                          );
                        })}
                      </RadioGroup>
                    </div>
                  )}

                  <Field id="teachBackNote" label="Teach-back notes (optional)">
                    <Textarea
                      id="teachBackNote"
                      value={teachBackNote}
                      onChange={(e) => setTeachBackNote(e.target.value)}
                      placeholder="e.g. Caregiver demonstrated tepid sponging confidently."
                      rows={3}
                    />
                  </Field>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Live score summary (sticky) ───────────────────────────────── */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4" /> Risk Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total Score
                  </p>
                  <p className="mt-1 text-5xl font-bold tabular-nums text-card-foreground">
                    {totalScore}
                    <span className="text-2xl text-muted-foreground">/12</span>
                  </p>
                </div>

                <div className="flex justify-center">
                  <Badge variant={risk.badgeVariant} className="px-3 py-1 text-sm">
                    {risk.label}
                  </Badge>
                </div>

                <div className="rounded-lg bg-muted/60 p-3 text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Recommended Follow-up
                  </p>
                  <p className="mt-1 text-sm text-card-foreground">{risk.followUpAction}</p>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                  {complete
                    ? 'All domains scored'
                    : `${answeredCount}/${DOMAINS.length} domains scored`}
                </p>

                <Button className="w-full" onClick={handleSubmit} disabled={!canSubmit}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? 'Saving…' : 'Save Assessment'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
