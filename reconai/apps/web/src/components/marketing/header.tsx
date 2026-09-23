'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

/* ── Neural Blossom mark (exact SVG from stitch design 2) ─────────── */
export function NeuralBlossomMark({ className = 'w-full h-full' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg">
      <rect fill="#0b1120" height="220" width="320" rx="40" />
      <g transform="translate(160,110) scale(1.15)">
        <g fill="none" opacity="0.9" stroke="#0077ff" strokeWidth="3">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => (
            <path
              key={d}
              d="M0 -60 C20 -60, 35 -40, 20 -20 C10 -5, -10 -5, -20 -20 C-35 -40, -20 -60, 0 -60 Z"
              transform={`rotate(${d})`}
            />
          ))}
        </g>
        <g fill="#00e5ff">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((d) => (
            <circle key={d} cx="0" cy="-62" r="4" transform={`rotate(${d})`} />
          ))}
        </g>
        <g fill="none" stroke="#00e5ff" strokeLinecap="round" strokeWidth="2.8">
          {[0, 60, 120, 180, 240, 300].map((d) => (
            <path key={d} d="M0,-12 A16,16 0 0,1 18,-6" transform={`rotate(${d})`} />
          ))}
        </g>
        <circle cx="0" cy="0" r="4" fill="#00f0ff" />
      </g>
    </svg>
  );
}

const NAV = [
  { label: 'Home', href: '/' },
  { label: 'GST Recon', href: '/gst-recon' },
  { label: 'Tax Recon', href: '/tax-recon' },
  { label: 'Bank Recon', href: '/bank-recon' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'FAQ', href: '/faq' },
];

/* ── Shared marketing header (landing + product pages) ────────────── */
export function MarketingHeader() {
  const { me } = useAuth();
  const pathname = usePathname();

  return (
    <header className="w-full z-50 flex items-center justify-between px-3 md:px-6 py-2">
      <Link className="flex items-center gap-3 group" href="/">
        <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
          <NeuralBlossomMark />
        </div>
        <span className="text-sm tracking-wider font-semibold text-white uppercase hidden sm:inline-block">
          Recon<span className="text-cyan-400">AI</span>
        </span>
      </Link>

      <nav className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-pill text-xs font-medium text-slate-300 shadow-2xl">
        {NAV.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-full transition-colors ${
                active ? 'text-white bg-white/[0.06]' : 'text-slate-300 hover:text-white'
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        {me ? (
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-xs font-medium text-slate-200 hover:text-white transition-colors px-3 py-1.5 rounded-full border border-white/5 hover:border-white/20 bg-white/[0.03]"
          >
            Dashboard →
          </Link>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-2 text-xs font-medium text-slate-200 hover:text-white transition-colors px-3 py-1.5 rounded-full border border-white/5 hover:border-white/20 bg-white/[0.03]"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="hidden sm:inline">Create Account</span>
          </Link>
        )}
      </div>
    </header>
  );
}