'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Stat, GlassCard, SectionHeading, Spinner, ErrorState } from '@/components/ui/primitives';
import { Badge } from '@/components/ui/primitives';
import Link from 'next/link';

interface DashboardData {
  stats: {
    plan: string;
    dailyLimit: number;
    dailyConsumed: number;
    dailyRemaining: number;
    totalRuns: number;
    totalDocuments: number;
    totalReports: number;
  };
  recentRuns: Array<{ id: string; type: string; status: string; createdAt: string; record?: { title: string } }>;
  recentDocuments: Array<{ id: string; originalName: string; status: string; createdAt: string }>;
  pendingExceptions: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<DashboardData>('/individual/dashboard')
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading..." />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!data) return null;

  const planColors: Record<string, 'dim' | 'cyan' | 'mint'> = {
    free: 'dim',
    basic: 'cyan',
    pro: 'mint',
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
            Dashboard
          </h1>
          <p className="text-xs text-mine-400 mt-1">Welcome back to your workspace</p>
        </div>
        <Link
          href="/individual/reconcile"
          className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-medium hover:bg-cyan-500/30 transition-colors"
        >
          New Reconciliation
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Today&apos;s Jobs"
          value={`${data.stats.dailyConsumed}/${data.stats.dailyLimit}`}
          accent="cyan"
          tag={<Badge tone={planColors[data.stats.plan] ?? 'dim'}>{data.stats.plan.toUpperCase()}</Badge>}
        />
        <Stat
          label="Total Runs"
          value={data.stats.totalRuns}
          accent="none"
        />
        <Stat
          label="Documents"
          value={data.stats.totalDocuments}
          accent="none"
        />
        <Stat
          label="Reports"
          value={data.stats.totalReports}
          accent="none"
        />
      </div>

      {/* Quota Bar */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-mono uppercase tracking-wider text-mine-400">Daily Quota</span>
          <span className="text-xs text-slate-300">{data.stats.dailyRemaining} remaining</span>
        </div>
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-500"
            style={{ width: `${Math.min(100, (data.stats.dailyConsumed / data.stats.dailyLimit) * 100)}%` }}
          />
        </div>
      </GlassCard>

      {/* Recent Runs */}
      <div>
        <SectionHeading
          title="Recent Reconciliations"
          trailing={
            <Link href="/individual/reconcile" className="text-xs text-cyan-400 hover:text-cyan-300">
              View All
            </Link>
          }
        />
        <div className="mt-3 flex flex-col gap-2">
          {data.recentRuns.length === 0 ? (
            <div className="text-xs text-mine-400 py-4 text-center">No reconciliations yet</div>
          ) : (
            data.recentRuns.map((run) => (
              <Link
                key={run.id}
                href={`/individual/reconcile/${run.id}`}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <span className="text-[10px] font-mono text-cyan-400">{run.type.slice(0, 3).toUpperCase()}</span>
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-slate-200">
                      {run.record?.title ?? 'Reconciliation'}
                    </div>
                    <div className="text-[11px] text-mine-400">
                      {new Date(run.createdAt).toLocaleDateString('en-US')}
                    </div>
                  </div>
                </div>
                <Badge tone={run.status === 'completed' ? 'success' : run.status === 'running' ? 'cyan' : 'dim'}>
                  {run.status}
                </Badge>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Recent Documents */}
      <div>
        <SectionHeading
          title="Recent Documents"
          trailing={
            <Link href="/individual/documents" className="text-xs text-cyan-400 hover:text-cyan-300">
              View All
            </Link>
          }
        />
        <div className="mt-3 flex flex-col gap-2">
          {data.recentDocuments.length === 0 ? (
            <div className="text-xs text-mine-400 py-4 text-center">No documents uploaded</div>
          ) : (
            data.recentDocuments.slice(0, 5).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.05]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center">
                    <span className="text-[10px] text-mine-400">DOC</span>
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-slate-200 truncate max-w-[200px]">
                      {doc.originalName}
                    </div>
                    <div className="text-[11px] text-mine-400">
                      {new Date(doc.createdAt).toLocaleDateString('en-US')}
                    </div>
                  </div>
                </div>
                <Badge tone={doc.status === 'stored' ? 'success' : 'blue'}>{doc.status}</Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
