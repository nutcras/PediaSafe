import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { authMiddleware, JWT_SECRET, type AuthEnv } from '../middleware/auth';
import { findById, findByUsername, toPublic } from '../store/users';

export const auth = new Hono<AuthEnv>();

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// POST /api/auth/login — exchange credentials for a JWT.
auth.post('/login', async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>().catch(() => null);
  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !password) {
    return c.json({ error: 'Username and password are required' }, 400);
  }

  const user = findByUsername(username);
  // Same message whether the user or the password is wrong (avoid enumeration).
  if (!user || !(await Bun.password.verify(password, user.passwordHash))) {
    return c.json({ error: 'Invalid username or password' }, 401);
  }

  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const token = await sign(
    { sub: user.id, username: user.username, name: user.name, role: user.role, exp },
    JWT_SECRET,
    'HS256',
  );

  return c.json({ token, user: toPublic(user) });
});

// GET /api/auth/me — current user from the bearer token.
auth.get('/me', authMiddleware, (c) => {
  const user = findById(c.get('user').sub);
  if (!user) return c.json({ error: 'User not found' }, 401);
  return c.json({ user: toPublic(user) });
});
