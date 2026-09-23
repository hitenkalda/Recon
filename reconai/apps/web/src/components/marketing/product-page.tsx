'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Icon, type IconName } from '@/components/ui/icon';
import { MarketingHeader } from './header';
import { MarketingFooter } from './footer';

export type ProductStat = { label: string; value: string; color: string };
export type ProductFeature = { title: string; description: string; icon: IconName };

export type ProductPageContent = {
  pill: string;
  headingA: string;
  headingB: string;
  subtitle: string;
  primaryCta: string;
  secondaryCta: string;
  stats: ProductStat[];
  sectionHeadingA: string;
  sectionHeadingB: string;
  sectionDescription: string;
  features: ProductFeature[];
};

/* ── Floating stat pill (desktop, absolute around hero) ───────────── */
function StatNode({
  stat, side, top, bottom, delay,
}: {
  stat: ProductStat; side: 'left' | 'right'; top?: string; bottom?: string; delay?: string;
}) {
  return (
    <div
      className={`hidden lg:flex absolute ${side === 'left' ? 'left-0 xl:left-8' : 'right-0 xl:right-8'}`}
      style={{ top, bottom, animation: `float 6s ease-in-out infinite ${delay ?? '0s'}` }}
    >
      <div className="glass-pill rounded-2xl border border-white/10 px-4 py-3 flex flex-col gap-1 shadow-xl shadow-black/30">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${stat.color} shadow-[0_0_8px_currentColor]`} />
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-slate-400">{stat.label}</span>
        </div>
        <span className="text-xl md:text-2xl font-semibold text-white tracking-tight">{stat.value}</span>
      </div>
    </div>
  );
}

/* ── Feature card ──────────────────────────────────────────────────── */
function FeatureCard({ feature }: { feature: ProductFeature }) {
  return (
    <div className="glass-pill rounded-2xl border border-white/10 p-6 flex flex-col gap-3 shadow-xl shadow-black/20 hover:border-cyan-400/30 transition-colors group">
      <div className="w-9 h-9 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-300 group-hover:shadow-[0_0_18px_-4px_rgba(0,240,255,0.5)] transition-shadow">
        <Icon name={feature.icon} size={18} />
      </div>
      <h3 className="text-[15px] font-semibold text-white tracking-wide">{feature.title}</h3>
      <p className="text-[13px] text-slate-400 leading-relaxed">{feature.description}</p>
    </div>
  );
}

/* ── Shared product page template (GST / Tax / Bank Recon) ─────────── */
export function ProductPage({ content }: { content: ProductPageContent }) {
  const { me } = useAuth();
  const primaryHref = me ? '/reconciliation' : '/signup';

  const statPositions = [
    { side: 'left' as const, top: '64px' },
    { side: 'left' as const, bottom: '120px' },
    { side: 'right' as const, top: '88px' },
    { side: 'right' as const, bottom: '148px' },
  ];

  return (
    <div className="min-h-screen w-full flex flex-col relative hero-aurora-bg">
      <MarketingHeader />

      <main className="relative w-full flex-1 flex flex-col items-center px-4 sm:px-8">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="relative w-full max-w-6xl mx-auto flex flex-col items-center justify-center min-h-[540px] py-16">
          {content.stats.map((stat, i) => (
            <StatNode key={stat.label} stat={stat} {...statPositions[i % statPositions.length]} delay={`${-i * 1.4}s`} />
          ))}

          {/* Mobile stat band (info stays available < lg) */}
          <div className="lg:hidden grid grid-cols-2 gap-3 mb-12 w-full max-w-md">
            {content.stats.map((s) => (
              <div key={s.label} className="glass-pill rounded-2xl border border-white/10 px-4 py-3 flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.color}`} />
                  <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">{s.label}</span>
                </div>
                <span className="text-lg font-semibold text-white">{s.value}</span>
              </div>
            ))}
          </div>

          <div className="mb-5 inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-medium text-slate-300 glass-pill border border-white/15 shadow-inner">
            <span className="text-cyan-300">✦</span>
            <span className="tracking-tight text-slate-200">{content.pill}</span>
          </div>

          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight text-center max-w-4xl hero-title-gradient leading-[1.08] mb-5"
            style={{ fontFamily: 'var(--font-geist)' }}
          >
            {content.headingA}
            <br />
            {content.headingB}
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-slate-400 text-center max-w-2xl font-light leading-relaxed mb-8 px-2">
            {content.subtitle}
          </p>

          <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-center">
            <Link
              href={primaryHref}
              className="px-6 py-2.5 rounded-full text-xs sm:text-sm font-medium text-white glass-pill hover:bg-white/10 transition-all border border-white/20 flex items-center gap-1.5 shadow-lg group"
            >
              <span>{content.primaryCta}</span>
              <span className="text-slate-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-xs">↗</span>
            </Link>
            <a
              href="#how-it-works"
              className="px-7 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-slate-950 bg-white hover:bg-slate-100 transition-all shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.99]"
            >
              {content.secondaryCta}
            </a>
          </div>
        </section>

        {/* ── Section heading + description ────────────────────────── */}
        <section
          id="how-it-works"
          className="w-full max-w-5xl mx-auto flex flex-col items-center text-center py-16 scroll-mt-24 border-t border-white/[0.06]"
        >
          <h2
            className="text-3xl sm:text-4xl md:text-[44px] font-medium tracking-tight text-center max-w-3xl hero-title-gradient leading-[1.12] mb-6"
            style={{ fontFamily: 'var(--font-geist)' }}
          >
            {content.sectionHeadingA}
            <br />
            {content.sectionHeadingB}
          </h2>
          <p className="text-sm sm:text-base text-slate-400 text-center max-w-2xl font-light leading-relaxed px-2">
            {content.sectionDescription}
          </p>
        </section>

        {/* ── Feature cards ────────────────────────────────────────── */}
        <section className="w-full max-w-5xl mx-auto grid sm:grid-cols-2 gap-4 pb-20">
          {content.features.map((f) => (
            <FeatureCard key={f.title} feature={f} />
          ))}
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}