'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { MarketingHeader } from '@/components/marketing/header';

/* ── Floating neural node component ──────────────────────────────── */
function NodeCard({
  label, stat, color, side, top, bottom,
}: {
  label: string; stat: string; color: string; side: 'left' | 'right'; top?: string; bottom?: string;
}) {
  const ring = side === 'left'
    ? 'border-r-0 rounded-r-none'
    : 'border-l-0 rounded-l-none';
  return (
    <div
      className={`hidden lg:flex items-center gap-3 absolute ${side === 'left' ? 'left-16 xl:left-24' : 'right-20 xl:right-32'}`}
      style={{ top, bottom, animation: `float 6s ease-in-out infinite ${side === 'right' ? '-2s' : '0s'}` }}
    >
      {side === 'right' && (
        <div className="text-right">
          <div className="text-[13px] font-medium text-slate-200 flex items-center justify-end gap-1.5">
            {label} <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />
          </div>
          <div className="text-[11px] text-slate-400 tracking-wider">{stat}</div>
        </div>
      )}
      <div className={`w-7 h-7 rounded-full glass-pill border border-white/20 flex items-center justify-center text-white text-[11px] shadow-lg shadow-black/40 ${ring}`}>
        <div className={`w-2 h-2 rounded-full ${color.replace('bg-', 'bg-')}`} />
      </div>
      {side === 'left' && (
        <div>
          <div className="text-[13px] font-medium text-slate-200 flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} /> {label}
          </div>
          <div className="text-[11px] text-slate-400 tracking-wider">{stat}</div>
        </div>
      )}
    </div>
  );
}

export default function LandingPage() {
  const { me } = useAuth();

  return (
    <div className="min-h-screen w-full flex flex-col justify-between relative p-2 sm:p-4 md:p-6 lg:p-7 hero-aurora-bg">
      {/* ── Header (shared marketing header) ───────────────────────── */}
      <MarketingHeader />

      {/* ── Hero section ───────────────────────────────────────────── */}
      <main className="relative w-full flex-1 flex flex-col justify-center items-center px-4 sm:px-8 my-6 min-h-[560px]">
        {/* SVG circuit overlay (desktop only) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none hidden lg:block" xmlns="http://www.w3.org/2000/svg">
          <path className="circuit-node-line" d="M 60 220 L 160 220 L 220 180 L 320 180" fill="none" />
          <circle cx="160" cy="220" fill="#ffffff" opacity="0.6" r="3" />
          <path className="circuit-node-line" d="M 60 460 L 170 460 L 230 510 L 330 510" fill="none" />
          <path className="circuit-node-line" d="M 760 210 L 850 210 L 910 240 L 1020 240" fill="none" />
          <path className="circuit-node-line" d="M 770 510 L 840 480 L 940 480 L 1030 480" fill="none" />
          <line opacity="0.75" stroke="url(#streakGrad1)" strokeWidth="1.5" x1="50%" x2="50%" y1="520" y2="640" />
          <line opacity="0.5" stroke="url(#streakGrad2)" strokeWidth="1.2" x1="48%" x2="48%" y1="540" y2="650" />
          <line opacity="0.6" stroke="url(#streakGrad1)" strokeWidth="1.2" x1="52.5%" x2="52.5%" y1="530" y2="670" />
          <defs>
            <linearGradient id="streakGrad1" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="60%" stopColor="#94bda4" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="streakGrad2" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0077ff" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Floating neural nodes */}
        <NodeCard label="Cortex" stat="20.945 ms" color="bg-cyan-400" side="left" top="64px" />
        <NodeCard label="Aelf" stat="19.346 TPS" color="bg-emerald-400" side="left" bottom="88px" />
        <NodeCard label="Quant" stat="2,845 Rules" color="bg-teal-300" side="right" top="80px" />
        <NodeCard label="Meeton" stat="440 Ledgers" color="bg-sky-400" side="right" bottom="112px" />

        {/* Play indicator */}
        <div className="mb-4 flex items-center justify-center">
          <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:scale-110 transition-all cursor-pointer">
            <svg className="w-3 h-3 ml-0.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>

        {/* Spark badge */}
        <div className="mb-5 inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-medium text-slate-300 glass-pill border border-white/15 shadow-inner hover:border-white/30 transition-all cursor-pointer group">
          <span className="w-3.5 h-3.5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px]">⚡</span>
          <span className="tracking-tight text-slate-200">Unlock Your Assets Spark!</span>
          <span className="text-slate-400 group-hover:translate-x-0.5 transition-transform">→</span>
        </div>

        {/* Main heading */}
        <h1
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight text-center max-w-4xl hero-title-gradient leading-[1.08] mb-5"
          style={{ fontFamily: 'var(--font-geist)' }}
        >
          One-click for Asset Defense
        </h1>

        {/* Subtitle */}
        <p className="text-sm sm:text-base md:text-lg text-slate-400 text-center max-w-2xl font-light leading-relaxed mb-8 px-2">
          Dive into automated reconciliation and asset defense, where autonomous AI intelligence
          meets rigorous financial precision for CA firms and modern enterprises.
        </p>

        {/* CTA buttons */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-center">
          <Link
            href={me ? '/dashboard' : '/login'}
            className="px-6 py-2.5 rounded-full text-xs sm:text-sm font-medium text-white glass-pill hover:bg-white/10 transition-all border border-white/20 flex items-center gap-1.5 shadow-lg group"
          >
            <span>Open App</span>
            <span className="text-slate-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-xs">↗</span>
          </Link>
          <Link
            href="/pricing"
            className="px-7 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-slate-950 bg-white hover:bg-slate-100 transition-all shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.99]"
          >
            Discover More
          </Link>
        </div>

        {/* Bottom indicators */}
        <div className="w-full flex items-center justify-between mt-14 sm:mt-20 pt-4 px-2 sm:px-6">
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full glass-pill text-xs text-slate-300 border border-white/10">
            <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white">↓</div>
            <span className="font-mono text-[11px] text-slate-200">02/03 · Scroll down</span>
          </div>
          <div className="hidden sm:block" />
          <div className="text-right">
            <div className="text-xs font-medium text-slate-300 mb-1.5 tracking-wide">DeFi &amp; Ledger horizons</div>
            <div className="flex items-center justify-end gap-1 w-28 sm:w-36 ml-auto">
              <div className="h-1 flex-1 bg-white rounded-full" />
              <div className="h-1 flex-1 bg-white/20 rounded-full" />
              <div className="h-1 flex-1 bg-white/10 rounded-full" />
            </div>
          </div>
        </div>
      </main>

      {/* ── Partner logos bar ───────────────────────────────────────── */}
      <footer className="w-full border-t border-white/[0.06] pt-6 pb-2 px-4 mt-2">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-6 sm:gap-10 md:gap-14 flex-wrap text-slate-400 opacity-65 grayscale hover:grayscale-0 transition-all duration-300">
          {['Vercel', 'loom', 'Cash App', 'Loops', 'zapier', 'ramp', 'Raycast'].map((name) => (
            <span key={name} className="text-xs sm:text-sm font-semibold tracking-wider hover:text-white transition-colors cursor-default">
              {name}
            </span>
          ))}
        </div>
      </footer>

      </div>
  );
}
