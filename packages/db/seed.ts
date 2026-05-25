import { db, assessments, users, type NewAssessment } from './index';

// Stable seed UUIDs so assessments can reference the seeded assessor.
const ADMIN_ID = 'a0000000-0000-4000-8000-000000000001';
const ASSESSOR_ID = 'a0000000-0000-4000-8000-000000000002';

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
    assessmentDate: '2026-05-20', assessorName: 'Nurse Ratchada', assessorId: ASSESSOR_ID, caregiverPhone: '081-234-5678',
    clinicalSeverity: 0, hostFactors: 1, caregiverCompetency: 0, environment: 1,
    teachingCompleted: ['medication', 'danger_signs', 'tepid_sponging', 'chest_percussion', 'avoid_smoking'],
  }),
  build({
    hn: 'HN-67-0033', patientName: 'Nong Phume', dob: '2025-09-22',
    assessmentDate: '2026-05-22', assessorName: 'Nurse Ratchada', assessorId: ASSESSOR_ID, caregiverPhone: '089-555-1212',
    clinicalSeverity: 2, hostFactors: 2, caregiverCompetency: 1, environment: 1,
    teachingCompleted: ['medication', 'danger_signs'],
  }),
  build({
    hn: 'HN-67-0041', patientName: 'Nong Achara', dob: '2022-05-23',
    assessmentDate: '2026-05-23', assessorName: 'Nurse Ratchada', assessorId: ASSESSOR_ID, caregiverPhone: '062-777-8899',
    clinicalSeverity: 3, hostFactors: 3, caregiverCompetency: 2, environment: 2,
    teachingCompleted: ['medication'],
  }),
];

async function main() {
  // Passwords are hashed with Bun's built-in password hashing (argon2id).
  const seedUsers = [
    { id: ADMIN_ID, username: 'manager', name: 'Manager Somsak', role: 'admin' as const, password: 'manager123' },
    { id: ASSESSOR_ID, username: 'nurse', name: 'Nurse Ratchada', role: 'assessor' as const, password: 'nurse123' },
  ];

  await db.delete(assessments);
  await db.delete(users);

  await db.insert(users).values(
    await Promise.all(
      seedUsers.map(async (u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        passwordHash: await Bun.password.hash(u.password),
      })),
    ),
  );
  await db.insert(assessments).values(SAMPLES);

  console.log(`✅ seeded ${seedUsers.length} users + ${SAMPLES.length} assessments`);
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ seed failed:', e.message);
  process.exit(1);
});
