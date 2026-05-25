// Shared PediaSafe domain types (mirror of the API in app/api/src/routes/assessments.ts).

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

// ── Auth ──────────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'assessor';

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

// The four risk-assessment domain keys, each scored 0-3.
export interface DomainScores {
  clinicalSeverity: number;
  hostFactors: number;
  caregiverCompetency: number;
  environment: number;
}

export type DomainKey = keyof DomainScores;

// Patient + assessment data captured by the form. The assessor is stamped
// server-side from the authenticated user, not sent as an editable field.
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
  createdAt: string;
}
