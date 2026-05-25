import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { eq } from 'drizzle-orm';
import { db, employees } from '@lava/db';
import { webhook } from './routes/webhook';
import { leave } from './routes/leave';
import { register } from './routes/register';
import { admin } from './routes/admin';

const app = new Hono();

// CORS — the web app calls this API cross-origin (separate container/port).
// CORS_ORIGIN can be a comma-separated allowlist; defaults to "*" for dev.
const corsOrigins = (process.env.CORS_ORIGIN ?? '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use('*', cors({
  origin: corsOrigins.length === 1 && corsOrigins[0] === '*' ? '*' : corsOrigins,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'x-teacher-id', 'x-line-user-id', 'x-id-card'],
}));

app.get('/', (c) => c.json({ status: 'ok', service: 'lava-api' }));

// Resolve the LINE-authenticated teacher → used by the web form (LIFF) to
// auto-fill the requester without typing their teacher ID.
app.get('/whoami', async (c) => {
  const lineId = c.req.header('x-line-user-id');
  if (!lineId) return c.json({ error: 'Missing x-line-user-id' }, 400);

  const user = await db.query.employees.findFirst({
    where: eq(employees.lineId, lineId),
  });
  if (!user) return c.json({ error: 'Not registered' }, 404);

  return c.json({ teacherId: user.teacherId, name: user.name, role: user.role });
});



export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};
