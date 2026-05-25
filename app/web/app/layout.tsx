import type { Metadata } from 'next';
import './globals.css';
import AppShell from '../components/AppShell';
import { AuthProvider } from '@/lib/auth';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'PediaSafe',
  description: 'Pneumonia Readmission Risk Assessment Tool',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
