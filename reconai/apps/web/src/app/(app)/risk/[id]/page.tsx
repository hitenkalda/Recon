'use client';

import { useEffect, useMemo, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useRiskRun } from '@/lib/hooks';
import type { RiskFinding } from '@/lib/hooks';
import { GlassCard, Badge, Button, Spinner, ErrorState, StatusBadge, Stat } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo } from '@/lib/format';
import { clsx } from 'clsx';

type TabKey = 'all' | 'high' | 'medium' | 'low';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All Findings' },
  { key: 'high', label: 'High Risk' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
];

function riskTone(score: number): 'critical' | 'danger' | 'warning' | 'success' | 'default' {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'danger';
  if (score >= 40) return 'warning';
  if (score < 20) return 'success';
  return 'default';
}

export default function RiskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: run, isLoading, error, refetch } = useRiskRun(id);
  const [tab, setTab] = useState<TabKey>('all');

  useEffect(() => {
    if (!run) return;
    if (run.status === 'queued' || run.status === 'running') {
      const t = setInterval(() => void refetch(), 4000);
      return () => clearInterval(t);
    }
  }, [run, refetch]);

  const metrics = run?.metrics;

  const findings = useMemo(() => {
    if (!metrics) return [];
    const all: RiskFinding[] = [];
    const ruleCounts = metrics.ruleCounts ?? {};
    // Synthesize findings from metrics.ruleCounts since the API may not return
    // individual findings in the metrics payload; this provides a reasonable UI.
    for (const [rule, count] of Object.entries(ruleCounts)) {
      // Derive a score distribution from ruleCounts – in a real response the
      // API would supply individual finding objects.  For now we show each rule
      // as a card.
      all.push({
        rule,
        score: count > 5 ? 75 : count > 2 ? 50 : 25,
        reason: `${count} occurrence${count !== 1 ? 's' : ''} flagged by ${label(rule)} rule`,
        riskLevel: count > 5 ? 'high' : count > 2 ? 'medium' : 'low',
      });
    }
    return all;
  }, [metrics]);

  const filtered = useMemo(
    () => (tab === 'all' ? findings : findings.filter((f) => f.riskLevel === tab)),
    [findings, tab],
  );

  if (isLoading) return <Spinner label="Loading risk analysis" />;
  if (error || !run) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const running = run.status === 'queued' || run.status === 'running';
  const finished = run.status === 'completed';

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <section className="flex flex-col gap-2">
        <Link href="/risk" className="inline-flex items-center gap-1 font-mono text-[10px] text-mine-400 hover:text-white transition-colors uppercase tracking-wider">
          <Icon name="chevron_right" size={14} className="rotate-180" /> Risk & Verification
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
                {label(run.type)} Analysis
              </h1>
              <StatusBadge status={run.status} />
              {running ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-cyan-200 bg-cyan-950/40 border border-cyan-500/25 px-2 py-0.5 rounded-full">
                  <Icon name="progress_activity" size={12} className="animate-spin" /> Processing
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-mine-400 flex-wrap">
              <span className="inline-flex items-center gap-1"><Icon name="corporate_fare" size={13} />{run.client?.name ?? '—'}</span>
              <span>·</span>
              <span>{run.engagement?.title ?? '—'}</span>
              <span>·</span>
              <span>{timeAgo(run.createdAt)}</span>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => void refetch()} disabled={running}>
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {/* Summary metrics */}
      {metrics ? (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Total Analyzed" value={metrics.total} accent="cyan" />
          <Stat label="Flagged" value={metrics.flagged} accent="teal" />
          <Stat label="High Risk" value={metrics.highRisk} accent={metrics.highRisk > 0 ? 'cyan' : 'none'} />
          <Stat label="Medium" value={metrics.mediumRisk} accent={metrics.mediumRisk > 0 ? 'cyan' : 'none'} />
        </section>
      ) : running ? (
        <GlassCard className="p-6 flex items-center justify-center gap-2 text-xs text-mine-400">
          <Icon name="progress_activity" size={16} className="animate-spin text-cyan-300" />
          Analysis is still processing…
        </GlassCard>
      ) : null}

      {/* Rule breakdown */}
      {metrics?.ruleCounts && Object.keys(metrics.ruleCounts).length > 0 ? (
        <GlassCard className="p-4 overflow-hidden">
          <div className="px-1 pb-3 font-caps text-[9px] text-mine-400 tracking-widest">Rule Breakdown</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(metrics.ruleCounts).map(([rule, count]) => (
              <div key={rule} className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02]">
                <span className="font-mono text-[11px] text-white">{label(rule)}</span>
                <Badge tone={count > 5 ? 'danger' : count > 2 ? 'warning' : 'dim'}>{count}</Badge>
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {TABS.map((t) => {
          const count = t.key === 'all'
            ? findings.length
            : findings.filter((f) => f.riskLevel === t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider border transition-all',
                tab === t.key ? 'bg-white text-slate-950 border-white' : 'text-mine-400 border-white/[0.08] hover:text-white',
              )}
            >
              {t.label}
              {count > 0 ? (
                <span className={clsx('text-slate-500', tab === t.key && 'text-slate-600')}>{count}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Findings list */}
      {!running && filtered.length === 0 && finished ? (
        <GlassCard className="p-8 flex items-center justify-center gap-2 text-xs text-mine-400">
          <Icon name="verified" size={16} className="text-emerald-400" />
          No findings in this category.
        </GlassCard>
      ) : null}

      {filtered.length > 0 ? (
        <div className="flex flex-col gap-2">
          {filtered.map((finding, i) => (
            <GlassCard key={i} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={riskTone(finding.score)}>{finding.riskLevel}</Badge>
                    <span className="font-mono text-[10px] text-mine-400">Score: {finding.score}</span>
                  </div>
                  <span className="text-sm font-medium text-white">{label(finding.rule)}</span>
                  <p className="text-[13px] text-slate-300 leading-relaxed">{finding.reason}</p>
                </div>
                <Badge tone={riskTone(finding.score)}>{finding.score}</Badge>
              </div>
              <div className="flex justify-end">
                <Link
                  href={`/exceptions?engagementId=${run.engagementId}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider border border-white/[0.08] text-mine-400 hover:text-white hover:border-white/20 transition-all"
                >
                  <Icon name="flag" size={12} /> Create Exception
                </Link>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : null}
    </div>
  );
}
