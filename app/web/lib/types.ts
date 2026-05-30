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

// Teach-back closure for Moderate/High risk discharges.
export type TeachBackResult = 'PASS' | 'FAIL';

export interface TeachBack {
  performed: boolean;
  result: TeachBackResult | null; // null when not performed
  note: string;
}

// Patient + assessment data captured by the form. The assessor is stamped
// server-side from the authenticated user, not sent as an editable field.
export interface AssessmentInput {
  hn: string;
  patientName: string;
  dob: string; // date of birth, YYYY-MM-DD — age is derived from this
  assessmentDate: string; // YYYY-MM-DD
  caregiverPhone: string;
  domains: DomainScores;
  // Items the caregiver was actively taught.
  teachingCompleted: string[];
  // Items explicitly marked "not applicable" for this patient (e.g. no
  // chest-percussion needed). Items in neither list count as "not done".
  teachingNA: string[];
  // Closure of the teach-back step (only meaningful for Moderate/High risk).
  teachBack: TeachBack;
  // Nurse-selected next appointment (Calendar date-picker). Optional — nullable
  // when no appointment was set at discharge.
  nextAppointmentDate: string | null; // YYYY-MM-DD or null
}

// A stored/returned record = input + the authenticated assessor + derived fields.
export interface PatientAssessment extends AssessmentInput {
  id: number;
  assessorName: string;
  assessorId: string;
  assessorRole: UserRole; // displayed as "Position" on the form
  totalScore: number; // 0-12
  riskLevel: RiskLevel;
  followUpAction: string;
  createdAt: string;
  followUps: FollowUpEntry[]; // logged contacts after discharge
}

// ── Follow-up tracking ────────────────────────────────────────────────────────
// Symptom categories the nurse logs at each follow-up contact.
export type FollowUpSymptom =
  | 'normal'
  | 'fever'
  | 'dyspnea'
  | 'incomplete_meds'
  | 'early_doctor_visit';

export interface FollowUpEntry {
  id: number;
  patientId: number;
  round: number; // 1, 2, 3 … assigned server-side
  followUpDate: string; // ISO timestamp
  symptomsStatus: FollowUpSymptom;
  note: string;
  assessorId: string;
  assessorName: string;
}
