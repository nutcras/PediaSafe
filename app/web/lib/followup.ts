import type { BadgeVariant } from './risk';
import type { FollowUpEntry, FollowUpSymptom, RiskLevel } from './types';

// ── Recommended schedule (built from assessment date + risk level) ────────────
// Used by the patient detail sheet to show the nurse a monitoring plan.

export type FollowUpStatus = 'UPCOMING' | 'DUE' | 'OVERDUE' | 'NA' | 'DONE';

export interface FollowUpStep {
  key: string;
  label: string;
  date: string | null; // YYYY-MM-DD, or null when not applicable
  status: FollowUpStatus;
}

export interface FollowUpSchedule {
  call48to72: FollowUpStep;
  day7: FollowUpStep;
  nextAppointment: FollowUpStep;
}

export const FOLLOWUP_STATUS_META: Record<
  FollowUpStatus,
  { label: string; badgeVariant: BadgeVariant | 'secondary' | 'muted' }
> = {
  UPCOMING: { label: 'Upcoming', badgeVariant: 'secondary' },
  DUE: { label: 'Due today', badgeVariant: 'warning' },
  OVERDUE: { label: 'Overdue', badgeVariant: 'destructive' },
  NA: { label: 'Not required', badgeVariant: 'muted' },
  DONE: { label: 'Completed', badgeVariant: 'success' },
};

// Days after assessment for the "next appointment" by risk tier — only used as
// a fallback when the nurse did not pick an explicit appointment date.
const NEXT_APPT_OFFSET: Record<RiskLevel, number> = { HIGH: 3, MODERATE: 14, LOW: 30 };

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local
}

function statusFor(dateISO: string): FollowUpStatus {
  const today = todayISO();
  if (dateISO < today) return 'OVERDUE';
  if (dateISO === today) return 'DUE';
  return 'UPCOMING';
}

function step(key: string, label: string, dateISO: string | null): FollowUpStep {
  return {
    key,
    label,
    date: dateISO,
    status: dateISO ? statusFor(dateISO) : 'NA',
  };
}

export function buildFollowUpSchedule(
  assessmentDate: string,
  risk: RiskLevel,
  followUps: FollowUpEntry[] = [],
  nextAppointmentDate: string | null = null,
): FollowUpSchedule {
  // 48-72hr call applies to Moderate & High risk only.
  const call48 = risk === 'LOW' ? null : addDays(assessmentDate, 3);
  const day7Date = addDays(assessmentDate, 7);
  const nextApptDate = nextAppointmentDate ?? addDays(assessmentDate, NEXT_APPT_OFFSET[risk]);

  const round1 = followUps.find((f) => f.round === 1);
  const round2 = followUps.find((f) => f.round === 2);

  const call48Step = step('call48to72', '48-72 hour follow-up call', call48);
  if (call48 && round1) call48Step.status = 'DONE';

  const day7Step = step('day7', 'Day 7 follow-up call', day7Date);
  // For Low risk, the single follow-up call is the round-1 record.
  if (risk === 'LOW' && round1) day7Step.status = 'DONE';
  else if (round2) day7Step.status = 'DONE';

  return {
    call48to72: call48Step,
    day7: day7Step,
    nextAppointment: step('nextAppointment', 'Next appointment', nextApptDate),
  };
}

// ── Next Follow-up status (Dashboard column) ──────────────────────────────────
// Computes the *next* expected follow-up date for the dashboard list, plus a
// nurse-friendly status string (ปกติ / ใกล้ถึงกำหนด / เลยกำหนด / เสร็จสิ้น).

export type NextFollowUpStatus = 'NORMAL' | 'DUE_SOON' | 'OVERDUE' | 'COMPLETED';

export interface NextFollowUpInfo {
  date: string | null; // YYYY-MM-DD, null when no more follow-ups are needed
  round: number; // round number that this date corresponds to
  status: NextFollowUpStatus;
}

// Required number of follow-up contacts by risk tier:
//   LOW       → 1
//   MODERATE  → 2 (48-72hr + Day 7)
//   HIGH      → 2 + urgent flag (we treat it the same as MODERATE for counting)
const REQUIRED_FOLLOWUPS: Record<RiskLevel, number> = { LOW: 1, MODERATE: 2, HIGH: 2 };

// "Due soon" window: how many days before the expected date we start warning
// the nurse. 2 days gives them time to schedule a call.
const DUE_SOON_DAYS = 2;

function diffDays(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function computeNextFollowUp(
  assessmentDate: string,
  risk: RiskLevel,
  followUps: FollowUpEntry[],
  nextAppointmentDate: string | null = null,
): NextFollowUpInfo {
  const required = REQUIRED_FOLLOWUPS[risk];
  const done = followUps.length;

  // All required follow-ups recorded → fall through to the next appointment date
  // (so the column still shows something meaningful) or COMPLETED.
  if (done >= required) {
    if (nextAppointmentDate) {
      return {
        date: nextAppointmentDate,
        round: done + 1,
        status: statusForNext(nextAppointmentDate),
      };
    }
    return { date: null, round: done, status: 'COMPLETED' };
  }

  // Otherwise pick the expected date for the next missing round.
  const nextRound = done + 1;
  let date: string;
  if (risk === 'LOW') {
    date = addDays(assessmentDate, 7); // single contact at Day 7
  } else if (nextRound === 1) {
    date = addDays(assessmentDate, 3); // 48-72 hr
  } else {
    date = addDays(assessmentDate, 7); // Day 7
  }

  return { date, round: nextRound, status: statusForNext(date) };
}

function statusForNext(dateISO: string): NextFollowUpStatus {
  const today = todayISO();
  const delta = diffDays(today, dateISO);
  if (delta < 0) return 'OVERDUE';
  if (delta <= DUE_SOON_DAYS) return 'DUE_SOON';
  return 'NORMAL';
}

export const NEXT_FOLLOWUP_STATUS_META: Record<
  NextFollowUpStatus,
  { label: string; thaiLabel: string; badgeVariant: BadgeVariant | 'secondary' | 'muted' }
> = {
  NORMAL: { label: 'On schedule', thaiLabel: 'ปกติ', badgeVariant: 'success' },
  DUE_SOON: { label: 'Due soon', thaiLabel: 'ใกล้ถึงกำหนด', badgeVariant: 'warning' },
  OVERDUE: { label: 'Overdue', thaiLabel: 'เลยกำหนด', badgeVariant: 'destructive' },
  COMPLETED: { label: 'Completed', thaiLabel: 'เสร็จสิ้น', badgeVariant: 'muted' },
};

// ── Symptom catalog (used by the logging dialog) ──────────────────────────────
export interface SymptomDef {
  key: FollowUpSymptom;
  label: string;
  thaiLabel: string;
  icon: 'check' | 'thermometer' | 'wind' | 'pill' | 'stethoscope';
  variant: BadgeVariant | 'muted';
}

export const SYMPTOM_OPTIONS: SymptomDef[] = [
  { key: 'normal', label: 'Normal', thaiLabel: 'อาการปกติ', icon: 'check', variant: 'success' },
  { key: 'fever', label: 'Fever', thaiLabel: 'มีไข้', icon: 'thermometer', variant: 'warning' },
  { key: 'dyspnea', label: 'Dyspnea', thaiLabel: 'หอบ', icon: 'wind', variant: 'destructive' },
  { key: 'incomplete_meds', label: 'Incomplete meds', thaiLabel: 'กินยาไม่ครบ', icon: 'pill', variant: 'warning' },
  { key: 'early_doctor_visit', label: 'Early doctor visit', thaiLabel: 'พบแพทย์ก่อนนัด', icon: 'stethoscope', variant: 'destructive' },
];
