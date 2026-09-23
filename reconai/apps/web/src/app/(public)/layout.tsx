import type { ReactNode } from 'react';

/**
 * Minimal layout for public marketing pages (pricing, landing, etc.).
 * No AppShell / auth gate — just the root shell with providers.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
