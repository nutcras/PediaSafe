'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ClipboardList, Loader2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  DOMAINS,
  TEACHING_ITEMS,
  riskMetaFromScore,
} from '@/lib/risk';
import type { DomainKey } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

interface PatientInfo {
  hn: string;
  patientName: string;
  age: string;
  assessmentDate: string;
  assessorName: string;
  caregiverPhone: string;
}

const EMPTY_INFO: PatientInfo = {
  hn: '',
  patientName: '',
  age: '',
  assessmentDate: new Date().toISOString().slice(0, 10),
  assessorName: '',
  caregiverPhone: '',
};

export default function AssessmentPage() {
  const router = useRouter();
  const [info, setInfo] = useState<PatientInfo>(EMPTY_INFO);
  const [domains, setDomains] = useState<Partial<Record<DomainKey, number>>>({});
  const [teaching, setTeaching] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // ── Reactive scoring ────────────────────────────────────────────────────────
  const answeredCount = Object.keys(domains).length;
  const totalScore = useMemo(
    () => DOMAINS.reduce((sum, d) => sum + (domains[d.key] ?? 0), 0),
    [domains],
  );
  const risk = riskMetaFromScore(totalScore);
  const complete = answeredCount === DOMAINS.length;

  const setField = (key: keyof PatientInfo, value: string) =>
    setInfo((prev) => ({ ...prev, [key]: value }));

  const toggleTeaching = (key: string, checked: boolean) =>
    setTeaching((prev) => (checked ? [...prev, key] : prev.filter((k) => k !== key)));

  const infoComplete = Object.values(info).every((v) => v.trim() !== '');
  const canSubmit = infoComplete && complete && !submitting;

  async function handleSubmit() {
    if (!canSubmit) {
      toast.error('Please complete all patient fields and score all 4 domains.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...info,
          domains: {
            clinicalSeverity: domains.clinicalSeverity,
            hostFactors: domains.hostFactors,
            caregiverCompetency: domains.caregiverCompetency,
            environment: domains.environment,
          },
          teachingCompleted: teaching,
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
                <Field id="age" label="Age">
                  <Input
                    id="age"
                    value={info.age}
                    onChange={(e) => setField('age', e.target.value)}
                    placeholder="e.g. 2 yr / 8 months"
                  />
                </Field>
                <Field id="assessmentDate" label="Assessment Date">
                  <Input
                    id="assessmentDate"
                    type="date"
                    value={info.assessmentDate}
                    onChange={(e) => setField('assessmentDate', e.target.value)}
                  />
                </Field>
                <Field id="assessorName" label="Assessor Name">
                  <Input
                    id="assessorName"
                    value={info.assessorName}
                    onChange={(e) => setField('assessorName', e.target.value)}
                    placeholder="e.g. Nurse Ratchada"
                  />
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

            {/* Discharge teaching */}
            <Card>
              <CardHeader>
                <CardTitle>Discharge Teaching Record</CardTitle>
                <CardDescription>Check each item completed with the caregiver</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {TEACHING_ITEMS.map((item) => {
                  const checked = teaching.includes(item.key);
                  return (
                    <Label
                      key={item.key}
                      htmlFor={`teach-${item.key}`}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                        checked ? 'border-primary bg-accent' : 'border-border hover:bg-muted/50',
                      )}
                    >
                      <Checkbox
                        id={`teach-${item.key}`}
                        checked={checked}
                        onCheckedChange={(c) => toggleTeaching(item.key, c === true)}
                      />
                      <span className="text-sm font-normal">{item.label}</span>
                    </Label>
                  );
                })}
              </CardContent>
            </Card>
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
