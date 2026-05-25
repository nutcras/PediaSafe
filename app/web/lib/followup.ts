import type { BadgeVariant } from './risk';
import type { RiskLevel } from './types';

// Follow-up schedule derived from the assessment date + risk level. There is no
// real status tracking in the mock, so each step's status is inferred by
// comparing its expected date to today (a monitoring prompt for the nurse).

export type FollowUpStatus = 'UPCOMING' | 'DUE' | 'OVERDUE' | 'NA';

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
};

// Days after assessment for the "next appointment" by risk tier.
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
): FollowUpSchedule {
  // 48-72hr call applies to Moderate & High risk only.
  const call48 = risk === 'LOW' ? null : addDays(assessmentDate, 3);
  return {
    call48to72: step('call48to72', '48-72 hour follow-up call', call48),
    day7: step('day7', 'Day 7 follow-up call', addDays(assessmentDate, 7)),
    nextAppointment: step(
      'nextAppointment',
      'Next appointment',
      addDays(assessmentDate, NEXT_APPT_OFFSET[risk]),
    ),
  };
}
