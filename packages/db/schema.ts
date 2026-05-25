import { integer, jsonb, pgEnum, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Risk tiers derived from the total score (0-12). See packages/db scoring notes
// and app/web/lib/risk.ts for the score → tier thresholds (0-3 / 4-7 / 8-12).
export const riskLevel = pgEnum('risk_level', ['LOW', 'MODERATE', 'HIGH']);

// Application roles. 'admin' (Manager) can reach user-management / config routes;
// 'assessor' (nurse) can only perform assessments.
export const userRole = pgEnum('user_role', ['admin', 'assessor']);

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
  hn: text('hn').notNull(), // Hospital Number
  patientName: text('patient_name').notNull(),
  dob: text('dob').notNull(), // date of birth, YYYY-MM-DD — age is derived from this
  assessmentDate: text('assessment_date').notNull(), // YYYY-MM-DD
  assessorName: text('assessor_name').notNull(),
  assessorId: uuid('assessor_id').references(() => users.id), // the authenticated assessor
  caregiverPhone: text('caregiver_phone').notNull(),

  // Risk domains, each scored 0-3
  clinicalSeverity: integer('clinical_severity').notNull(),
  hostFactors: integer('host_factors').notNull(),
  caregiverCompetency: integer('caregiver_competency').notNull(),
  environment: integer('environment').notNull(),

  // Discharge teaching record — list of completed teaching-item keys
  teachingCompleted: jsonb('teaching_completed').$type<string[]>().notNull().default([]),

  // Derived, persisted for fast dashboard queries
  totalScore: integer('total_score').notNull(),
  riskLevel: riskLevel('risk_level').notNull(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
