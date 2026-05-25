import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { api } from './routes/assessments';
import { auth } from './routes/auth';
import { adminRoutes } from './routes/admin';

const app = new Hono();

// CORS — the web app calls this API cross-origin (separate port/container).
// CORS_ORIGIN can be a comma-separated allowlist; defaults to "*" for dev.
const corsOrigins = (process.env.CORS_ORIGIN ?? '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use('*', cors({
  origin: corsOrigins.length === 1 && corsOrigins[0] === '*' ? '*' : corsOrigins,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/', (c) => c.json({ status: 'ok', service: 'pediasafe-api' }));

// Auth (public login + protected /me) and admin-only routes (mounted first so
// their specific paths resolve before the general /api router).
app.route('/api/auth', auth);
app.route('/api/admin', adminRoutes);

// /api/assessments (POST) and /api/patients (GET) — both require a bearer token.
app.route('/api', api);

export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};
