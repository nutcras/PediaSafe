import { Hono } from 'hono';
import { authMiddleware, isAdmin, type AuthEnv } from '../middleware/auth';
import { listUsers, toPublic } from '../store/users';

// Admin-only area: user management & system configuration live here. Every route
// requires a valid token AND the 'admin' role — assessors receive 403.
export const admin = new Hono<AuthEnv>();

admin.use('*', authMiddleware, isAdmin);

// GET /api/admin/users — list all accounts (no password hashes).
admin.get('/users', (c) => {
  return c.json({ users: listUsers().map(toPublic) });
});

export { admin as adminRoutes };
