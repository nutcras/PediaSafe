'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { apiFetch, clearToken, getToken, setToken } from './api';
import type { AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

// Routes that are reachable without authentication.
const PUBLIC_PATHS = new Set(['/login']);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate the session from a stored token on first load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const res = await apiFetch('/api/auth/me');
        if (!res.ok) throw new Error('session invalid');
        const data = (await res.json()) as { user: AuthUser };
        if (!cancelled) setUser(data.user);
      } catch {
        clearToken();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = (await res.json().catch(() => ({}))) as { token?: string; user?: AuthUser; error?: string };
    if (!res.ok || !data.token || !data.user) {
      throw new Error(data.error ?? 'Login failed');
    }
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      <AuthGate>{children}</AuthGate>
    </AuthContext.Provider>
  );
}

// Redirects unauthenticated users to /login (and authenticated users away from it).
function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PATHS.has(pathname);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) router.replace('/login');
    else if (user && isPublic) router.replace('/');
  }, [user, loading, isPublic, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  // Avoid flashing protected content (or the login page) during a redirect.
  if (!user && !isPublic) return null;
  if (user && isPublic) return null;

  return <>{children}</>;
}
