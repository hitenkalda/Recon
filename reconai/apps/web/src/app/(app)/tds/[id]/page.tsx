'use client';

import { useEffect, useMemo, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useTdsRun, useTdsResults, useTdsMonths, ApiError } from '@/lib/hooks';
import { api } from '@/lib/api';
import { GlassCard, Badge, Button, Spinner, ErrorState, StatusBadge, StateBlock } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { label, date as fmtDate, timeAgo, inr } from '@/lib/format';
import { clsx } from 'clsx';
import { DED_STATUS_TONE, DEP_STATUS_TONE, TDS_SECTION_LABEL } from '@/lib/tds';

const DED_KEYS = ['not_deducted', 'short_deduction', 'excess_deduction', 'below_threshold', 'compliant'];
const DED_LABELS: Record<string, string> = {
  not_deducted: 'Not Deducted',
  short_deduction: 'Short Deduction',
  excess_deduction: 'Excess Deduction',
  below_threshold: 'Below Threshold',
  compliant: 'Compliant',
};

type TabKey = 'all' | (typeof DED_KEYS)[number];

export default function TdsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<TabKey>('all');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const dedKey = tab === 'all' ? 'all' : tab;
  const { data: run, isLoading, error, refetch } = useTdsRun(id);
  const results = useTdsResults(id, { dedKey, page });
  const months = useTdsMonths(id);

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

  const s = useMemo(() => (run?.metrics?.summary ?? {}) as Record<string, number>, [run]);

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
      const out = await api.get<{ url: string; size: number; summary: Record<string, unknown> }>(`/tds/${id}/export`);
      window.open(out.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Could not generate the export.');
    } finally {
      setExporting(false);
    }
  }

  const countOf = (k: string) => (run.dedCounts?.[k] ?? 0) as number;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <section className="flex flex-col gap-2">
        <Link href="/tds" className="inline-flex items-center gap-1 font-mono text-[10px] text-mine-400 hover:text-white transition-colors uppercase tracking-wider">
          <Icon name="chevron_right" size={14} className="rotate-180" /> TDS Checklist
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
                Checklist {label(run.id.slice(-6))}
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
              {(run.ledgers ?? []).map((l) => (
                <span key={l.id}>
                  {l.name} <span className="text-mine-400">[{TDS_SECTION_LABEL[l.section] ?? l.section}]</span>
                  {l.document ? <span className="text-slate-600"> — {l.document.originalName}</span> : null}
                </span>
              ))}
              {run.payableDoc ? <span>Payable · {run.payableDoc.originalName}</span> : <span>Payable · none (no deposit tracking)</span>}
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
          { l: 'Transactions', v: s.transactionCount ?? 0, tone: 'text-white' },
          { l: 'Short Deduction', v: s.shortAmount ?? 0, money: true, tone: 'text-rose-300' },
          { l: 'Not Deducted', v: s.notDeducted ?? 0, tone: 'text-rose-300' },
          { l: 'Not Deposited', v: s.notDeposited ?? 0, tone: 'text-fuchsia-300' },
          { l: 'Short Deductions', v: s.shortDeductions ?? 0, tone: 'text-amber-300' },
          { l: 'Late / Partial', v: s.lateDeposits ?? 0, tone: 'text-amber-300' },
          { l: 'Interest Liability', v: s.interestLiability ?? 0, money: true, tone: 'text-cyan-300' },
          { l: 'Compliant', v: s.compliant ?? 0, tone: 'text-[#94bda4]' },
        ].map((x) => (
          <GlassCard key={x.l} className="p-3.5">
            <div className="font-caps text-[9px] text-mine-400">{x.l}</div>
            <div className={`mt-1.5 text-xl font-mono font-medium tracking-tight ${x.tone}`}>
              {x.money ? inr(x.v as number) : (x.v ?? 0)}
            </div>
          </GlassCard>
        ))}
      </section>

      {/* High-risk banner */}
      {finished && (s.notDeducted ?? 0) + (s.notDeposited ?? 0) > 0 ? (
        <GlassCard className="p-3.5 flex items-start gap-3 border border-rose-500/25">
          <span className="w-8 h-8 rounded-full bg-rose-500/15 border border-rose-500/40 flex items-center justify-center shrink-0">
            <Icon name="warning" size={15} className="text-rose-300" />
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-medium text-rose-200">
              {(s.notDeducted ?? 0) + (s.notDeposited ?? 0)} high-risk finding{(s.notDeducted ?? 0) + (s.notDeposited ?? 0) === 1 ? '' : 's'}
            </span>
            <span className="text-[11px] text-mine-400">
              {s.notDeducted ? `${s.notDeducted} where TDS was not deducted` : ''}{s.notDeducted && s.notDeposited ? ' · ' : ''}
              {s.notDeposited ? `${s.notDeposited} where TDS was not deposited` : ''} — these require senior review / partner approval before closure.
            </span>
          </div>
        </GlassCard>
      ) : null}

      {run.status === 'failed' ? (
        <StateBlock icon="error" title="Analysis failed" body={run.error ?? 'The engine could not complete this checklist pass.'} />
      ) : null}

      {/* Section summary */}
      {finished && (run.metrics?.sectionSummary?.length ?? 0) > 0 ? (
        <GlassCard className="p-0 overflow-hidden">
          <div className="px-4 pt-3.5 pb-1 font-caps text-[9px] text-mine-400 uppercase tracking-wider">Sections</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-mine-400 text-left border-b border-white/[0.06]">
                  <th className="px-4 py-2 font-medium">Section</th>
                  <th className="px-3 py-2 font-medium text-right">Txns</th>
                  <th className="px-3 py-2 font-medium text-right">Gross</th>
                  <th className="px-3 py-2 font-medium text-right">TDS Req.</th>
                  <th className="px-3 py-2 font-medium text-right">TDS Ded.</th>
                  <th className="px-3 py-2 font-medium text-right">Short</th>
                  <th className="px-3 py-2 font-medium text-right">Interest</th>
                  <th className="px-4 py-2 font-medium text-right">Issues</th>
                </tr>
              </thead>
              <tbody>
                {(run.metrics?.sectionSummary ?? []).map((row) => (
                  <tr key={String(row.section)} className="border-b border-white/[0.04]">
                    <td className="px-4 py-2 text-white">{String(row.section)}</td>
                    <td className="px-3 py-2 text-right text-mine-400">{String(row.count ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{inr(Number(row.gross ?? 0))}</td>
                    <td className="px-3 py-2 text-right">{inr(Number(row.req ?? 0))}</td>
                    <td className="px-3 py-2 text-right">{inr(Number(row.ded ?? 0))}</td>
                    <td className={clsx('px-3 py-2 text-right', Number(row.short ?? 0) > 0 ? 'text-rose-300' : '')}>{inr(Number(row.short ?? 0))}</td>
                    <td className="px-3 py-2 text-right text-cyan-300">{inr(Number(row.interest ?? 0))}</td>
                    <td className={clsx('px-4 py-2 text-right', Number(row.issues ?? 0) > 0 ? 'text-amber-300' : '')}>{String(row.issues ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      ) : null}

      {/* Month-wise payment reconciliation */}
      {finished && (months.data?.monthRecon?.length ?? 0) > 0 ? (
        <GlassCard className="p-0 overflow-hidden">
          <div className="px-4 pt-3.5 pb-1 flex items-center justify-between">
            <span className="font-caps text-[9px] text-mine-400 uppercase tracking-wider">Payment Reconciliation</span>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-cyan-200">
              <Icon name="verified" size={12} />
              final balance {inr(Number(months.data?.monthReconMeta?.finalBalance ?? 0))}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono">
              <thead>
                <tr className="text-mine-400 text-left border-b border-white/[0.06]">
                  <th className="px-4 py-2 font-medium">Month</th>
                  <th className="px-3 py-2 font-medium text-right">Opening</th>
                  <th className="px-3 py-2 font-medium text-right">Deducted</th>
                  <th className="px-3 py-2 font-medium text-right">Liability</th>
                  <th className="px-3 py-2 font-medium text-right">Paid</th>
                  <th className="px-3 py-2 font-medium text-right">Closing</th>
                  <th className="px-3 py-2 font-medium text-right">Days Late</th>
                  <th className="px-3 py-2 font-medium text-right">Interest</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(months.data?.monthRecon ?? []).map((m) => (
                  <tr key={String(m.month)} className="border-b border-white/[0.04]">
                    <td className="px-4 py-2 text-white">{String(m.monthLabel)}</td>
                    <td className="px-3 py-2 text-right">{inr(Number(m.opening ?? 0))}</td>
                    <td className="px-3 py-2 text-right">{inr(Number(m.deducted ?? 0))}</td>
                    <td className="px-3 py-2 text-right">{inr(Number(m.liability ?? 0))}</td>
                    <td className="px-3 py-2 text-right">{inr(Number(m.paid ?? 0))}</td>
                    <td className={clsx('px-3 py-2 text-right', Number(m.closing ?? 0) > 0 ? 'text-amber-300' : 'text-[#94bda4]')}>{inr(Number(m.closing ?? 0))}</td>
                    <td className="px-3 py-2 text-right">{Number(m.daysLate ?? 0) > 0 ? <span className="text-amber-300">{String(m.daysLate)}</span> : '—'}</td>
                    <td className="px-3 py-2 text-right">{Number(m.interest ?? 0) > 0 ? <span className="text-cyan-300">{inr(Number(m.interest))}</span> : '—'}</td>
                    <td className={clsx('px-4 py-2', String(m.status ?? '').startsWith('LATE') ? 'text-rose-300' : 'text-mine-300')}>{String(m.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        <TabPill label="All" count={run._count?.results ?? 0} active={tab === 'all'} onClick={() => { setTab('all'); setPage(1); }} />
        {DED_KEYS.map((k) => (
          <TabPill key={k} label={DED_LABELS[k]} count={countOf(k)} active={tab === k} onClick={() => { setTab(k); setPage(1); }} />
        ))}
      </div>

      {/* Results */}
      {results.isLoading && !items.length ? <Spinner label="Loading findings" /> : null}
      {!results.isLoading && results.error && !items.length ? <ErrorState message={(results.error as Error).message} onRetry={() => results.refetch()} /> : null}

      {finished && !results.isLoading && results.data && items.length === 0 ? (
        <GlassCard className="p-8 flex items-center justify-center gap-2 text-xs text-mine-400">
          <Icon name="verified" size={16} className="text-emerald-400" />
          No transaction rows in this view.
        </GlassCard>
      ) : null}

      {items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {items.map((r) => (
            <GlassCard key={r.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge tone={DED_STATUS_TONE[r.dedKey] ?? 'dim'}>{r.dedStatus}</Badge>
                  <span className="text-[13px] font-medium text-white truncate">{r.party}</span>
                  <span className="text-[10px] font-mono text-mine-400 hidden sm:inline">{r.ledger?.name ?? r.section}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] shrink-0 flex-wrap">
                  <span className="text-mine-400">{r.date ? fmtDate(r.date) : '—'}</span>
                  <span className="text-[10px] text-mine-400">Gross {inr(r.gross)}</span>
                  <span className="text-[10px] text-mine-400">Rate {r.rate}%</span>
                  <span className="text-white">Req {inr(r.tdsReq)}</span>
                  <span className={clsx(r.diff < -1 ? 'text-rose-300' : r.diff > 1 ? 'text-cyan-300' : 'text-[#94bda4]')}>
                    Ded {inr(r.tdsDed)}
                  </span>
                </div>
              </div>
              <div className="mt-1 flex items-center gap-x-3 gap-y-0.5 font-mono text-[9px] text-mine-400 flex-wrap">
                <span className="text-slate-500">{r.remark ?? ''}</span>
                {r.depStatus !== 'NO DEPOSIT DATA' ? (
                  <Badge tone={DEP_STATUS_TONE[r.depStatus] ?? 'dim'}>{r.depStatus}</Badge>
                ) : null}
                {r.depAmt > 0 ? <span>deposited {inr(r.depAmt)}</span> : null}
                {r.interest > 0 ? <span className="text-cyan-300">+ interest {inr(r.interest)}</span> : null}
                {r.sourceRecord ? <span>row #{r.sourceRecord.rowIndex ?? '—'}</span> : null}
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

function TabPill({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider border transition-all',
        active ? 'bg-white text-slate-950 border-white' : 'text-mine-400 border-white/[0.08] hover:text-white',
      )}
    >
      {label}
      <span className="text-slate-500">{count}</span>
    </button>
  );
}