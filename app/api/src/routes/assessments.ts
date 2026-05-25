import { Hono } from 'hono';
import { authMiddleware, type AuthEnv } from '../middleware/auth';
import { SEED_IDS } from '../store/users';

// ─────────────────────────────────────────────────────────────────────────────
// PediaSafe — Pneumonia Readmission Risk assessment API (in-memory mock).
//
// Endpoints (mounted under /api in src/index.ts) — both require authentication:
//   POST /api/assessments  → create an assessment (server computes score + risk,
//                            and stamps the assessor from the JWT)
//   GET  /api/patients     → list assessed patients (optional ?risk= filter)
//
// No database is required to run this mock — records live in a module-level array
// and are seeded below so the dashboard shows data on first load.
// ─────────────────────────────────────────────────────────────────────────────

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

export interface DomainScores {
  clinicalSeverity: number; // 0-3
  hostFactors: number; // 0-3
  caregiverCompetency: number; // 0-3
  environment: number; // 0-3
}

// What the POST body must contain. The assessor is NOT taken from the body —
// it is stamped server-side from the authenticated user (see POST handler).
export interface AssessmentInput {
  hn: string;
  patientName: string;
  dob: string; // date of birth, YYYY-MM-DD — age is derived from this
  assessmentDate: string; // YYYY-MM-DD
  caregiverPhone: string;
  domains: DomainScores;
  teachingCompleted: string[]; // completed discharge-teaching item keys
}

// A stored/returned record = input + the authenticated assessor + derived fields.
export interface PatientAssessment extends AssessmentInput {
  id: number;
  assessorName: string;
  assessorId: string;
  totalScore: number; // 0-12
  riskLevel: RiskLevel;
  followUpAction: string;
  createdAt: string; // ISO timestamp
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
const store: PatientAssessment[] = [];

function seed(input: AssessmentInput, assessor: { id: string; name: string }): void {
  const score = totalScore(input.domains);
  const risk = riskFromScore(score);
  store.push({
    ...input,
    id: nextId++,
    assessorName: assessor.name,
    assessorId: assessor.id,
    totalScore: score,
    riskLevel: risk,
    followUpAction: followUpFor(risk),
    createdAt: new Date().toISOString(),
  });
}

const NURSE = { id: SEED_IDS.assessor, name: 'Nurse Ratchada' };

seed({
  hn: 'HN-67-0012', patientName: 'Nong Mali', dob: '2024-05-20',
  assessmentDate: '2026-05-20', caregiverPhone: '081-234-5678',
  domains: { clinicalSeverity: 0, hostFactors: 1, caregiverCompetency: 0, environment: 1 },
  teachingCompleted: ['medication', 'danger_signs', 'tepid_sponging', 'chest_percussion', 'avoid_smoking'],
}, NURSE);
seed({
  hn: 'HN-67-0033', patientName: 'Nong Phume', dob: '2025-09-22',
  assessmentDate: '2026-05-22', caregiverPhone: '089-555-1212',
  domains: { clinicalSeverity: 2, hostFactors: 2, caregiverCompetency: 1, environment: 1 },
  teachingCompleted: ['medication', 'danger_signs'],
}, NURSE);
seed({
  hn: 'HN-67-0041', patientName: 'Nong Achara', dob: '2022-05-23',
  assessmentDate: '2026-05-23', caregiverPhone: '062-777-8899',
  domains: { clinicalSeverity: 3, hostFactors: 3, caregiverCompetency: 2, environment: 2 },
  teachingCompleted: ['medication'],
}, NURSE);

// ── Validation ───────────────────────────────────────────────────────────────
function isDomainScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3;
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
  const teaching = Array.isArray(b.teachingCompleted)
    ? (b.teachingCompleted.filter((x) => typeof x === 'string') as string[])
    : [];

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
    teachingCompleted: teaching,
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
    totalScore: score,
    riskLevel: risk,
    followUpAction: followUpFor(risk),
    createdAt: new Date().toISOString(),
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
