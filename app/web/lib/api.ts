// Thin fetch wrapper that targets the Hono API and attaches the bearer token.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const TOKEN_KEY = 'pedia_token';

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

// fetch against the API base URL, injecting `Authorization: Bearer <token>`
// when a token is present.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}
