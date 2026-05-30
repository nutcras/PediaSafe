import { boolean, integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Risk tiers derived from the total score (0-12). See packages/db scoring notes
// and app/web/lib/risk.ts for the score → tier thresholds (0-3 / 4-7 / 8-12).
export const riskLevel = pgEnum('risk_level', ['LOW', 'MODERATE', 'HIGH']);

// Application roles. 'admin' (Manager) can reach user-management / config routes;
// 'assessor' (nurse) can only perform assessments.
export const userRole = pgEnum('user_role', ['admin', 'assessor']);

// Teach-back closure for Moderate/High-risk discharges.
export const teachBackResult = pgEnum('teach_back_result', ['PASS', 'FAIL']);

// Symptom categories recorded during post-discharge follow-up contacts.
export const followUpSymptom = pgEnum('follow_up_symptom', [
  'normal',
  'fever',
  'dyspnea',
  'incomplete_meds',
  'early_doctor_visit',
]);

// Authentication accounts.
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(), // maps to the assessment "Assessor Name"
  role: userRole('role').notNull().default('assessor'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// A single pneumonia readmission-risk assessment performed at discharge.
export const assessments = pgTable('assessments', {
  id: serial('id').primaryKey(),

  // Patient information
  hn: text('hn').notNull(),
  patientName: text('patient_name').notNull(),
  dob: text('dob').notNull(), // YYYY-MM-DD — age is derived from this
  assessmentDate: text('assessment_date').notNull(), // YYYY-MM-DD
  assessorName: text('assessor_name').notNull(),
  assessorId: uuid('assessor_id').references(() => users.id),
  assessorRole: userRole('assessor_role').notNull().default('assessor'),
  caregiverPhone: text('caregiver_phone').notNull(),

  // Risk domains, each scored 0-3
  clinicalSeverity: integer('clinical_severity').notNull(),
  hostFactors: integer('host_factors').notNull(),
  caregiverCompetency: integer('caregiver_competency').notNull(),
  environment: integer('environment').notNull(),

  // Discharge teaching record — completed items and items explicitly marked N/A.
  // Items in neither array count as "not done".
  teachingCompleted: jsonb('teaching_completed').$type<string[]>().notNull().default([]),
  teachingNA: jsonb('teaching_na').$type<string[]>().notNull().default([]),

  // Teach-back closure (only meaningful for Moderate/High risk).
  teachBackPerformed: boolean('teach_back_performed').notNull().default(false),
  teachBackResult: teachBackResult('teach_back_result'),
  teachBackNote: text('teach_back_note').notNull().default(''),

  // Nurse-selected next appointment (Calendar date-picker).
  nextAppointmentDate: text('next_appointment_date'),

  // Derived, persisted for fast dashboard queries
  totalScore: integer('total_score').notNull(),
  riskLevel: riskLevel('risk_level').notNull(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Post-discharge follow-up contacts. Each assessment may have many.
export const followUps = pgTable('follow_ups', {
  id: uuid('id').defaultRandom().primaryKey(),
  patientId: integer('patient_id')
    .notNull()
    .references(() => assessments.id, { onDelete: 'cascade' }),
  // 1-indexed contact ordinal — auto-assigned server-side based on existing rows.
  round: integer('round').notNull(),
  followUpDate: timestamp('follow_up_date').notNull().defaultNow(),
  symptomsStatus: followUpSymptom('symptoms_status').notNull(),
  note: text('note').notNull().default(''),
  assessorId: uuid('assessor_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
export type FollowUp = typeof followUps.$inferSelect;
export type NewFollowUp = typeof followUps.$inferInsert;
