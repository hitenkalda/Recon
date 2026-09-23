import type { Metadata, Viewport } from 'next';
import { Geist, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { CursorGlow } from '@/components/effects/cursor-glow';

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ReconAI — Audit & Reconciliation Platform',
    template: '%s — ReconAI',
  },
  description:
    'Autonomous financial ledger defense & audit portal for Indian Chartered Accountant firms.',
};

export const viewport: Viewport = {
  themeColor: '#07090e',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.variable} ${jetbrainsMono.variable} font-sans antialiased aurora-bg`}>
        <CursorGlow />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}