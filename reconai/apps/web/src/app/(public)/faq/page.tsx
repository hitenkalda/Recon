'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MarketingHeader } from '@/components/marketing/header';
import { MarketingFooter } from '@/components/marketing/footer';
import { Icon } from '@/components/ui/icon';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'What exactly is ReconAI?',
    a: 'ReconAI is an AI-powered audit and reconciliation platform built for CA firms. It automates GST, tax (26AS/AIS) and bank reconciliations, flags mismatches and duplicates, and keeps a clear working-paper trail for every exception — so you review exceptions instead of comparing thousands of rows.',
  },
  {
    q: 'Which CA firm setups does it suit?',
    a: 'From boutique practices to mid and large multi-partner firms. Starter covers up to 3 active client entities, Pro Firm scales to 25 companies with full neural matching, and Enterprise handles high-volume statutory audits with role-based access and isolated tenant databases.',
  },
  {
    q: 'Does ReconAI replace the professional?',
    a: 'No. It is built to assist professionals, not replace them. The engine does the mechanical matching and discrepancy detection; judgment, review and sign-off always stay with you and your team.',
  },
  {
    q: 'Which data sources can I connect?',
    a: 'GSTR-2B exports and CSV ledgers, 26AS and AIS tax-source data, and bank statements in spreadsheets or PDFs (with OCR parsing). ReconAI normalizes messy vendor formats into one common matching view.',
  },
  {
    q: 'How is client data kept secure?',
    a: 'Data is stored on SOC 2 Type II compliant infrastructure, encrypted at rest and in transit, and accessible only under role-based permissions. Every matched and reviewed item is stamped into a SHA-256 audit trail. Enterprise adds a separate, isolated tenant database vault.',
  },
  {
    q: 'How long does a typical run take?',
    a: 'A monthly batch of thousands of rows reconciles in minutes, not days. You work through the exceptions at your own pace — nothing is ever auto-signed off.',
  },
  {
    q: 'What if a client sends messy files?',
    a: 'That is the point. The engine parses statements, narrations and prefixes, tolerates formatting variance, and surfaces only what needs a second look.',
  },
  {
    q: 'How do I get started?',
    a: 'Create a free account, upload a ledger, and run a first reconciliation — no credit card required. Upgrade any time if you want fuzzy AI matching, OCR parsing or higher monthly volumes.',
  },
];

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className="glass-pill rounded-2xl border border-white/10 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
        aria-expanded={open}
      >
        <span className="text-[14px] sm:text-[15px] font-medium text-white tracking-wide">{q}</span>
        <Icon
          name="chevron_down"
          size={18}
          className={`shrink-0 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180 text-cyan-300' : ''}`}
        />
      </button>
      <div
        className="grid transition-all duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-[13px] leading-relaxed text-slate-400">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function FaqPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="min-h-screen w-full flex flex-col relative hero-aurora-bg">
      <MarketingHeader />

      <main className="relative w-full flex-1 flex flex-col items-center px-4 sm:px-8">
        <section className="relative w-full max-w-3xl mx-auto flex flex-col items-center py-20">
          <div className="mb-5 inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-medium text-slate-300 glass-pill border border-white/15 shadow-inner">
            <span className="text-cyan-300">✦</span>
            <span className="tracking-tight text-slate-200">FAQ</span>
          </div>

          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight text-center max-w-3xl hero-title-gradient leading-[1.08] mb-5"
            style={{ fontFamily: 'var(--font-geist)' }}
          >
            Answers, without the noise.
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-slate-400 text-center max-w-2xl font-light leading-relaxed mb-12 px-2">
            Everything CA firms ask before their first automated reconciliation — answered plainly.
          </p>

          <div className="w-full flex flex-col gap-3">
            {FAQS.map((f, i) => (
              <FaqItem
                key={f.q}
                q={f.q}
                a={f.a}
                open={open === i}
                onToggle={() => setOpen(open === i ? null : i)}
              />
            ))}
          </div>

          <div className="mt-14 w-full glass-pill rounded-2xl border border-white/10 px-6 py-8 flex flex-col items-center gap-4 text-center">
            <h2
              className="text-2xl sm:text-3xl font-medium tracking-tight hero-title-gradient"
              style={{ fontFamily: 'var(--font-geist)' }}
            >
              Still have questions?
            </h2>
            <p className="text-[13px] text-slate-400 max-w-md leading-relaxed">
              Start reconciling in minutes — or compare plans and pick the fit for your firm.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="px-6 py-2.5 rounded-full text-xs sm:text-sm font-medium text-white glass-pill hover:bg-white/10 transition-all border border-white/20 flex items-center gap-1.5 shadow-lg group"
              >
                <span>Get Started Free</span>
                <span className="text-slate-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-xs">↗</span>
              </Link>
              <Link
                href="/pricing"
                className="px-7 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-slate-950 bg-white hover:bg-slate-100 transition-all shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.99]"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}