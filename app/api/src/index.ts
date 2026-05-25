import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { api } from './routes/assessments';

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
  allowHeaders: ['Content-Type'],
}));

app.get('/', (c) => c.json({ status: 'ok', service: 'pediasafe-api' }));

// /api/assessments (POST) and /api/patients (GET)
app.route('/api', api);

export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};
