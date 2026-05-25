// Shared PediaSafe domain types (mirror of the API in app/api/src/routes/assessments.ts).

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH';

// The four risk-assessment domain keys, each scored 0-3.
export interface DomainScores {
  clinicalSeverity: number;
  hostFactors: number;
  caregiverCompetency: number;
  environment: number;
}

export type DomainKey = keyof DomainScores;

// Patient + assessment data captured by the form.
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
  createdAt: string;
}
