// Isomorphic fetch wrapper for the Hono API.
//
// Base URL resolution:
//   • Server (typeof window === 'undefined') — Server Components, route handlers,
//     SSR: talk DIRECTLY to the API container via INTERNAL_API_URL (Docker's
//     internal DNS, e.g. http://pediasafe-api-server:3000). Falls back to
//     localhost:3000 for non-Docker local dev.
//   • Client (browser): use a RELATIVE path. The browser cannot resolve Docker
//     container names, so requests go to the web origin and are transparently
//     proxied to the API by next.config.mjs `rewrites()`.
//
// Either way, callers pass paths that already start with "/api" (e.g.
// apiFetch('/api/auth/login')), so the rewrite rule /api/:path* matches on the
// client and the server hits ${INTERNAL_API_URL}/api/... directly.

const TOKEN_KEY = 'pedia_token';

function apiBaseUrl(): string {
  if (typeof window === 'undefined') {
    // Server-side: reach the API container directly over the internal network.
    return process.env.INTERNAL_API_URL ?? 'http://localhost:3000';
  }
  // Client-side: relative path → caught by Next.js rewrites() and proxied.
  return '';
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

// fetch against the resolved base URL, injecting `Authorization: Bearer <token>`
// when a token is present (client-side only).
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
}
