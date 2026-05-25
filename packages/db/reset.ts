import { db } from './index';
import { sql } from 'drizzle-orm';

// ⚠️ DESTRUCTIVE: drops all tables + the drizzle migration history so a fresh
// `db:migrate` can apply the current baseline cleanly. For disposable/dev DBs only.
async function main() {
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  console.log('✅ database wiped (public + drizzle schemas reset). Now run: bun run db:migrate && bun run db:seed');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ reset failed:', e.message);
  process.exit(1);
});
