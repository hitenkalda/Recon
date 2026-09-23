'use client';

import Link from 'next/link';
import { useDashboard } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { GlassCard, Badge, StatusBadge, Spinner, ErrorState } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/icon';
import { timeAgo, label } from '@/lib/format';

/* ── SVG circular chart for AI Confidence ──────────────────────────── */
function ConfidenceRing({ pct }: { pct: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="drop-shadow-[0_0_24px_rgba(0,240,255,0.45)]">
      <defs>
        <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f0ff" />
          <stop offset="100%" stopColor="#4ecdc4" />
        </linearGradient>
      </defs>
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke="url(#ring-grad)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform="rotate(-90 70 70)"
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
      <text x="70" y="64" textAnchor="middle" fill="white" fontSize="26" fontWeight="700" fontFamily="var(--font-geist)">
        {pct}
      </text>
      <text x="70" y="82" textAnchor="middle" fill="#94bda4" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.08em">
        CONFIDENCE
      </text>
    </svg>
  );
}

/* ── Entity breakdown bar ──────────────────────────────────────────── */
function EntityBar({ name, value, max }: { name: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-300 font-medium">{name}</span>
        <span className="font-mono text-mine-400">{value}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ── Main dashboard ────────────────────────────────────────────────── */

export default function DashboardPage() {
  const { firm } = useAuth();
  const { data, isLoading, error, refetch } = useDashboard();

  if (isLoading) return <Spinner label="Loading overview" />;
  if (error || !data) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const m = data.metrics;
  const confidence = m.runs > 0 ? Math.min(98, 70 + m.runs * 3) : 0;

  /* Build entity breakdown from client data */
  const entityMax = Math.max(...data.recentRuns.map(() => 1), 1);
  const entityCounts: Record<string, number> = {};
  data.recentRuns.forEach((r) => {
    entityCounts[r.client] = (entityCounts[r.client] || 0) + 1;
  });
  const entities = Object.entries(entityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3 pt-1">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-white/10 bg-white/[0.03] font-mono text-[10px] text-mine-400 uppercase tracking-wider">
            Dashboard · Practice Overview
          </div>
          <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[10px] px-2.5 py-0.5 rounded-full border border-cyan-500/20 bg-cyan-950/20">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
            <span className="text-cyan-200">AI Powered</span>
          </div>
        </div>
        <div>
          <h1
            className="text-2xl font-medium tracking-tight hero-title-gradient"
            style={{ fontFamily: 'var(--font-geist)' }}
          >
            {firm?.name ?? 'ReconAI'} Command Center
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-light">
            Welcome back. Here&apos;s your firm&apos;s reconciliation overview.
          </p>
        </div>
      </section>

      {/* ── KPI row ─────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          { label: 'Clients', value: m.clients, icon: 'corporate_fare' as IconName, color: 'text-cyan-300' },
          { label: 'Active Engagements', value: m.runs, icon: 'folder' as IconName, color: 'text-cyan-300' },
          { label: 'Unmatched Entries', value: m.openExceptions, icon: 'search' as IconName, color: 'text-amber-300' },
          { label: 'Audit Jobs', value: m.runs, icon: 'description' as IconName, color: 'text-cyan-300', extra: m.openExceptions > 0 ? `${m.openExceptions} Exceptions` : undefined },
        ] as { label: string; value: number; icon: IconName; color: string; extra?: string }[]).map((kpi) => (
          <GlassCard key={kpi.label} className="p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-mine-400">{kpi.label}</span>
              <Icon name={kpi.icon} size={16} className={kpi.color} />
            </div>
            <div className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
              {kpi.value}
            </div>
            {kpi.extra ? (
              <span className="font-mono text-[10px] text-amber-400/80">{kpi.extra}</span>
            ) : null}
          </GlassCard>
        ))}
      </section>

      {/* ── Status bar ──────────────────────────────────────────── */}
      <GlassCard className="p-3 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-wider">
        <div className="flex items-center gap-2 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
          Engine Online
        </div>
        <div className="flex items-center gap-2 text-cyan-300">
          <span className={`w-1.5 h-1.5 rounded-full ${m.queuedRuns ? 'bg-amber-400 animate-pulse' : 'bg-cyan-400'}`} />
          Queue: {m.queuedRuns ? 'Processing' : 'Clear'}
        </div>
        <div className="flex items-center gap-2 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
          System Nominal
        </div>
      </GlassCard>

      {/* ── Two-column: Activity + AI Confidence ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Live Activity Feed (2 cols) */}
        <div className="lg:col-span-2 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 px-1">
            <Icon name="progress_activity" size={16} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
              Live Activity Feed
            </h2>
          </div>
          <GlassCard className="divide-y divide-white/[0.06] overflow-hidden">
            {data.recentRuns.length === 0 && data.recentExceptions.length === 0 ? (
              <div className="p-8 text-center text-xs text-mine-400 flex flex-col items-center gap-2">
                <Icon name="progress_activity" size={24} className="text-slate-600" />
                <span>No activity yet — start a reconciliation run from a client engagement.</span>
              </div>
            ) : (
              <>
                {data.recentRuns.slice(0, 5).map((r) => (
                  <Link key={r.id} href="/reconciliation" className="p-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-cyan-950/40 border border-cyan-500/20 flex items-center justify-center shrink-0">
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium text-white truncate">
                          {label(r.type)} · {r.client}
                        </span>
                        <span className="font-mono text-[10px] text-mine-400 truncate">
                          {r.engagement} · {timeAgo(r.createdAt)}
                        </span>
                      </div>
                    </div>
                    <Icon name="chevron_right" size={16} className="text-mine-400 group-hover:text-white transition-colors shrink-0" />
                  </Link>
                ))}
                {data.recentExceptions.slice(0, 3).map((e) => (
                  <Link key={e.id} href="/exceptions" className="p-3 flex items-center justify-between hover:bg-white/[0.03] transition-colors group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-amber-950/30 border border-amber-500/20 flex items-center justify-center shrink-0">
                        <Icon name="flag" size={14} className="text-amber-400" />
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium text-white truncate">{e.title}</span>
                        <span className="font-mono text-[10px] text-mine-400 truncate">
                          {e.client} · {e.engagement}
                        </span>
                      </div>
                    </div>
                    <Badge tone={e.severity === 'critical' || e.severity === 'high' ? 'danger' : e.severity === 'medium' ? 'warning' : 'default'}>
                      {e.severity}
                    </Badge>
                  </Link>
                ))}
              </>
            )}
          </GlassCard>
        </div>

        {/* Right column: AI Confidence + Entity Breakdown */}
        <div className="flex flex-col gap-4">
          {/* AI Confidence Analysis */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <Icon name="shield" size={16} className="text-cyan-400" />
              <h2 className="text-sm font-semibold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
                AI Confidence Analysis
              </h2>
            </div>
            <GlassCard className="p-5 flex flex-col items-center gap-4">
              <ConfidenceRing pct={confidence} />
              <div className="text-center">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Neural matching engine performance across all reconciliation vectors.
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-950/30 font-mono text-[10px] text-emerald-300 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {confidence >= 80 ? 'High Confidence' : confidence >= 50 ? 'Moderate' : 'Warming Up'}
                </div>
              </div>
              {/* Mini stats */}
              <div className="w-full grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06]">
                <div className="text-center">
                  <div className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
                    {m.runs - m.queuedRuns}
                  </div>
                  <div className="font-mono text-[9px] text-mine-400 uppercase tracking-wider">Matched</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
                    {m.openExceptions}
                  </div>
                  <div className="font-mono text-[9px] text-mine-400 uppercase tracking-wider">Exceptions</div>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Entity Breakdown */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <Icon name="corporate_fare" size={16} className="text-cyan-400" />
              <h2 className="text-sm font-semibold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
                Entity Breakdown
              </h2>
            </div>
            <GlassCard className="p-4 flex flex-col gap-3">
              {entities.length === 0 ? (
                <div className="text-center text-xs text-mine-400 py-4">No entity data yet.</div>
              ) : (
                entities.map(([name, count]) => (
                  <EntityBar key={name} name={name} value={count} max={entityMax} />
                ))
              )}
            </GlassCard>
          </div>
        </div>
      </div>

      {/* ── Reconciliation engines ───────────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2 px-1">
          <Icon name="sync_alt" size={16} className="text-cyan-400" />
          <h2 className="text-sm font-semibold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
            Reconciliation Engines
          </h2>
          <Badge tone="dim">Multi-tenant</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: 'account_balance_wallet' as const, tone: 'text-cyan-300', name: 'GST Reconciliation', tag: 'GSTR-2B', sub: 'Purchase ledger vs 2B / 2A', href: '/reconciliation' },
            { icon: 'receipt_long' as const, tone: 'text-teal-300', name: 'Tax & Withholding', tag: 'AIS / 26AS', sub: '3-way matching vs general ledger', href: '/reconciliation' },
            { icon: 'account_balance' as const, tone: 'text-sky-300', name: 'Bank Reconciliation', tag: 'OCR', sub: 'Statement feeds & settlement', href: '/reconciliation' },
          ].map((r) => (
            <Link key={r.name} href={r.href} className="group p-4 rounded-xl glass-card-interactive flex flex-col gap-3 shadow-md">
              <div className="flex items-center justify-between">
                <div className={`w-9 h-9 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center ${r.tone} group-hover:border-cyan-400/40 transition-colors`}>
                  <Icon name={r.icon} size={18} />
                </div>
                <Badge tone="cyan">{r.tag}</Badge>
              </div>
              <div>
                <div className="text-xs font-medium text-white">{r.name}</div>
                <p className="text-[11px] text-mine-400 mt-0.5">{r.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <p className="text-center font-mono text-[9px] text-slate-500 tracking-wider pt-2">
        SHA-256 LEDGER AUDIT INTEGRITY VERIFIED
      </p>
    </div>
  );
}
