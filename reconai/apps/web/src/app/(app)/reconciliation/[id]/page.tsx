'use client';

import { useEffect, useMemo, useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useRun, ApiError } from '@/lib/hooks';
import type { TaxMetrics } from '@/lib/hooks';
import { api } from '@/lib/api';
import { GlassCard, Badge, Button, Spinner, ErrorState, StatusBadge } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo, date as fmtDate, inr } from '@/lib/format';
import { clsx } from 'clsx';

const MATCHED = new Set([
  'exact_invoice',
  'gstin_pan',
  'amount',
  'date_tolerance',
  'fuzzy_invoice',
  'vendor_similarity',
  'amount_tolerance',
  'ai_assisted',
  'manual',
]);

type TabKey = 'all' | 'matched' | 'unmatched' | 'pending';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'matched', label: 'Matched' },
  { key: 'unmatched', label: 'Unmatched' },
  { key: 'pending', label: 'Pending' },
];

/** Phase-8 26AS/AIS views. Each maps to a (status, side, matched, highRisk) filter. */
type AisTabKey =
  | 'overview' | 'matched' | 'missing_books' | 'missing_26as'
  | 'income' | 'section' | 'duplicates' | 'high_risk';
const AIS_TABS: { key: AisTabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'matched', label: 'Matched' },
  { key: 'missing_books', label: 'Missing in books' },
  { key: 'missing_26as', label: 'Missing in 26AS' },
  { key: 'income', label: 'Income mismatch' },
  { key: 'section', label: 'Section mismatch' },
  { key: 'duplicates', label: 'Duplicates' },
  { key: 'high_risk', label: 'High risk' },
];

const FIELD_LABELS: Record<string, string> = {
  date: 'Date',
  invoice: 'Invoice',
  vendor: 'Vendor',
  gstin: 'GSTIN',
  pan: 'PAN',
  amount: 'Amount',
  narration: 'Narration',
  cheque: 'Cheque',
  utr: 'UTR',
  bank: 'Bank',
  balance: 'Balance',
  name: 'Deductor',
  tan: 'TAN',
  section: 'Section',
  quarter: 'Quarter',
  fy: 'FY',
  gross: 'Gross',
  tds: 'TDS',
};

/** AIS views show the tax-relevant normalized columns first. */
const AIS_FIELDS = ['name', 'tan', 'section', 'quarter', 'fy', 'gross', 'tds'];
const GEN_FIELDS = ['date', 'invoice', 'vendor', 'gstin', 'pan', 'narration', 'cheque', 'utr'];

function matchTone(matchStatus: string): 'mint' | 'danger' | 'warning' | 'cyan' | 'dim' {
  if (matchStatus === 'unmatched') return 'danger';
  if (matchStatus === 'pending') return 'warning';
  if (matchStatus === 'manual') return 'cyan';
  if (matchStatus === 'income_mismatch' || matchStatus === 'section_mismatch') return 'warning';
  if (matchStatus === 'duplicate') return 'cyan';
  if (MATCHED.has(matchStatus)) return 'mint';
  return 'dim';
}

function statusGroups(run: { statusCounts?: Record<string, number> }) {
  const sc = run.statusCounts ?? {};
  let matched = 0;
  for (const [k, v] of Object.entries(sc)) if (MATCHED.has(k)) matched += v;
  return {
    matched,
    unmatched: sc.unmatched ?? 0,
    pending: sc.pending ?? 0,
    total: (sc.unmatched ?? 0) + (sc.pending ?? 0) + matched,
  };
}

const money = (v: unknown) => (typeof v === 'number' ? inr(v) : '—');

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<TabKey | AisTabKey>('all');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const viewFilter = (t: string): { status?: string; side?: string; matched?: boolean; highRisk?: boolean } => {
    switch (t) {
      case 'overview': return {};
      case 'matched': return { matched: true };
      case 'unmatched': return { status: 'unmatched' };
      case 'pending': return { status: 'pending' };
      case 'missing_books': return { status: 'unmatched', side: 'only_a' };
      case 'missing_26as': return { status: 'unmatched', side: 'only_b' };
      case 'income': return { status: 'income_mismatch' };
      case 'section': return { status: 'section_mismatch' };
      case 'duplicates': return { status: 'duplicate' };
      case 'high_risk': return { highRisk: true };
      default: return {};
    }
  };

  const { data: run, isLoading, error, refetch } = useRun(id, { ...viewFilter(tab), page });

  // Rules of Hooks: every hook must run before any early return. Compute these
  // null-safely so loading/error renders call exactly the same hooks as loaded ones.
  const groups = useMemo(() => (run ? statusGroups(run) : { matched: 0, unmatched: 0, pending: 0, total: 0 }), [run]);
  const tax = run?.metrics?.tax;
  const isAis = run?.type === 'ais_26as';
  const view = isAis && tab === 'all' ? 'overview' : tab; // normalize initial generic 'all' to AIS overview

  // Poll while the run is queued/running.
  useEffect(() => {
    if (!run) return;
    if (run.status === 'queued' || run.status === 'running') {
      const t = setInterval(() => void refetch(), 4000);
      return () => clearInterval(t);
    }
  }, [run, refetch]);

  if (isLoading) return <Spinner label="Loading run" />;
  if (error || !run) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const running = run.status === 'queued' || run.status === 'running';
  const finished = run.status === 'completed';
  const pageSize = run.pageSize ?? 50;
  const totalPages = Math.max(1, Math.ceil((run.itemTotal ?? 0) / pageSize));
  const items = run.items ?? [];

  async function exportExcel() {
    setExportError(null);
    setExporting(true);
    try {
      const out = await api.get<{ url: string; size: number; summary: Record<string, unknown> }>(`/reconciliations/${id}/export`);
      window.open(out.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : 'Could not generate the export.');
    } finally {
      setExporting(false);
    }
  }

  const srcNames = isAis
    ? { A: run.aisSource?.originalName ?? run.sourceA?.originalName, B: run.sourceB?.originalName }
    : { A: run.sourceA?.originalName, B: run.sourceB?.originalName };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <section className="flex flex-col gap-2">
        <Link href="/reconciliation" className="inline-flex items-center gap-1 font-mono text-[10px] text-mine-400 hover:text-white transition-colors uppercase tracking-wider">
          <Icon name="chevron_right" size={14} className="rotate-180" /> Reconciliation
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
                {label(run.type)}
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
              {run.sourceA ? <span>Source A · {run.sourceA.originalName}</span> : null}
              {run.sourceB ? <span>Source B · {run.sourceB.originalName}</span> : null}
              {run.aisSource ? <span>AIS/26AS · {run.aisSource.originalName}</span> : null}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => void refetch()} disabled={running}>
              Refresh
            </Button>
            {isAis && finished ? (
              <Button variant="secondary" size="sm" icon="download" onClick={exportExcel} loading={exporting}>
                Export XLSX
              </Button>
            ) : null}
            <Link href={`/reports?run=${run.id}`} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-medium text-white bg-white/[0.05] border border-white/10 hover:bg-white/[0.09] transition-colors">
              <Icon name="description" size={14} className="text-cyan-300" /> Report
            </Link>
          </div>
        </div>
        {exportError ? <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{exportError}</div> : null}
      </section>

      {!isAis ? <GenericSummary groups={groups} /> : null}

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {(isAis ? AIS_TABS : TABS).map((t) => {
          const key = t.key as string;
          const count = isAis
            ? key === 'overview' ? (tax?.pairs ?? 0)
              : key === 'matched' ? (tax?.matched?.count ?? 0)
              : key === 'missing_books' ? (tax?.missingInBooks?.count ?? 0)
              : key === 'missing_26as' ? (tax?.missingIn26AS?.count ?? 0)
              : key === 'income' ? (tax?.incomeMismatch?.count ?? 0)
              : key === 'section' ? (tax?.sectionMismatch?.count ?? 0)
              : key === 'duplicates' ? (tax?.duplicates?.count ?? 0)
              : (tax?.highRisk?.count ?? 0)
            : t.key === 'all' ? groups.total
            : groups[t.key as Exclude<TabKey, 'all'>];
          const active = view === t.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setPage(1);
              }}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider border transition-all',
                active ? 'bg-white text-slate-950 border-white' : 'text-mine-400 border-white/[0.08] hover:text-white',
              )}
            >
              {t.label}
              <span className="text-slate-500">{count}</span>
            </button>
          );
        })}
      </div>

      {/* AIS overview renders metric cards + summaries instead of the item feed. */}
      {isAis && view === 'overview' ? (
        tax ? (
          <AisSummaries run={run} tax={tax} />
        ) : (
          <GlassCard className="p-8 flex items-center justify-center text-xs text-mine-400">No AIS metrics for this run.</GlassCard>
        )
      ) : (
        items.length === 0 ? (
          <GlassCard className="p-8 flex items-center justify-center gap-2 text-xs text-mine-400">
            <Icon name={running ? 'progress_activity' : 'verified'} size={16} className={running ? 'animate-spin text-cyan-300' : 'text-emerald-400'} />
            {running ? 'Engine is still computing items…' : 'No items in this view.'}
          </GlassCard>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <RunItemCard key={item.id} item={item} isAis={isAis} sourceA={srcNames.A} sourceB={srcNames.B} />
            ))}

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
        )
      )}
    </div>
  );
}

/* ── generic (GST / bank) summary strip ───────────────────────────────── */

function GenericSummary({ groups }: { groups: { matched: number; unmatched: number; pending: number; total: number } }) {
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {[
        { l: 'Total Items', v: groups.total, tone: 'text-white' },
        { l: 'Matched', v: groups.matched, tone: 'text-[#94bda4]' },
        { l: 'Unmatched', v: groups.unmatched, tone: 'text-rose-300' },
        { l: 'Pending', v: groups.pending, tone: 'text-amber-300' },
      ].map((s) => (
        <GlassCard key={s.l} className="p-3.5">
          <div className="font-caps text-[9px] text-mine-400">{s.l}</div>
          <div className={`mt-1.5 text-xl font-mono font-medium tracking-tight ${s.tone}`}>{s.v}</div>
        </GlassCard>
      ))}
    </section>
  );
}

/* ── 26AS/AIS overview: tax metric cards ─────────────────────────────── */

function AisSummaries({ run, tax }: { run: { metrics?: Record<string, unknown> & { totalA?: number; totalB?: number; sectionSummary?: Array<Record<string, unknown>>; deductorSummary?: Array<Record<string, unknown>> } }; tax: TaxMetrics }) {
  const totalA = (run.metrics?.totalA ?? null) as number | null;
  const totalB = (run.metrics?.totalB ?? null) as number | null;
  const cards = [
    { l: '26AS records', v: totalA ?? tax.matched.count + tax.missingInBooks.count, tone: 'text-white' },
    { l: 'Books records', v: totalB ?? tax.matched.count + tax.missingIn26AS.count, tone: 'text-white' },
    { l: 'Matched pairs', v: tax.pairs, tone: 'text-[#94bda4]' },
    { l: 'Match rate', v: `${tax.matchRate}%`, tone: 'text-cyan-300' },
  ];
  const detailCards = [
    { l: 'Net TDS diff', v: `${tax.netDiff >= 0 ? '+' : ''}${inr(tax.netDiff)}`, tone: tax.netDiff === 0 ? 'text-[#94bda4]' : 'text-amber-300' },
    { l: 'Tax credit at risk', v: money(tax.taxCreditLoss), tone: 'text-rose-300' },
    { l: 'Missing in 26AS', v: `${tax.missingIn26AS.count} · ${money(tax.missingIn26AS.tds)}`, tone: 'text-fuchsia-300' },
    { l: 'Income mismatch', v: `${tax.incomeMismatch.count} · ${money(tax.incomeMismatch.tds)}`, tone: 'text-amber-300' },
    { l: 'Amount diff', v: `${tax.amountDiff.count} · ${money(tax.amountDiff.tds)}`, tone: 'text-amber-300' },
    { l: 'Section mismatch', v: `${tax.sectionMismatch.count} · ${money(tax.sectionMismatch.tds)}`, tone: 'text-cyan-300' },
    { l: 'Duplicates', v: `${tax.duplicates.count} · ${money(tax.duplicates.tds)}`, tone: 'text-cyan-300' },
    { l: 'High risk', v: `${tax.highRisk.count} · ${money(tax.highRisk.tds)}`, tone: 'text-rose-300' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {cards.map((s) => (
          <GlassCard key={s.l as string} className="p-3.5">
            <div className="font-caps text-[9px] text-mine-400">{s.l}</div>
            <div className={`mt-1.5 text-xl font-mono font-medium tracking-tight ${s.tone}`}>{s.v}</div>
          </GlassCard>
        ))}
      </section>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {detailCards.map((s) => (
          <GlassCard key={s.l as string} className="p-3.5">
            <div className="font-caps text-[9px] text-mine-400">{s.l}</div>
            <div className={`mt-1.5 text-sm font-mono font-medium tracking-tight ${s.tone}`}>{s.v}</div>
          </GlassCard>
        ))}
      </section>

      {(run.metrics?.sectionSummary?.length ?? 0) > 0 ? (
        <GlassCard className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02] font-caps text-[9px] text-mine-400 tracking-widest">Section Summary</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="text-[9px] uppercase tracking-wider text-mine-400">
                <tr className="border-b border-white/[0.06]">
                  <th className="px-3 py-2">Section</th>
                  <th className="px-3 py-2 text-right">Count</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">TDS</th>
                  <th className="px-3 py-2 text-right">Matched</th>
                  <th className="px-3 py-2 text-right">Miss Books</th>
                  <th className="px-3 py-2 text-right">Miss 26AS</th>
                </tr>
              </thead>
              <tbody>
                {(run.metrics?.sectionSummary ?? []).map((s) => (
                  <tr key={(s.section as string) ?? '-'} className="border-b border-white/[0.04]">
                    <td className="px-3 py-1.5 text-white">{String(s.section ?? '-')}</td>
                    <td className="px-3 py-1.5 text-right">{String(s.count ?? 0)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-300">{money(s.gross)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-300">{money(s.tds)}</td>
                    <td className="px-3 py-1.5 text-right">{String(s.matched ?? 0)}</td>
                    <td className="px-3 py-1.5 text-right text-rose-300">{String(s.missingInBooks ?? 0)}</td>
                    <td className="px-3 py-1.5 text-right text-fuchsia-300">{String(s.missingIn26AS ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      ) : null}

      {(run.metrics?.deductorSummary?.length ?? 0) > 0 ? (
        <GlassCard className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02] font-caps text-[9px] text-mine-400 tracking-widest">Deductor Summary (top 20)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="text-[9px] uppercase tracking-wider text-mine-400">
                <tr className="border-b border-white/[0.06]">
                  <th className="px-3 py-2">Deductor</th>
                  <th className="px-3 py-2">PAN</th>
                  <th className="px-3 py-2">TAN</th>
                  <th className="px-3 py-2 text-right">TDS</th>
                  <th className="px-3 py-2 text-right">Matched</th>
                  <th className="px-3 py-2 text-right">Missing</th>
                </tr>
              </thead>
              <tbody>
                {(run.metrics?.deductorSummary ?? []).map((d) => (
                  <tr key={(d.deductor as string) ?? '-'} className="border-b border-white/[0.04]">
                    <td className="px-3 py-1.5 text-white">{String(d.deductor ?? '-')}</td>
                    <td className="px-3 py-1.5">{String(d.pan ?? '—')}</td>
                    <td className="px-3 py-1.5">{String(d.tan ?? '—')}</td>
                    <td className="px-3 py-1.5 text-right text-slate-300">{money(d.tds)}</td>
                    <td className="px-3 py-1.5 text-right">{String(d.matched ?? 0)}</td>
                    <td className="px-3 py-1.5 text-right text-rose-300">{String(d.missing ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      ) : null}
    </div>
  );
}

/* ── one match row: A | verdict | B ──────────────────────────────────── */

function RunItemCard({
  item,
  isAis,
  sourceA,
  sourceB,
}: {
  item: ImportedReconItem;
  isAis: boolean;
  sourceA?: string;
  sourceB?: string;
}) {
  const aAmt = item.amountPaiseA != null ? item.amountPaiseA / 100 : null;
  const bAmt = item.amountPaiseB != null ? item.amountPaiseB / 100 : null;
  const variance = item.variancePaise != null ? item.variancePaise / 100 : null;
  const matched = MATCHED.has(item.matchStatus);

  return (
    <GlassCard className="overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={matchTone(item.matchStatus)}>{label(item.matchStatus)}</Badge>
          {item.matchedBy ? (
            <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-mine-400">
              <Icon name="hub" size={11} /> {label(item.matchedBy)}
            </span>
          ) : null}
          {typeof item.score === 'number' ? (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400">
              <Icon name="verified" size={11} className="text-cyan-300" /> {item.score.toFixed(2)}
            </span>
          ) : null}
          {variance != null && matched && Math.abs(variance) > 0.001 ? (
            <span className="font-mono text-[10px] text-amber-300">
              variance {inr(variance, { signed: true })}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {matched ? (
            <span className="w-6 h-6 rounded-full bg-[#94bda4]/15 border border-[#94bda4]/40 flex items-center justify-center">
              <Icon name="check" size={13} className="text-[#94bda4]" />
            </span>
          ) : (
            <span className="w-6 h-6 rounded-full bg-rose-500/15 border border-rose-500/40 flex items-center justify-center">
              <Icon name="warning" size={12} className="text-rose-300" />
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
        <RecordSide label={isAis ? '26AS' : 'Side A'} source={sourceA} record={item.recordA} amount={aAmt} isAis={isAis} placeholder={!item.recordB ? 'No books entry — 26AS credit may be unbooked' : undefined} />
        <RecordSide label={isAis ? 'Books' : 'Side B'} source={sourceB} record={item.recordB} amount={bAmt} isAis={isAis} placeholder={!item.recordA ? 'Not in 26AS — verify deductor filed' : undefined} />
      </div>
    </GlassCard>
  );
}

function RecordSide({
  label,
  source,
  record,
  amount,
  isAis,
  placeholder,
}: {
  label: string;
  source?: string;
  record?: { data: Record<string, unknown> } | null;
  amount: number | null;
  isAis: boolean;
  placeholder?: string;
}) {
  const data = record?.data ?? {};
  const keys = Object.keys(data);
  const shown = (isAis ? AIS_FIELDS : GEN_FIELDS).filter((k) => data[k] != null && data[k] !== '');
  return (
    <div className="p-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-caps text-[9px] text-mine-400 tracking-widest">{label}</span>
        <span className="font-mono text-[9px] text-mine-400 truncate max-w-[50%]">{source ?? '—'}</span>
      </div>
      {placeholder && !record ? (
        <div className="rounded-lg border border-dashed border-rose-500/30 bg-rose-950/10 px-3 py-2.5 text-[11px] text-rose-300">{placeholder}</div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="text-base font-mono font-medium text-white tracking-tight">{inr(amount)}</div>
          {shown.length ? (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-slate-400">
              {shown.map((k) => (
                <span key={k}>
                  <span className="text-slate-500">{FIELD_LABELS[k] ?? k}: </span>
                  {k === 'date' ? fmtDate(String(data[k])) : String(data[k])}
                </span>
              ))}
            </div>
          ) : keys.length ? (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-slate-400">
              {keys.slice(0, 5).map((k) => (
                <span key={k}><span className="text-slate-500">{FIELD_LABELS[k] ?? k}: </span>{String(data[k])}</span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-[10px] text-mine-400">No normalized data</span>
          )}
        </div>
      )}
    </div>
  );
}

type ImportedReconItem = import('@/lib/hooks').ReconItem;