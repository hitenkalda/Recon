'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useExceptions } from '@/lib/hooks';
import { GlassCard, Badge, Button, Spinner, ErrorState, StateBlock, StatusBadge } from '@/components/ui/primitives';
import { SearchInput } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo } from '@/lib/format';
import { clsx } from 'clsx';

const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low'];
const STATUSES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_review', label: 'In review' },
  { key: 'resolved', label: 'Resolved' },
];

function severityTone(severity: string): 'critical' | 'danger' | 'warning' | 'default' {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  return 'default';
}

function Exceptions() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const engagementId = searchParams.get('engagementId') ?? undefined;
  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(false);

  const query = useMemo(
    () => ({
      severity: severity === 'all' ? undefined : severity,
      status: status === 'all' ? undefined : status,
      engagementId,
      assignedToMe: mine || undefined,
    }),
    [severity, status, engagementId, mine],
  );
  const { data, isLoading, error, refetch } = useExceptions(query);

  const items = (data?.items ?? []).filter((e) =>
    search && !e.title.toLowerCase().includes(search.toLowerCase()) && !(e.client?.name ?? '').toLowerCase().includes(search.toLowerCase()) ? false : true,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
            Exception Queue
          </h1>
          <p className="text-xs text-mine-400 mt-1">{data?.total ?? 0} review cases · P10 risk engine</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setMine(!mine)}
            className={clsx(
              'px-3 py-2 rounded-full font-mono text-[11px] uppercase tracking-wider border transition-all',
              mine ? 'bg-cyan-400/15 text-cyan-200 border-cyan-400/40' : 'text-mine-400 border-white/[0.08] hover:text-white',
            )}
          >
            Mine
          </button>
          <Button variant="secondary" size="sm" icon="filter_list" onClick={() => void refetch()}>Refresh</Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search exceptions, clients…" />
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {SEVERITIES.map((s) => (
              <button
                key={s}
                onClick={() => setSeverity(s)}
                className={clsx(
                  'px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider border transition-all',
                  severity === s ? 'bg-white text-slate-950 border-white' : 'text-mine-400 border-white/[0.08] hover:text-white',
                )}
              >
                {s === 'all' ? 'Any Level' : label(s)}
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

      {isLoading ? <Spinner label="Loading exceptions" /> : null}
      {!isLoading && error ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> : null}

      {!isLoading && !error && items.length === 0 ? (
        <StateBlock
          icon="verified"
          title="No exceptions in this view"
          body="Adjust the filters or new reconciliation passes will raise cases here automatically."
        />
      ) : null}

      {!isLoading && !error && items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {items.map((e) => (
            <GlassCard key={e.id} interactive className="p-4 flex items-center justify-between gap-3" onClick={() => router.push(`/exceptions/${e.id}`)}>
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone={severityTone(e.severity)}>{e.severity}</Badge>
                  <StatusBadge status={e.status} />
                  <Badge tone="dim">{label(e.kind)}</Badge>
                </div>
                <span className="text-sm font-medium text-white truncate">{e.title}</span>
                <div className="flex items-center gap-2 font-mono text-[10px] text-mine-400 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Icon name="corporate_fare" size={12} />{e.client?.name ?? '—'}</span>
                  <span>·</span>
                  <span>{e.engagement?.title ?? '—'}</span>
                  {e.assignee ? (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 text-cyan-300"><Icon name="person" size={12} />{e.assignee.name}</span>
                    </>
                  ) : null}
                  <span>·</span>
                  <span>{timeAgo(e.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                {e._count?.comments ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500">
                    <Icon name="attach_file" size={12} /> {e._count.comments}
                  </span>
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

export default function ExceptionsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading exceptions" />}>
      <Exceptions />
    </Suspense>
  );
}