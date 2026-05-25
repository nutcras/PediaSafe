import type { DomainKey, DomainScores, RiskLevel } from './types';

// ── Domain definitions (4 domains, each a RadioGroup scored 0-3) ──────────────
export interface DomainOption {
  value: number; // 0-3
  label: string;
}

export interface DomainDef {
  key: DomainKey;
  title: string;
  options: DomainOption[];
}

export const DOMAINS: DomainDef[] = [
  {
    key: 'clinicalSeverity',
    title: 'Domain 1 · Clinical Severity',
    options: [
      { value: 0, label: 'No complications' },
      { value: 1, label: 'High fever > 38.5°C' },
      { value: 2, label: 'O₂ Sat < 95%' },
      { value: 3, label: 'Complications' },
    ],
  },
  {
    key: 'hostFactors',
    title: 'Domain 2 · Host Factors',
    options: [
      { value: 0, label: 'No risk factors' },
      { value: 1, label: 'Underweight' },
      { value: 2, label: 'Premature / LBW' },
      { value: 3, label: 'Underlying disease' },
    ],
  },
  {
    key: 'caregiverCompetency',
    title: 'Domain 3 · Caregiver Competency',
    options: [
      { value: 0, label: 'Fully understands' },
      { value: 1, label: 'Forgets some parts' },
      { value: 2, label: 'Needs repeated teaching' },
      { value: 3, label: 'Poor communication' },
    ],
  },
  {
    key: 'environment',
    title: 'Domain 4 · Environment',
    options: [
      { value: 0, label: 'Appropriate home' },
      { value: 1, label: 'Smoker in house' },
      { value: 2, label: 'Crowded house' },
      { value: 3, label: 'Poor healthcare access' },
    ],
  },
];

// ── Discharge teaching record (checkboxes) ────────────────────────────────────
export interface TeachingItem {
  key: string;
  label: string;
}

export const TEACHING_ITEMS: TeachingItem[] = [
  { key: 'medication', label: 'Medication administration' },
  { key: 'danger_signs', label: '5 Danger signs' },
  { key: 'tepid_sponging', label: 'Tepid sponging' },
  { key: 'chest_percussion', label: 'Chest percussion / Suction' },
  { key: 'avoid_smoking', label: 'Avoid smoking' },
];

// ── Scoring ───────────────────────────────────────────────────────────────────
export function totalScore(d: DomainScores): number {
  return d.clinicalSeverity + d.hostFactors + d.caregiverCompetency + d.environment;
}

export function riskFromScore(score: number): RiskLevel {
  if (score <= 3) return 'LOW';
  if (score <= 7) return 'MODERATE';
  return 'HIGH';
}

// ── Presentation metadata (badge colour, label, follow-up plan) ───────────────
export type BadgeVariant = 'success' | 'warning' | 'destructive';

export interface RiskMeta {
  level: RiskLevel;
  label: string;
  range: string;
  badgeVariant: BadgeVariant;
  followUpAction: string;
}

export const RISK_META: Record<RiskLevel, RiskMeta> = {
  LOW: {
    level: 'LOW',
    label: 'Low Risk',
    range: '0-3',
    badgeVariant: 'success',
    followUpAction: 'Standard discharge + 1 follow-up call',
  },
  MODERATE: {
    level: 'MODERATE',
    label: 'Moderate Risk',
    range: '4-7',
    badgeVariant: 'warning',
    followUpAction: 'Follow-up call at 48-72 hrs & Day 7',
  },
  HIGH: {
    level: 'HIGH',
    label: 'High Risk',
    range: '8-12',
    badgeVariant: 'destructive',
    followUpAction: 'Consult Pediatrician + Urgent F/U',
  },
};

export function riskMetaFromScore(score: number): RiskMeta {
  return RISK_META[riskFromScore(score)];
}
