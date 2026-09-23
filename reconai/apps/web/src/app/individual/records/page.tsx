'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { GlassCard, Spinner, ErrorState, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/primitives';
import Link from 'next/link';

interface RecordItem {
  id: string;
  title: string;
  type: string;
  status: string;
  periodFrom?: string;
  periodTo?: string;
  _count?: { documents: number; runs: number };
}

interface RecordsData {
  items: RecordItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function RecordsPage() {
  const [data, setData] = useState<RecordsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('type', filter);
    params.set('pageSize', '50');

    setLoading(true);
    api.get<RecordsData>(`/individual/records?${params}`)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [filter]);

  const types = ['all', 'gst', 'bank', 'tds', 'variance', 'ais_26as', 'other'];

  if (loading) return <Spinner label="Loading..." />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
          Records
        </h1>
        <Link href="/individual/reconcile">
          <Button size="sm" variant="primary" icon="add">
            New Record
          </Button>
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={
              filter === t
                ? 'px-3 py-1.5 rounded-full text-xs font-medium bg-white text-slate-950 border border-white'
                : 'px-3 py-1.5 rounded-full text-xs font-medium text-mine-400 border border-white/[0.08] hover:text-white hover:border-white/20 transition-colors'
            }
          >
            {t === 'all' ? 'All' : t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Records List */}
      <div className="flex flex-col gap-2">
        {data?.items.length === 0 ? (
          <GlassCard className="p-10 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-mine-400">
              <span className="text-2xl">📁</span>
            </div>
            <div className="text-sm font-medium text-white">No records yet</div>
            <div className="text-xs text-mine-400 max-w-sm">
              Create your first record to start reconciling documents
            </div>
            <Link href="/individual/reconcile">
              <Button size="sm" variant="secondary">
                Get Started
              </Button>
            </Link>
          </GlassCard>
        ) : (
          data?.items.map((record) => (
            <Link
              key={record.id}
              href={`/individual/reconcile`}
              className="flex items-center justify-between px-4 py-4 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-mono font-bold ${
                  record.type === 'gst' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                  record.type === 'bank' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  record.type === 'tds' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                  'bg-white/5 text-mine-400 border border-white/10'
                }`}>
                  {record.type.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-[14px] font-medium text-slate-200">{record.title}</div>
                  <div className="text-[11px] text-mine-400 mt-0.5">
                    {record.periodFrom && record.periodTo
                      ? `${record.periodFrom.slice(0, 10)} — ${record.periodTo.slice(0, 10)}`
                      : record.type.toUpperCase()}
                    {record._count ? ` · ${record._count.documents} docs · ${record._count.runs} runs` : ''}
                  </div>
                </div>
              </div>
              <Badge tone={record.status === 'completed' ? 'success' : record.status === 'in_progress' ? 'cyan' : 'dim'}>
                {record.status.replace(/_/g, ' ')}
              </Badge>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
