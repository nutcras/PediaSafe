import { Hono } from 'hono';

// ─────────────────────────────────────────────────────────────────────────────
// PediaSafe — Pneumonia Readmission Risk assessment API (in-memory mock).
//
// Endpoints (mounted under /api in src/index.ts):
//   POST /api/assessments  → create an assessment (server computes score + risk)
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

// What the POST body must contain.
export interface AssessmentInput {
  hn: string;
  patientName: string;
  age: string;
  assessmentDate: string; // YYYY-MM-DD
  assessorName: string;
  caregiverPhone: string;
  domains: DomainScores;
  teachingCompleted: string[]; // completed discharge-teaching item keys
}

// A stored/returned record = input + server-derived fields.
export interface PatientAssessment extends AssessmentInput {
  id: number;
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

function seed(input: AssessmentInput): void {
  const score = totalScore(input.domains);
  const risk = riskFromScore(score);
  store.push({
    ...input,
    id: nextId++,
    totalScore: score,
    riskLevel: risk,
    followUpAction: followUpFor(risk),
    createdAt: new Date().toISOString(),
  });
}

seed({
  hn: 'HN-67-0012', patientName: 'Nong Mali', age: '2 yr',
  assessmentDate: '2026-05-20', assessorName: 'Nurse Ratchada', caregiverPhone: '081-234-5678',
  domains: { clinicalSeverity: 0, hostFactors: 1, caregiverCompetency: 0, environment: 1 },
  teachingCompleted: ['medication', 'danger_signs', 'tepid_sponging', 'chest_percussion', 'avoid_smoking'],
});
seed({
  hn: 'HN-67-0033', patientName: 'Nong Phume', age: '8 months',
  assessmentDate: '2026-05-22', assessorName: 'Nurse Ratchada', caregiverPhone: '089-555-1212',
  domains: { clinicalSeverity: 2, hostFactors: 2, caregiverCompetency: 1, environment: 1 },
  teachingCompleted: ['medication', 'danger_signs'],
});
seed({
  hn: 'HN-67-0041', patientName: 'Nong Achara', age: '4 yr',
  assessmentDate: '2026-05-23', assessorName: 'Nurse Somchai', caregiverPhone: '062-777-8899',
  domains: { clinicalSeverity: 3, hostFactors: 3, caregiverCompetency: 2, environment: 2 },
  teachingCompleted: ['medication'],
});

// ── Validation ───────────────────────────────────────────────────────────────
function isDomainScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3;
}

function parseInput(body: unknown): AssessmentInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const d = (b.domains ?? {}) as Record<string, unknown>;

  const strFields = ['hn', 'patientName', 'age', 'assessmentDate', 'assessorName', 'caregiverPhone'] as const;
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
    age: (b.age as string).trim(),
    assessmentDate: (b.assessmentDate as string).trim(),
    assessorName: (b.assessorName as string).trim(),
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

// ── Router ───────────────────────────────────────────────────────────────────
export const api = new Hono();

// POST /api/assessments — create a new assessment.
api.post('/assessments', async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = parseInput(body);
  if (!input) {
    return c.json({ error: 'Invalid assessment body. Check required fields and domain scores (0-3).' }, 400);
  }

  const score = totalScore(input.domains);
  const risk = riskFromScore(score);
  const record: PatientAssessment = {
    ...input,
    id: nextId++,
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
api.get('/patients', (c) => {
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
