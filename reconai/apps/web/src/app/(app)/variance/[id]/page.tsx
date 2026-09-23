'use client';

import { useEffect, useMemo, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useVarianceRun, useVarianceResults, ApiError } from '@/lib/hooks';
import { api } from '@/lib/api';
import { GlassCard, Badge, Button, Spinner, ErrorState, StatusBadge, StateBlock } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo, inr } from '@/lib/format';
import { clsx } from 'clsx';

const VAR_CATEGORIES = ['within_threshold', 'quick_review', 'detailed_review', 'new_ledger', 'no_movement', 'dropped'];
const VAR_LABELS: Record<string, { label: string; tone: 'mint' | 'warning' | 'danger' | 'cyan' | 'dim' | 'blue' }> = {
  within_threshold: { label: 'Within Threshold', tone: 'mint' },
  quick_review: { label: 'Quick Review', tone: 'warning' },
  detailed_review: { label: 'Detailed Review', tone: 'danger' },
  new_ledger: { label: 'New Ledger', tone: 'cyan' },
  no_movement: { label: 'No Movement', tone: 'dim' },
  dropped: { label: 'Dropped', tone: 'blue' },
};

type TabKey = 'all' | 'ob' | (typeof VAR_CATEGORIES)[number];

function catTone(c: string) {
  return VAR_LABELS[c]?.tone ?? 'dim';
}

export default function VarianceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const category = tab === 'all' || tab === 'ob' ? 'all' : tab;
  const obOnly = tab === 'ob';
  const { data: run, isLoading, error, refetch } = useVarianceRun(id);
  const results = useVarianceResults(id, { category, page, obMismatch: obOnly });

  // Poll while the run is queued/running.
  useEffect(() => {
    if (!run) return;
    if (run.status === 'queued' || run.status === 'running') {
      const t = setInterval(() => {
        void refetch();
        void results.refetch();
      }, 4000);
      return () => clearInterval(t);
    }
  }, [run, refetch, results]);

  const metrics = useMemo(() => {
    const m = run?.metrics ?? {};
    return {
      within: m.withinThreshold ?? 0,
      quick: m.quickReview ?? 0,
      detailed: m.detailedReview ?? 0,
      newLedgers: m.newLedgers ?? 0,
      noMovement: m.noMovement ?? 0,
      dropped: m.dropped ?? 0,
      obMismatches: m.obMismatches ?? 0,
      total: m.totalCurrent ?? (run?._count?.results ?? 0),
      absVariance: m.totalVarianceAbs ?? 0,
    };
  }, [run]);

  const obRows = useMemo(
    () => (results.data?.items ?? []).filter((r) => r.obMismatch != null && r.obMismatch > 0).length,
    [results.data],
  );

  if (isLoading) return <Spinner label="Loading analysis" />;
  if (error || !run) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const running = run.status === 'queued' || run.status === 'running';
  const totalPages = Math.max(1, Math.ceil((results.data?.total ?? 0) / (results.data?.pageSize ?? 100)));
  const items = results.data?.items ?? [];
  const finished = run.status === 'completed';

  async function exportExcel() {
    setExportError(null);
    setExporting(true);
    try {
      const out = await api.get<{ url: string; size: number; summary: Record<string, unknown> }>(`/variance/${id}/export`);
      window.open(out.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Could not generate the export.');
    } finally {
      setExporting(false);
    }
  }

  const countOf = (k: string) => (run.statusCounts?.[k] ?? 0) as number;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <section className="flex flex-col gap-2">
        <Link href="/variance" className="inline-flex items-center gap-1 font-mono text-[10px] text-mine-400 hover:text-white transition-colors uppercase tracking-wider">
          <Icon name="chevron_right" size={14} className="rotate-180" /> P&amp;L Variance
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
                Variance {label(run.id.slice(-6))}
              </h1>
              <StatusBadge status={run.status} />
              {running ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-cyan-200 bg-cyan-950/40 border border-cyan-500/25 px-2 py-0.5 rounded-full">
                  <Icon name="progress_activity" size={12} className="animate-spin" /> {run.progress ?? 0}%
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
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-slate-500">
              {run.priorDoc ? <span>Prior · {run.priorDoc.originalName}</span> : <span>Prior · none</span>}
              {run.currentDoc ? <span>Current · {run.currentDoc.originalName}</span> : null}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => { void refetch(); void results.refetch(); }} disabled={running}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" icon="download" onClick={exportExcel} disabled={!finished} loading={exporting}>
              Export XLSX
            </Button>
          </div>
        </div>
        {exportError ? <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{exportError}</div> : null}
      </section>

      {/* Summary strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { l: 'Total Ledgers', v: metrics.total, tone: 'text-white' },
          { l: 'Detailed (>20%)', v: metrics.detailed, tone: 'text-rose-300' },
          { l: 'Quick (10–20%)', v: metrics.quick, tone: 'text-amber-300' },
          { l: 'Within (<10%)', v: metrics.within, tone: 'text-[#94bda4]' },
          { l: 'New Ledgers', v: metrics.newLedgers, tone: 'text-cyan-300' },
          { l: 'No Movement', v: metrics.noMovement, tone: 'text-slate-400' },
          { l: 'Dropped', v: metrics.dropped, tone: 'text-fuchsia-300' },
          { l: 'OB Mismatches', v: metrics.obMismatches, tone: 'text-amber-300' },
        ].map((s) => (
          <GlassCard key={s.l} className="p-3.5">
            <div className="font-caps text-[9px] text-mine-400">{s.l}</div>
            <div className={`mt-1.5 text-xl font-mono font-medium tracking-tight ${s.tone}`}>{s.v}</div>
          </GlassCard>
        ))}
      </section>

      {/* OB mismatch banner */}
      {finished && metrics.obMismatches > 0 ? (
        <GlassCard className="p-3.5 flex items-start gap-3 border border-amber-500/25">
          <span className="w-8 h-8 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
            <Icon name="warning" size={15} className="text-amber-300" />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-medium text-amber-200">{metrics.obMismatches} opening-balance mismatch{metrics.obMismatches === 1 ? '' : 'es'}</span>
            <span className="text-[11px] text-mine-400">
              Current opening balances differ from the prior closing balance beyond the tolerance. Review the OB Reconciliation tab of the export.
            </span>
          </div>
        </GlassCard>
      ) : null}

      {run.status === 'failed' ? (
        <StateBlock icon="error" title="Analysis failed" body={run.error ?? 'The engine could not complete this variance pass.'} />
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        <TabPill label="All" count={metrics.total} active={tab === 'all'} onClick={() => { setTab('all'); setPage(1); }} />
        {VAR_CATEGORIES.map((c) => (
          <TabPill key={c} label={VAR_LABELS[c].label} count={countOf(c)} active={tab === c} onClick={() => { setTab(c); setPage(1); }} />
        ))}
        <TabPill label="OB Mismatch" count={metrics.obMismatches} active={tab === 'ob'} onClick={() => { setTab('ob'); setPage(1); }} />
      </div>

      {/* Results */}
      {results.isLoading && !items.length ? <Spinner label="Loading results" /> : null}
      {!results.isLoading && results.error && !items.length ? <ErrorState message={(results.error as Error).message} onRetry={() => results.refetch()} /> : null}

      {finished && !results.isLoading && results.data && items.length === 0 ? (
        <GlassCard className="p-8 flex items-center justify-center gap-2 text-xs text-mine-400">
          <Icon name="verified" size={16} className="text-emerald-400" />
          No ledger rows in this view.
        </GlassCard>
      ) : null}

      {items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {items.map((r) => (
            <GlassCard key={r.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge tone={catTone(r.category)}>{VAR_LABELS[r.category]?.label ?? label(r.category)}</Badge>
                  <span className="text-[13px] font-medium text-white truncate">{r.particulars}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] shrink-0 flex-wrap">
                  {r.priorClosing != null ? (
                    <span className="text-mine-400">P {inr(r.priorClosing)}</span>
                  ) : null}
                  {r.currentClosing != null ? (
                    <span className="text-white">C {inr(r.currentClosing)}</span>
                  ) : null}
                  {r.variance != null ? (
                    <span className={clsx(r.variance >= 0 ? 'text-[#94bda4]' : 'text-rose-300')}>{inr(r.variance, { signed: true })}</span>
                  ) : null}
                  {r.varPct != null ? (
                    <span
                      className={clsx(
                        r.varPct >= 0 ? 'text-[#94bda4]' : 'text-rose-300',
                        r.category === 'detailed_review' && 'font-semibold',
                      )}
                    >
                      {r.varPct >= 0 ? '+' : ''}{r.varPct.toFixed(1)}%
                    </span>
                  ) : null}
                  {r.obMismatch != null && r.obMismatch > 0 ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-950/40 border border-amber-500/30 text-amber-300 text-[10px]">
                      <Icon name="warning" size={10} /> OB {inr(r.obMismatch)}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="mt-1 flex items-center gap-x-3 gap-y-0.5 font-mono text-[9px] text-mine-400 flex-wrap">
                {r.priorRecord ? <span>prior row #{r.priorRecord.rowIndex ?? '—'}</span> : <span>prior —</span>}
                {r.currentRecord ? <span>current row #{r.currentRecord.rowIndex ?? '—'}</span> : <span>current —</span>}
                {obRows > 0 && tab === 'all' ? <span className="text-amber-300">{obRows} with OB mismatch in this page</span> : null}
              </div>
            </GlassCard>
          ))}

          {/* Pager */}
          {totalPages > 1 ? (
            <GlassCard className="p-2 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Prev
              </Button>
              <span className="font-mono text-[10px] text-mine-400">
                Page {page} / {totalPages}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} icon="chevron_right">
                Next
              </Button>
            </GlassCard>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TabPill({ label, count, active, onClick, dim }: { label: string; count: number; active: boolean; onClick: () => void; dim?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider border transition-all',
        active ? 'bg-white text-slate-950 border-white' : 'text-mine-400 border-white/[0.08] hover:text-white',
        dim && 'opacity-60',
      )}
    >
      {label}
      <span className="text-slate-500">{count}</span>
    </button>
  );
}