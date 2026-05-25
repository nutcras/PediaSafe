'use client';

import { useState } from 'react';
import { Loader2, ShieldPlus } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/lib/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setSubmitting(true);
    try {
      await login(username, password);
      toast.success('Signed in');
      // AuthGate redirects to "/" once the user is set.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldPlus className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">PediaSafe</CardTitle>
          <CardDescription>Sign in to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="manager or nurse"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-4 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-card-foreground">Demo accounts</p>
            <p className="mt-1">Manager (admin): <code>manager</code> / <code>manager123</code></p>
            <p>Nurse (assessor): <code>nurse</code> / <code>nurse123</code></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
