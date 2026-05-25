import { db, assessments, type NewAssessment } from './index';

// Score → risk tier (mirror of app/web/lib/risk.ts). 0-3 LOW, 4-7 MODERATE, 8-12 HIGH.
function riskFromScore(score: number): 'LOW' | 'MODERATE' | 'HIGH' {
  if (score <= 3) return 'LOW';
  if (score <= 7) return 'MODERATE';
  return 'HIGH';
}

function build(
  row: Omit<NewAssessment, 'totalScore' | 'riskLevel'>,
): NewAssessment {
  const total =
    row.clinicalSeverity + row.hostFactors + row.caregiverCompetency + row.environment;
  return { ...row, totalScore: total, riskLevel: riskFromScore(total) };
}

const SAMPLES = [
  build({
    hn: 'HN-67-0012', patientName: 'Nong Mali', dob: '2024-05-20',
    assessmentDate: '2026-05-20', assessorName: 'Nurse Ratchada', caregiverPhone: '081-234-5678',
    clinicalSeverity: 0, hostFactors: 1, caregiverCompetency: 0, environment: 1,
    teachingCompleted: ['medication', 'danger_signs', 'tepid_sponging', 'chest_percussion', 'avoid_smoking'],
  }),
  build({
    hn: 'HN-67-0033', patientName: 'Nong Phume', dob: '2025-09-22',
    assessmentDate: '2026-05-22', assessorName: 'Nurse Ratchada', caregiverPhone: '089-555-1212',
    clinicalSeverity: 2, hostFactors: 2, caregiverCompetency: 1, environment: 1,
    teachingCompleted: ['medication', 'danger_signs'],
  }),
  build({
    hn: 'HN-67-0041', patientName: 'Nong Achara', dob: '2022-05-23',
    assessmentDate: '2026-05-23', assessorName: 'Nurse Somchai', caregiverPhone: '062-777-8899',
    clinicalSeverity: 3, hostFactors: 3, caregiverCompetency: 2, environment: 2,
    teachingCompleted: ['medication'],
  }),
];

async function main() {
  await db.delete(assessments);
  await db.insert(assessments).values(SAMPLES);
  console.log(`✅ seeded ${SAMPLES.length} assessments`);
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ seed failed:', e.message);
  process.exit(1);
});
