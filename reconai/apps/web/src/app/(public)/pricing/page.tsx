'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Brand } from '@/components/ui/primitives';

type PlanTab = 'firms' | 'solo' | 'enterprise';

const PLANS = [
  {
    name: 'Starter',
    badge: 'Trial',
    price: '₹0',
    period: '/ month',
    sub: 'For boutique firms evaluating autonomous ledger reconciliation and fast GSTR sanity checks.',
    features: [
      'Up to 3 active client entities',
      '1,500 invoice rows / month',
      'Basic GSTR-2B vs Books matching',
      'Standard CSV & Excel report export',
      'SOC 2 Type II compliant storage',
      'Community & Knowledge Base support',
    ],
    cta: { label: 'Get Started Free', href: '/signup' },
    featured: false,
  },
  {
    name: 'Pro Firm',
    badge: 'Most Popular',
    price: '₹4,999',
    period: '/ month',
    billed: 'Billed annually, or ₹5,999/mo monthly',
    sub: 'Full neural engine power with Gemini 1.5 Pro fuzzy reconciliation, OCR parsing, and bank cross-matching.',
    features: [
      { text: 'Gemini 1.5 Pro fuzzy invoice matcher', highlight: true },
      'Up to 25 active client companies',
      '50,000 invoice rows / month',
      '3-way Tax Recon (AIS + 26AS + Books)',
      'Bank statement OCR & narration parser',
      'Instant discrepancy & invoice prefix auto-resolver',
      'SHA-256 Audit Trail certification stamp',
    ],
    cta: { label: 'Upgrade to Pro Firm', href: '/signup' },
    featured: true,
  },
  {
    name: 'Enterprise',
    badge: 'Multi-Partner',
    price: '₹14,999',
    period: '/ month',
    billed: 'Scale custom volumes as needed',
    sub: 'For mid-to-large CA practices handling high-volume statutory audits with strict role governance.',
    features: [
      { text: 'Unlimited clients & multi-GSTIN portfolios', highlight: true },
      '500,000+ monthly entries & priority BullMQ queue',
      'Real-time GSTN API auto-sync connector',
      'Custom RBAC (Partner, Auditor, Articled Clerk)',
      'Dedicated CA onboarding manager & phone line',
      '99.98% SLA & isolated tenant database vault',
    ],
    cta: { label: 'Contact Enterprise Sales', href: '#contact-sales' },
    featured: false,
  },
];

type FeatureValue = string | '✓' | '—';

const COMPARISON: { category: string; rows: { label: string; starter: FeatureValue; pro: FeatureValue; enterprise: FeatureValue }[] }[] = [
  {
    category: 'AI & Neural Matching Engine',
    rows: [
      { label: 'Gemini 1.5 Pro Matcher', starter: '—', pro: '✓', enterprise: '✓ (Fine-tuned)' },
      { label: 'Fuzzy Invoice Number Resolver', starter: 'Basic Regex', pro: '✓ (Levenshtein + AI)', enterprise: '✓ (Custom Regex Rules)' },
      { label: 'GSTR-2B vs Purchase Register', starter: '✓', pro: '✓', enterprise: '✓' },
      { label: '3-Way Tax Recon (AIS + 26AS + Books)', starter: '—', pro: '✓', enterprise: '✓' },
      { label: 'Bank Statement Narration OCR', starter: '—', pro: '✓', enterprise: '✓' },
    ],
  },
  {
    category: 'Capacity & Processing Speed',
    rows: [
      { label: 'Monthly Invoice Row Capacity', starter: '1,500 rows', pro: '50,000 rows', enterprise: '500,000+ (Elastic)' },
      { label: 'Active Client Entities', starter: 'Up to 3', pro: 'Up to 25', enterprise: 'Unlimited' },
      { label: 'Async BullMQ Priority Lane', starter: 'Standard Queue', pro: 'Priority Lane', enterprise: 'Dedicated Cluster' },
    ],
  },
  {
    category: 'Security & Statutory Compliance',
    rows: [
      { label: 'SHA-256 Audit Trail Certification', starter: '—', pro: '✓', enterprise: '✓ (Court Admissible)' },
      { label: 'SOC 2 Type II & ISO 27001', starter: '✓', pro: '✓', enterprise: '✓' },
      { label: 'India Sovereign Data Residency', starter: '✓', pro: '✓', enterprise: '✓ (VPC Isolated)' },
      { label: 'AI Model Training On Your Data', starter: 'Never', pro: 'Never', enterprise: 'Zero-Retention' },
    ],
  },
  {
    category: 'Firm Governance & Integrations',
    rows: [
      { label: 'Team Seats & RBAC', starter: '1 Seat', pro: 'Up to 5 Seats', enterprise: 'Unlimited custom roles' },
      { label: 'Direct GSTN Portal Live Pull', starter: '—', pro: '✓ (OTP Sync)', enterprise: '✓ (Direct GSP Auto-Pull)' },
      { label: 'TallyPrime, Zoho Books & SAP Sync', starter: 'Excel / XML import', pro: '✓ Direct Plugin', enterprise: '✓ Full Bi-directional REST API' },
      { label: 'Support & Onboarding', starter: 'Community', pro: 'Priority Chat & Email', enterprise: 'Dedicated CA Partner' },
    ],
  },
];

const TABS: { key: PlanTab; label: string }[] = [
  { key: 'firms', label: 'CA Firms & Teams' },
  { key: 'solo', label: 'Solo Practitioners' },
  { key: 'enterprise', label: 'Enterprise API' },
];

function Check() {
  return <span className="text-cyan-400 font-bold mt-0.5 shrink-0">✓</span>;
}

export default function PricingPage() {
  const [tab, setTab] = useState<PlanTab>('firms');

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-[#07090e]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3 group" title="ReconAI">
            <Brand />
          </Link>
          <nav className="hidden md:flex items-center px-4 py-1.5 rounded-full bg-slate-900/70 border border-white/10 shadow-lg text-sm text-slate-400 space-x-1">
            {[
              { label: 'Home', href: '/' },
              { label: 'GST Recon', href: '/gst-recon' },
              { label: 'Tax Recon', href: '/tax-recon' },
              { label: 'Bank Recon', href: '/bank-recon' },
            ].map((l) => (
              <Link key={l.label} href={l.href} className="px-3 py-1 hover:text-white rounded-full transition-colors text-xs font-medium">
                {l.label}
              </Link>
            ))}
            <span className="px-3.5 py-1 text-white bg-slate-800 rounded-full border border-cyan-500/30 text-xs font-medium shadow-sm">
              Pricing
            </span>
          </nav>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-xs font-medium text-slate-300 hover:text-white transition-colors hidden sm:block">
              Sign In
            </Link>
            <Link href="/signup" className="px-4 py-2 rounded-full text-xs font-semibold bg-white text-slate-950 hover:bg-cyan-300 hover:shadow-[0_0_45px_-10px_rgba(0,240,255,0.22)] transition-all duration-300 flex items-center gap-1.5 shadow-md">
              Start Free Trial
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1">
        <section className="pt-16 pb-12 text-center max-w-4xl mx-auto px-4 sm:px-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/25 bg-cyan-950/20 text-cyan-300 text-xs font-medium mb-6 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            Firm-Ready Audit Intelligence
          </div>
          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white mb-4 hero-title-gradient"
            style={{ fontFamily: 'var(--font-geist)' }}
          >
            Pricing
          </h1>
          <p className="text-slate-400 text-base sm:text-lg max-w-xl mx-auto mb-10 font-normal">
            Start free. Scale your CA firm&apos;s audit intelligence as you grow.
          </p>
          <div className="inline-flex p-1 rounded-full bg-slate-900/90 border border-slate-800 shadow-inner max-w-xs sm:max-w-md mx-auto" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  tab === t.key
                    ? 'px-5 py-2 rounded-full text-xs font-medium text-white bg-slate-800 border border-white/10 shadow-sm transition-all'
                    : 'px-4 py-2 rounded-full text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors'
                }
                role="tab"
                aria-selected={tab === t.key}
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>

        {/* ── Pricing cards ──────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={
                  plan.featured
                    ? 'relative rounded-3xl p-7 lg:p-8 flex flex-col justify-between shadow-[0_0_45px_-10px_rgba(0,240,255,0.22)] overflow-hidden transition-all duration-300 border border-cyan-500/35 bg-[rgba(14,22,38,0.85)] backdrop-blur-[20px]'
                    : 'rounded-3xl p-7 lg:p-8 flex flex-col justify-between hover:border-slate-700 transition-all duration-300 border border-white/[0.07] bg-[rgba(13,19,32,0.72)] backdrop-blur-[16px]'
                }
              >
                {plan.featured ? (
                  <div className="absolute -top-16 -right-16 w-36 h-36 bg-cyan-400/20 rounded-full blur-3xl pointer-events-none" />
                ) : null}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
                      {plan.name}
                    </h3>
                    <span
                      className={
                        plan.featured
                          ? 'text-[11px] font-medium tracking-wide uppercase px-2.5 py-0.5 rounded-full bg-cyan-400/10 text-cyan-300 border border-cyan-400/30'
                          : 'text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700'
                      }
                    >
                      {plan.badge}
                    </span>
                  </div>
                  <div className="mb-4">
                    <span className="text-4xl font-bold text-white tracking-tight">{plan.price}</span>
                    <span className="text-slate-400 text-xs font-medium ml-1">{plan.period}</span>
                    {plan.billed ? <div className="text-[10px] text-cyan-400 mt-1">{plan.billed}</div> : null}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed min-h-[40px] mb-6">{plan.sub}</p>
                  <div className={`w-full h-px mb-6 ${plan.featured ? 'bg-cyan-500/20' : 'bg-slate-800/80'}`} />
                  <ul className={`space-y-3.5 text-xs mb-8 ${plan.featured ? 'text-slate-200' : 'text-slate-300'}`}>
                    {plan.features.map((f, i) => {
                      const text = typeof f === 'string' ? f : f.text;
                      const hl = typeof f === 'object' && f.highlight;
                      return (
                        <li key={i} className="flex items-start gap-2.5">
                          <Check />
                          <span className={hl ? 'font-medium text-white' : undefined}>{text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <Link
                  href={plan.cta.href}
                  className={
                    plan.featured
                      ? 'w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-400 to-cyan-300 text-slate-950 text-xs font-bold text-center hover:from-cyan-300 hover:to-white hover:shadow-[0_0_45px_-10px_rgba(0,240,255,0.22)] transition-all duration-200'
                      : 'w-full py-2.5 px-4 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-900/40 text-xs font-semibold text-white text-center hover:bg-slate-800 transition-all'
                  }
                >
                  {plan.cta.label}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature comparison ─────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-24" id="compare-plans">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-2" style={{ fontFamily: 'var(--font-geist)' }}>
              Compare features across plans
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Everything your firm needs for rapid, zero-error financial audit automation.
            </p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-800/90 bg-[#090e18]/80 backdrop-blur-md shadow-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/70">
                  <th className="py-5 px-6 font-medium text-slate-400 w-1/4" scope="col">Capability</th>
                  <th className="py-5 px-4 text-center font-semibold text-white w-1/4" scope="col">
                    <div className="text-sm font-semibold mb-1">Starter</div>
                    <Link href="/signup" className="inline-block px-3 py-1 text-[11px] font-medium rounded-full border border-slate-700 hover:border-slate-500 bg-slate-900 text-slate-300">
                      Get Started
                    </Link>
                  </th>
                  <th className="py-5 px-4 text-center font-semibold text-white w-1/4 bg-cyan-950/20 border-x border-cyan-500/20" scope="col">
                    <div className="text-sm font-semibold text-cyan-300 mb-1">Pro Firm</div>
                    <Link href="/signup" className="inline-block px-3.5 py-1 text-[11px] font-semibold rounded-full bg-cyan-400 text-slate-950 hover:bg-cyan-300 shadow-sm">
                      Upgrade
                    </Link>
                  </th>
                  <th className="py-5 px-4 text-center font-semibold text-white w-1/4" scope="col">
                    <div className="text-sm font-semibold mb-1">Enterprise</div>
                    <Link href="#contact-sales" className="inline-block px-3 py-1 text-[11px] font-medium rounded-full border border-slate-700 hover:border-slate-500 bg-slate-900 text-slate-300">
                      Contact
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-light">
                {COMPARISON.map((cat) => (
                  <Fragment key={cat.category}>
                    <tr className="bg-slate-950/40">
                      <th className="py-3 px-6 text-[11px] font-semibold tracking-wider uppercase text-cyan-400/90" colSpan={4}>
                        {cat.category}
                      </th>
                    </tr>
                    {cat.rows.map((row) => (
                      <tr key={row.label} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-6 text-slate-300 font-medium">{row.label}</td>
                        <td className="py-3.5 px-4 text-center text-slate-500">{row.starter}</td>
                        <td className="py-3.5 px-4 text-center text-cyan-400 font-bold bg-cyan-950/10 border-x border-cyan-500/10">{row.pro}</td>
                        <td className="py-3.5 px-4 text-center text-cyan-400 font-bold">{row.enterprise}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Enterprise CTA banner ─────────────────────────────────── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
          <div className="rounded-3xl p-8 sm:p-12 border border-slate-800 relative overflow-hidden flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 bg-[rgba(13,19,32,0.72)] backdrop-blur-[16px]">
            <div className="max-w-2xl">
              <div className="text-[11px] uppercase font-mono tracking-widest text-cyan-400 mb-2">Enterprise Custom Architecture</div>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight" style={{ fontFamily: 'var(--font-geist)' }}>
                Need a custom high-volume plan?
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Talk to our enterprise solution architects for private VPC deployments, volume API rates, on-premise ledger integration, and dedicated BullMQ worker clusters.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-400">
                {['Custom rate limits', 'SSO & SCIM Provisioning', 'Sovereign Data Residency', 'Volume scale pricing'].map((f) => (
                  <span key={f} className="inline-flex items-center gap-1.5">
                    <span className="text-cyan-400">✓</span> {f}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              <Link href="#contact-sales" className="px-6 py-3 rounded-xl bg-white text-slate-950 hover:bg-cyan-300 font-semibold text-xs text-center transition-all shadow-lg hover:shadow-[0_0_45px_-10px_rgba(0,240,255,0.22)]">
                Contact Enterprise Sales
              </Link>
              <a href="mailto:sales@reconai.in" className="px-6 py-3 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-900/60 text-slate-200 hover:text-white font-medium text-xs text-center transition-all">
                Email sales@reconai.in
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-900 bg-[#05070a] relative z-10 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                <Brand />
              </div>
              <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
                Next-generation autonomous ledger defense and fuzzy GST audit reconciliation designed specifically for modern CA firms and statutory auditors.
              </p>
              <div className="text-[11px] text-slate-400 pt-2">© 2026 ReconAI Financial Technologies Inc. All rights reserved.</div>
            </div>
            {[
              {
                title: 'Engines',
                links: ['GST 2B Matcher', '3-Way AIS / 26AS', 'Bank OCR Parser', 'Ledger Discrepancy Fixer', 'SHA-256 Audit Trail'],
              },
              {
                title: 'Solutions',
                links: ['CA Audit Firms', 'Corporate Tax Depts', 'TallyPrime Connector', 'REST API Docs', 'Security Overview'],
              },
              {
                title: 'Trust & Legal',
                links: ['SOC 2 Compliance', 'Privacy Policy', 'Terms of Service', 'Data Residency (India)', 'System Status'],
              },
            ].map((col) => (
              <div key={col.title} className="space-y-3">
                <div className="text-xs font-semibold text-white tracking-wider uppercase">{col.title}</div>
                <ul className="space-y-2 text-xs">
                  {col.links.map((l) => (
                    <li key={l}>
                      <span className="hover:text-cyan-400 transition-colors cursor-default">{l}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-900 pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-4">
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                All Matching Systems Operational
              </span>
              <span>•</span>
              <span>Latency: 84ms BullMQ</span>
            </div>
            <div className="flex items-center gap-4">
              {['LinkedIn', 'X (Twitter)', 'GitHub', 'Discord CA Guild'].map((s) => (
                <span key={s} className="hover:text-white transition-colors cursor-default">{s}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
