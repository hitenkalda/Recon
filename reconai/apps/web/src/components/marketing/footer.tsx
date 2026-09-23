'use client';

import Link from 'next/link';
import { NeuralBlossomMark } from './header';

const LINKS = [
  { label: 'GST Recon', href: '/gst-recon' },
  { label: 'Tax Recon', href: '/tax-recon' },
  { label: 'Bank Recon', href: '/bank-recon' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'FAQ', href: '/faq' },
];

/* ── Marketing footer: tagline + trust positioning ────────────────── */
export function MarketingFooter() {
  return (
    <footer className="w-full border-t border-white/[0.06] pt-10 pb-8 px-4">
      <div className="max-w-6xl mx-auto flex flex-col items-center gap-5 text-center">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center opacity-90">
            <NeuralBlossomMark />
          </div>
          <span className="text-xs font-bold tracking-[0.14em] uppercase" style={{ fontFamily: 'var(--font-geist)' }}>
            Recon<span className="text-cyan-400">AI</span>
          </span>
        </div>

        <p className="text-sm text-slate-200 font-medium tracking-wide">
          ReconAI <span className="text-slate-500">—</span> Reconcile faster. Review smarter.
        </p>
        <p className="text-xs text-slate-500 max-w-md leading-relaxed">
          Built to assist professionals, not replace them.
        </p>

        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-400">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-white transition-colors">
              {l.label}
            </Link>
          ))}
        </nav>

        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-slate-600">
          © 2026 ReconAI · Defense Platform
        </p>
      </div>
    </footer>
  );
}