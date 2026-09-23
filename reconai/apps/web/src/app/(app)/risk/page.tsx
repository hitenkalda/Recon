'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useRiskRuns } from '@/lib/hooks';
import { GlassCard, Badge, Button, Spinner, ErrorState, StateBlock, StatusBadge } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo } from '@/lib/format';
import { clsx } from 'clsx';

const TYPES = ['all', 'transaction', 'invoice', 'expense'];
const STATUSES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'queued', label: 'Queued' },
  { key: 'running', label: 'Running' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
];

function typeTone(type: string): 'cyan' | 'mint' | 'blue' | 'default' {
  if (type === 'transaction') return 'cyan';
  if (type === 'invoice') return 'mint';
  if (type === 'expense') return 'blue';
  return 'default';
}

function Risk() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const engagementId = searchParams.get('engagementId') ?? undefined;
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');

  const query = useMemo(
    () => ({
      engagementId,
      type: type === 'all' ? undefined : type,
      status: status === 'all' ? undefined : status,
    }),
    [engagementId, type, status],
  );
  const { data, isLoading, error, refetch } = useRiskRuns(query);

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
            Risk & Verification Engine
          </h1>
          <p className="text-xs text-mine-400 mt-1">{data?.total ?? 0} analysis runs · Phase 10 risk engine</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" icon="refresh" onClick={() => void refetch()}>Refresh</Button>
          <Button size="sm" icon="analytics" onClick={() => router.push('/risk/analyze')}>
            Run Analysis
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={clsx(
                  'px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider border transition-all',
                  type === t ? 'bg-white text-slate-950 border-white' : 'text-mine-400 border-white/[0.08] hover:text-white',
                )}
              >
                {t === 'all' ? 'All Types' : label(t)}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {STATUSES.map((st) => (
              <button
                key={st.key}
                onClick={() => setStatus(st.key)}
                className={clsx(
                  'px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider border transition-all',
                  status === st.key ? 'bg-white text-slate-950 border-white' : 'text-mine-400 border-white/[0.08] hover:text-white',
                )}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? <Spinner label="Loading analysis runs" /> : null}
      {!isLoading && error ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> : null}

      {!isLoading && !error && items.length === 0 ? (
        <StateBlock
          icon="analytics"
          title="No risk analyses yet"
          body="Run your first analysis against transactions, invoices, or expenses to surface anomalies."
          action={
            <Button size="sm" icon="analytics" onClick={() => router.push('/risk/analyze')}>
              Run Analysis
            </Button>
          }
        />
      ) : null}

      {!isLoading && !error && items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {items.map((run) => (
            <GlassCard key={run.id} interactive className="p-4 flex items-center justify-between gap-3" onClick={() => router.push(`/risk/${run.id}`)}>
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={typeTone(run.type)}>{label(run.type)}</Badge>
                  <StatusBadge status={run.status} />
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] text-mine-400 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Icon name="corporate_fare" size={12} />{run.client?.name ?? '—'}</span>
                  <span>·</span>
                  <span>{run.engagement?.title ?? '—'}</span>
                  <span>·</span>
                  <span>{timeAgo(run.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {run.metrics ? (
                  <div className="flex items-center gap-3 font-mono text-[10px]">
                    <span className="text-slate-400">{run.metrics.total} items</span>
                    {run.metrics.highRisk > 0 ? (
                      <span className="inline-flex items-center gap-1 text-rose-300">
                        <Icon name="warning" size={11} /> {run.metrics.highRisk}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <Icon name="chevron_right" size={18} className="text-mine-400" />
              </div>
            </GlassCard>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function RiskPage() {
  return (
    <Suspense fallback={<Spinner label="Loading analysis runs" />}>
      <Risk />
    </Suspense>
  );
}
