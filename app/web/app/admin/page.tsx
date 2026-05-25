'use client';

import { useEffect, useState } from 'react';
import { ShieldAlert, Users } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api';
import type { AuthUser } from '@/lib/types';

export default function AdminPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/admin/users');
        if (res.status === 403) {
          if (!cancelled) setForbidden(true);
          return;
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as { users: AuthUser[] };
        if (!cancelled) setUsers(data.users);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load users');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-brand px-6 pb-8 pt-9 text-brand-foreground md:px-8">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">User Management</h1>
            <p className="mt-0.5 text-sm text-brand-muted">Admin-only — manage system accounts</p>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-4 max-w-4xl p-4 md:p-6">
        {forbidden ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <ShieldAlert className="h-10 w-10 text-destructive" />
              <div>
                <p className="font-semibold text-card-foreground">Access denied</p>
                <p className="text-sm text-muted-foreground">
                  This area requires the Admin (Manager) role.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>
                {loading ? 'Loading…' : `${users.length} user${users.length === 1 ? '' : 's'}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 3 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-10 text-center text-destructive">
                        {error}
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">@{u.username}</TableCell>
                        <TableCell>{u.name}</TableCell>
                        <TableCell>
                          <Badge variant={u.role === 'admin' ? 'warning' : 'secondary'}>
                            {u.role === 'admin' ? 'Admin' : 'Assessor'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
