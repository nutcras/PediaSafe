import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import type { UserRole } from '../store/users';

// HS256 secret. Set JWT_SECRET in the environment for anything beyond local dev.
export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me';

// Shape of our signed JWT claims.
export interface JwtPayload {
  sub: string; // user id
  username: string;
  name: string;
  role: UserRole;
  exp: number;
}

// Hono Variables so c.get('user') is typed on protected routes.
export type AuthEnv = { Variables: { user: JwtPayload } };

// Requires a valid `Authorization: Bearer <token>`; attaches the user to context.
export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    return c.json({ error: 'Unauthorized: missing bearer token' }, 401);
  }
  try {
    const payload = (await verify(token, JWT_SECRET, 'HS256')) as unknown as JwtPayload;
    c.set('user', payload);
  } catch {
    return c.json({ error: 'Unauthorized: invalid or expired token' }, 401);
  }
  await next();
});

// Restricts a route to 'admin' (Manager) users. Must run after authMiddleware.
export const isAdmin = createMiddleware<AuthEnv>(async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'admin') {
    return c.json({ error: 'Forbidden: admin role required' }, 403);
  }
  await next();
});
