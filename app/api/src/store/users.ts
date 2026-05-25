// In-memory user store for the PediaSafe auth mock. Mirrors the `users` table in
// packages/db/schema.ts. Passwords are hashed at startup with Bun's built-in
// password hashing (argon2id) — no plaintext is kept in memory.

export type UserRole = 'admin' | 'assessor';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

// Safe shape returned to clients (never includes the password hash).
export interface PublicUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
}

// Stable seed UUIDs (kept in sync with packages/db/seed.ts).
export const SEED_IDS = {
  admin: 'a0000000-0000-4000-8000-000000000001',
  assessor: 'a0000000-0000-4000-8000-000000000002',
} as const;

const SEED = [
  { id: SEED_IDS.admin, username: 'manager', name: 'Manager Somsak', role: 'admin' as const, password: 'manager123' },
  { id: SEED_IDS.assessor, username: 'nurse', name: 'Nurse Ratchada', role: 'assessor' as const, password: 'nurse123' },
];

const users: User[] = [];

// Top-level await: hash the seed passwords before the server handles requests.
for (const s of SEED) {
  users.push({
    id: s.id,
    username: s.username,
    name: s.name,
    role: s.role,
    passwordHash: await Bun.password.hash(s.password),
    createdAt: new Date().toISOString(),
  });
}

export function findByUsername(username: string): User | null {
  const u = username.trim().toLowerCase();
  return users.find((x) => x.username.toLowerCase() === u) ?? null;
}

export function findById(id: string): User | null {
  return users.find((x) => x.id === id) ?? null;
}

export function listUsers(): User[] {
  return [...users];
}

export function toPublic(u: User): PublicUser {
  return { id: u.id, username: u.username, name: u.name, role: u.role };
}
