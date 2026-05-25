'use client';

import { useEffect, useState } from 'react';

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? '';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

// ─── Low-level LIFF identity ────────────────────────────────────────────────────
// Shared boilerplate that every LIFF page used to duplicate:
//   import('@line/liff') → init → (login redirect if needed) → getProfile.
//
//   'initializing' — LIFF init in progress
//   'in-line'      — got a LINE profile (profile is set)
//   'no-line'      — no LIFF id / not in LINE / init failed → page should fall back
export type LiffStatus = 'initializing' | 'in-line' | 'no-line';
export interface LiffProfile { lineUserId: string; displayName: string }

export function useLiff(redirectPath: string): { status: LiffStatus; profile: LiffProfile | null } {
  const [status, setStatus] = useState<LiffStatus>('initializing');
  const [profile, setProfile] = useState<LiffProfile | null>(null);

  useEffect(() => {
    if (!LIFF_ID) { setStatus('no-line'); return; }
    let cancelled = false;

    import('@line/liff').then(({ default: liff }) => {
      liff.init({ liffId: LIFF_ID }).then(async () => {
        if (!liff.isLoggedIn()) {
          if (liff.isInClient()) {
            if (!cancelled) setStatus('no-line');           // in LINE but not logged in → misconfig
          } else {
            liff.login({ redirectUri: `${window.location.origin}${redirectPath}` }); // external → LINE login
          }
          return;
        }
        const p = await liff.getProfile();
        if (!cancelled) { setProfile({ lineUserId: p.userId, displayName: p.displayName }); setStatus('in-line'); }
      }).catch(() => { if (!cancelled) setStatus('no-line'); });
    }).catch(() => { if (!cancelled) setStatus('no-line'); });

    return () => { cancelled = true; };
  }, [redirectPath]);

  return { status, profile };
}

// ─── Teacher auth (LIFF + /whoami) ──────────────────────────────────────────────
// For pages that need the resolved teacher (request, team, dashboard).
//   'initializing' — still resolving
//   'authenticated' — teacher is set (registered LINE account)
//   'manual'        — couldn't resolve via LINE → page should show a teacher-id form
export type AuthStatus = 'initializing' | 'authenticated' | 'manual';
export interface TeacherAuth { teacherId: string; name: string; role: string; lineUserId: string }

// ─── Lightweight registration check (does NOT force login) ──────────────────────
// For UI that only needs to know "is this LINE user already registered?" without
// triggering a LINE login redirect (e.g. the nav menu).
//   true  → registered
//   false → in LINE but not registered
//   null  → unknown (no LIFF id / not logged in)
export function useRegistered(enabled = true): boolean | null {
  const [registered, setRegistered] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled || !LIFF_ID) return;
    let cancelled = false;
    import('@line/liff').then(({ default: liff }) => {
      liff.init({ liffId: LIFF_ID }).then(async () => {
        if (!liff.isLoggedIn()) return;          // never force login from here
        const p = await liff.getProfile();
        const res = await fetch(`${API_URL}/whoami`, { headers: { 'x-line-user-id': p.userId } });
        if (!cancelled) setRegistered(res.ok);
      }).catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [enabled]);
  return registered;
}

export function useTeacherAuth(redirectPath: string): { status: AuthStatus; teacher: TeacherAuth | null } {
  const { status: liffStatus, profile } = useLiff(redirectPath);
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [teacher, setTeacher] = useState<TeacherAuth | null>(null);

  useEffect(() => {
    if (liffStatus === 'initializing') return;
    if (liffStatus === 'no-line' || !profile) { setStatus('manual'); return; }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/whoami`, { headers: { 'x-line-user-id': profile.lineUserId } });
        if (!res.ok) throw new Error('not registered');
        const d = await res.json() as { teacherId?: string; name?: string; role?: string };
        if (!d.teacherId) throw new Error('no teacher');
        if (!cancelled) {
          setTeacher({ teacherId: d.teacherId, name: d.name ?? '', role: d.role ?? 'STAFF', lineUserId: profile.lineUserId });
          setStatus('authenticated');
        }
      } catch {
        if (!cancelled) setStatus('manual');
      }
    })();
    return () => { cancelled = true; };
  }, [liffStatus, profile]);

  return { status, teacher };
}
