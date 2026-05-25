import type { Metadata } from 'next';
import './globals.css';
import AppShell from '../components/AppShell';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'ระบบบริหารจัดการการลา',
  description: 'Teacher leave management system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-screen antialiased">
        <AppShell>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
