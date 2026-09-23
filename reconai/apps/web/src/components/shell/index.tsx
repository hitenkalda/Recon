'use client';

import { usePathname, useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '@/lib/auth';
import { Icon, type IconName } from '../ui/icon';
import { Brand, StatusBadge } from '../ui/primitives';
import { initials } from '@/lib/format';

type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid_view' },
  { href: '/clients', label: 'Clients', icon: 'corporate_fare' },
  { href: '/engagements', label: 'Engagements', icon: 'folder' },
  { href: '/reconciliation', label: 'Reconciliation', icon: 'sync_alt' },
  { href: '/variance', label: 'P&L Variance', icon: 'account_balance' },
  { href: '/tds', label: 'TDS Checklist', icon: 'receipt_long' },
  { href: '/working-papers', label: 'Working Papers', icon: 'description' },
  { href: '/exceptions', label: 'Exceptions', icon: 'flag' },
  { href: '/risk', label: 'Risk Analysis', icon: 'shield' },
  { href: '/reports', label: 'Reports', icon: 'analytics' },
];

const DOCK: NavItem[] = [
  { href: '/dashboard', label: 'Dash', icon: 'grid_view' },
  { href: '/reconciliation', label: 'Recon', icon: 'sync_alt' },
  { href: '/clients', label: 'Clients', icon: 'corporate_fare' },
  { href: '/reports', label: 'Audit', icon: 'analytics' },
];

/* ── Sidebar (desktop) ──────────────────────────────────────────────── */

function Sidebar({ onNav }: { onNav?: () => void }) {
  const { me, firm, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/dashboard' ? pathname === href : pathname.startsWith(href));
  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 h-screen sticky top-0 border-r border-white/[0.07] bg-[#07090e]/70 backdrop-blur-xl">
      <Link href="/dashboard" className="px-5 h-16 flex items-center border-b border-white/[0.06]">
        <Brand />
      </Link>
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNav}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-150',
                active
                  ? 'text-white bg-white/[0.06] border border-white/10 shadow-[inset_0_0_12px_rgba(0,240,255,0.05)]'
                  : 'text-mine-400 hover:text-white hover:bg-white/[0.04]',
              )}
            >
              <Icon
                name={item.icon}
                size={18}
                className={active ? 'text-accent-cyan' : 'text-mine-400'}
              />
              <span className="font-medium tracking-wide">{item.label}</span>
              {active ? <span className="ml-auto w-1 h-1 rounded-full bg-accent-cyan shadow-[0_0_6px_rgba(0,240,255,0.9)]" /> : null}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/[0.06] flex flex-col gap-2">
        <Link
          href="/team"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-[11px] font-mono font-semibold text-cyan-300">
            {initials(me?.name)}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[12px] font-medium text-white truncate">{me?.name ?? '…'}</span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-mine-400">{me?.role?.replace('_', ' ')}</span>
          </div>
        </Link>
        <div className="px-3 font-mono text-[9px] text-mine-400 tracking-wider truncate">
          {firm?.name ? `FIRM · ${firm.name.toUpperCase()}` : '—'}
        </div>
        <button
          onClick={() => {
            onNav?.();
            void logout().then(() => router.replace('/login'));
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 transition-colors"
        >
          <Icon name="logout" size={16} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}

/* ── Top bar (all breakpoints) ──────────────────────────────────────── */

function TopBar({ onMenu }: { onMenu?: () => void }) {
  const { me } = useAuth();
  return (
    <header className="sticky top-0 z-40 h-14 px-4 lg:px-6 flex items-center justify-between border-b border-white/[0.07] bg-[#07090e]/80 backdrop-blur-xl">
      <div className="flex items-center gap-2.5">
        <div className="lg:hidden -ml-1">
          <Brand />
        </div>
        <button
          onClick={onMenu}
          className="lg:hidden w-8 h-8 -ml-2 hidden"
          aria-label="Open menu"
        >
          <Icon name="grid_view" size={18} />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge status="online" />
        <div className="lg:hidden w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center text-[10px] font-mono text-cyan-300 font-semibold">
          {initials(me?.name)}
        </div>
      </div>
    </header>
  );
}

/* ── Mobile bottom dock ─────────────────────────────────────────────── */

function MobileDock() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const menuOpen = open;
  return (
    <>
      {menuOpen ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-16 glass-card rounded-t-2xl mx-3 overflow-hidden animate-sheet-in">
            <div className="p-2 grid grid-cols-2 gap-1">
              {[...NAV, { href: '/team', label: 'Team & Settings', icon: 'settings' as IconName }].map((item) => {
                const active = path.startsWith(item.href);
                return (
                  <a
                    key={item.href}
                    onClick={() => {
                      setOpen(false);
                      router.push(item.href);
                    }}
                    className={clsx(
                      'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors',
                      active ? 'text-white bg-white/[0.08]' : 'text-mine-400 hover:text-white',
                    )}
                  >
                    <Icon name={item.icon} size={17} className={active ? 'text-accent-cyan' : undefined} />
                    {item.label}
                  </a>
                );
              })}
              <button
                onClick={() => {
                  setOpen(false);
                  void logout().then(() => router.push('/login'));
                }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium text-rose-300 hover:bg-rose-500/10 col-span-2"
              >
                <Icon name="logout" size={17} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 pb-[env(safe-area-inset-bottom,0px)] bg-[#07090e]/85 backdrop-blur-2xl border-t border-white/[0.08]">
        <div className="flex items-center justify-around h-14 px-2 max-w-lg mx-auto">
          {DOCK.map((item) => {
            const active = item.href === '/reconciliation' ? path.startsWith(item.href) : path.startsWith(item.href);
            return (
              <a
                key={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  router.push(item.href);
                }}
                className="flex flex-col items-center justify-center min-w-[56px] py-1 text-slate-400 hover:text-white transition-colors"
              >
                <Icon
                  name={item.icon}
                  size={20}
                  className={active ? 'text-accent-cyan drop-shadow-[0_0_6px_rgba(0,240,255,0.6)]' : undefined}
                />
                <span
                  className={clsx(
                    'font-mono text-[9px] tracking-wider mt-0.5 font-medium',
                    active ? 'text-accent-cyan' : undefined,
                  )}
                >
                  {item.label}
                </span>
              </a>
            );
          })}
          <a
            onClick={(e) => {
              e.preventDefault();
              setOpen(true);
            }}
            className="flex flex-col items-center justify-center min-w-[56px] py-1 text-slate-400 hover:text-white transition-colors"
          >
            <Icon name="more_vert" size={20} />
            <span className="font-mono text-[9px] tracking-wider mt-0.5">MORE</span>
          </a>
        </div>
      </nav>
    </>
  );
}

/* ── Full shell with auth gate ──────────────────────────────────────── */

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) {
      router.replace('/login');
    }
  }, [loading, me, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Brand />
        <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-cyan-400 animate-spin" />
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="min-h-screen flex w-full">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 lg:px-6 py-5 pb-28 lg:pb-10">{children}</main>
      </div>
      <MobileDock />
    </div>
  );
}

export { useParams };