import { Hono } from 'hono';
import { authMiddleware, type AuthEnv } from '../middleware/auth';
import { SEED_IDS } from '../store/users';

// ─────────────────────────────────────────────────────────────────────────────
// PediaSafe — Pneumonia Readmission Risk assessment API (in-memory mock).
//
// Endpoints (mounted under /api in src/index.ts) — all require authentication:
//   POST /api/assessments                       → create an assessment
//   GET  /api/patients                          → list assessed patients
//   POST /api/patients/:id/follow-ups           → log a follow-up contact
//   GET  /api/patients/:id/follow-ups           → fetch follow-up history
//
// No database is required to run this mock — records live in module-level
// arrays and are seeded below so the dashboard shows data on first load.
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';
export type UserRole = 'admin' | 'assessor';
export type TeachBackResult = 'PASS' | 'FAIL';
export type FollowUpSymptom =
  | 'normal'
  | 'fever'
  | 'dyspnea'
  | 'incomplete_meds'
  | 'early_doctor_visit';

const VALID_SYMPTOMS: ReadonlySet<FollowUpSymptom> = new Set<FollowUpSymptom>([
  'normal',
  'fever',
  'dyspnea',
  'incomplete_meds',
  'early_doctor_visit',
]);

export interface DomainScores {
  clinicalSeverity: number;
  hostFactors: number;
  caregiverCompetency: number;
  environment: number;
}

export interface TeachBack {
  performed: boolean;
  result: TeachBackResult | null;
  note: string;
}

// What the POST body must contain. The assessor is NOT taken from the body —
// it is stamped server-side from the authenticated user (see POST handler).
export interface AssessmentInput {
  hn: string;
  patientName: string;
  dob: string;
  assessmentDate: string;
  caregiverPhone: string;
  domains: DomainScores;
  teachingCompleted: string[];
  teachingNA: string[];
  teachBack: TeachBack;
  nextAppointmentDate: string | null;
}

export interface FollowUpEntry {
  id: number;
  patientId: number;
  round: number;
  followUpDate: string;
  symptomsStatus: FollowUpSymptom;
  note: string;
  assessorId: string;
  assessorName: string;
}

export interface PatientAssessment extends AssessmentInput {
  id: number;
  assessorName: string;
  assessorId: string;
  assessorRole: UserRole;
  totalScore: number;
  riskLevel: RiskLevel;
  followUpAction: string;
  createdAt: string;
  followUps: FollowUpEntry[];
}

// ── Scoring ──────────────────────────────────────────────────────────────────
export function totalScore(d: DomainScores): number {
  return d.clinicalSeverity + d.hostFactors + d.caregiverCompetency + d.environment;
}

export function riskFromScore(score: number): RiskLevel {
  if (score <= 3) return 'LOW';
  if (score <= 7) return 'MODERATE';
  return 'HIGH';
}

export function followUpFor(risk: RiskLevel): string {
  switch (risk) {
    case 'LOW':
      return 'Standard discharge + 1 follow-up call';
    case 'MODERATE':
      return 'Follow-up call at 48-72 hrs & Day 7';
    case 'HIGH':
      return 'Consult Pediatrician + Urgent F/U';
  }
}

// ── In-memory store ──────────────────────────────────────────────────────────
let nextId = 1;
let nextFollowUpId = 1;
const store: PatientAssessment[] = [];

function emptyTeachBack(): TeachBack {
  return { performed: false, result: null, note: '' };
}

function seed(
  input: Partial<AssessmentInput> & Pick<AssessmentInput, 'hn' | 'patientName' | 'dob' | 'assessmentDate' | 'caregiverPhone' | 'domains'>,
  assessor: { id: string; name: string; role: UserRole },
): void {
  const score = totalScore(input.domains);
  const risk = riskFromScore(score);
  store.push({
    hn: input.hn,
    patientName: input.patientName,
    dob: input.dob,
    assessmentDate: input.assessmentDate,
    caregiverPhone: input.caregiverPhone,
    domains: input.domains,
    teachingCompleted: input.teachingCompleted ?? [],
    teachingNA: input.teachingNA ?? [],
    teachBack: input.teachBack ?? emptyTeachBack(),
    nextAppointmentDate: input.nextAppointmentDate ?? null,
    id: nextId++,
    assessorName: assessor.name,
    assessorId: assessor.id,
    assessorRole: assessor.role,
    totalScore: score,
    riskLevel: risk,
    followUpAction: followUpFor(risk),
    createdAt: new Date().toISOString(),
    followUps: [],
  });
}

const NURSE = { id: SEED_IDS.assessor, name: 'Nurse Ratchada', role: 'assessor' as const };

seed({
  hn: 'HN-67-0012', patientName: 'Nong Mali', dob: '2024-05-20',
  assessmentDate: '2026-05-20', caregiverPhone: '081-234-5678',
  domains: { clinicalSeverity: 0, hostFactors: 1, caregiverCompetency: 0, environment: 1 },
  teachingCompleted: ['medication', 'danger_signs', 'tepid_sponging', 'avoid_smoking'],
  teachingNA: ['chest_percussion', 'nebulizer'],
  nextAppointmentDate: '2026-06-19',
}, NURSE);
seed({
  hn: 'HN-67-0033', patientName: 'Nong Phume', dob: '2025-09-22',
  assessmentDate: '2026-05-22', caregiverPhone: '089-555-1212',
  domains: { clinicalSeverity: 2, hostFactors: 2, caregiverCompetency: 1, environment: 1 },
  teachingCompleted: ['medication', 'danger_signs'],
  teachingNA: ['avoid_smoking'],
  teachBack: { performed: true, result: 'PASS', note: 'Caregiver demonstrated tepid sponging confidently.' },
  nextAppointmentDate: '2026-06-05',
}, NURSE);
seed({
  hn: 'HN-67-0041', patientName: 'Nong Achara', dob: '2022-05-23',
  assessmentDate: '2026-05-23', caregiverPhone: '062-777-8899',
  domains: { clinicalSeverity: 3, hostFactors: 3, caregiverCompetency: 2, environment: 2 },
  teachingCompleted: ['medication'],
  teachBack: { performed: true, result: 'FAIL', note: 'Caregiver still unsure on inhaler technique — needs reinforcement.' },
  nextAppointmentDate: '2026-05-26',
}, NURSE);

// ── Validation ───────────────────────────────────────────────────────────────
function isDomainScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3;
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function parseTeachBack(v: unknown): TeachBack {
  if (!v || typeof v !== 'object') return emptyTeachBack();
  const r = v as Record<string, unknown>;
  const performed = r.performed === true;
  let result: TeachBackResult | null = null;
  if (performed && (r.result === 'PASS' || r.result === 'FAIL')) result = r.result;
  const note = typeof r.note === 'string' ? r.note : '';
  return { performed, result, note };
}

function parseInput(body: unknown): AssessmentInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const d = (b.domains ?? {}) as Record<string, unknown>;

  const strFields = ['hn', 'patientName', 'dob', 'assessmentDate', 'caregiverPhone'] as const;
  for (const f of strFields) {
    if (typeof b[f] !== 'string' || (b[f] as string).trim() === '') return null;
  }
  if (
    !isDomainScore(d.clinicalSeverity) ||
    !isDomainScore(d.hostFactors) ||
    !isDomainScore(d.caregiverCompetency) ||
    !isDomainScore(d.environment)
  ) {
    return null;
  }

  const next = b.nextAppointmentDate;
  const nextAppointmentDate =
    typeof next === 'string' && next.trim() !== '' ? next.trim() : null;

  return {
    hn: (b.hn as string).trim(),
    patientName: (b.patientName as string).trim(),
    dob: (b.dob as string).trim(),
    assessmentDate: (b.assessmentDate as string).trim(),
    caregiverPhone: (b.caregiverPhone as string).trim(),
    domains: {
      clinicalSeverity: d.clinicalSeverity as number,
      hostFactors: d.hostFactors as number,
      caregiverCompetency: d.caregiverCompetency as number,
      environment: d.environment as number,
    },
    teachingCompleted: stringArray(b.teachingCompleted),
    teachingNA: stringArray(b.teachingNA),
    teachBack: parseTeachBack(b.teachBack),
    nextAppointmentDate,
  };
}

// ── Router (all routes require a valid bearer token) ──────────────────────────
export const api = new Hono<AuthEnv>();

// POST /api/assessments — create a new assessment. The assessor is taken from the
// authenticated user, NOT the request body, so a disabled client field can't be
// spoofed.
api.post('/assessments', authMiddleware, async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = parseInput(body);
  if (!input) {
    return c.json({ error: 'Invalid assessment body. Check required fields and domain scores (0-3).' }, 400);
  }

  const user = c.get('user');
  const score = totalScore(input.domains);
  const risk = riskFromScore(score);
  const record: PatientAssessment = {
    ...input,
    id: nextId++,
    assessorName: user.name,
    assessorId: user.sub,
    assessorRole: user.role,
    totalScore: score,
    riskLevel: risk,
    followUpAction: followUpFor(risk),
    createdAt: new Date().toISOString(),
    followUps: [],
  };
  store.push(record);

  return c.json({ assessment: record }, 201);
});

// GET /api/patients — list assessed patients.
//   ?risk=HIGH            → single tier
//   ?risk=MODERATE,HIGH   → multiple tiers (comma-separated)
api.get('/patients', authMiddleware, (c) => {
  const riskParam = c.req.query('risk');
  let patients = [...store].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (riskParam) {
    const wanted = new Set(
      riskParam.split(',').map((r) => r.trim().toUpperCase()).filter(Boolean),
    );
    patients = patients.filter((p) => wanted.has(p.riskLevel));
  }

  return c.json({ patients });
});

// GET /api/patients/:id/follow-ups — return the follow-up history for a patient.
api.get('/patients/:id/follow-ups', authMiddleware, (c) => {
  const id = Number(c.req.param('id'));
  const patient = store.find((p) => p.id === id);
  if (!patient) return c.json({ error: 'Patient not found' }, 404);
  const followUps = [...patient.followUps].sort((a, b) => a.round - b.round);
  return c.json({ followUps });
});

// POST /api/patients/:id/follow-ups — record a new follow-up contact. The round
// number is auto-assigned based on existing records for the patient.
api.post('/patients/:id/follow-ups', authMiddleware, async (c) => {
  const id = Number(c.req.param('id'));
  const patient = store.find((p) => p.id === id);
  if (!patient) return c.json({ error: 'Patient not found' }, 404);

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ error: 'Invalid body' }, 400);

  const symptomsStatus = body.symptomsStatus;
  if (typeof symptomsStatus !== 'string' || !VALID_SYMPTOMS.has(symptomsStatus as FollowUpSymptom)) {
    return c.json({ error: 'symptomsStatus must be one of normal | fever | dyspnea | incomplete_meds | early_doctor_visit' }, 400);
  }

  const note = typeof body.note === 'string' ? body.note : '';
  const followUpDate =
    typeof body.followUpDate === 'string' && body.followUpDate.trim() !== ''
      ? body.followUpDate
      : new Date().toISOString();

  const user = c.get('user');
  const round = patient.followUps.length + 1;
  const entry: FollowUpEntry = {
    id: nextFollowUpId++,
    patientId: patient.id,
    round,
    followUpDate,
    symptomsStatus: symptomsStatus as FollowUpSymptom,
    note,
    assessorId: user.sub,
    assessorName: user.name,
  };
  patient.followUps.push(entry);

  return c.json({ followUp: entry, patient }, 201);
});
