'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { GlassCard, Spinner, ErrorState, Badge } from '@/components/ui/primitives';
import Link from 'next/link';

interface ReportItem {
  id: string;
  title: string;
  format: string;
  status: string;
  createdAt: string;
}

interface ReportsData {
  items: ReportItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<ReportsData>('/individual/reports?page=1&pageSize=50')
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading..." />;
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
        Reports
      </h1>

      <div className="flex flex-col gap-2">
        {data?.items.length === 0 ? (
          <GlassCard className="p-10 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-mine-400">
              <span className="text-2xl">📊</span>
            </div>
            <div className="text-sm font-medium text-white">No reports yet</div>
            <div className="text-xs text-mine-400 max-w-sm">
              Generate reports after completing reconciliations
            </div>
            <Link href="/individual/reconcile">
              <Badge tone="cyan" className="px-3 py-1.5 cursor-pointer hover:bg-cyan-500/20">
                Start Reconciliation
              </Badge>
            </Link>
          </GlassCard>
        ) : (
          data?.items.map((report) => (
            <div
              key={report.id}
              className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.05]"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <span className="text-[10px] font-mono text-emerald-400">{report.format.toUpperCase()}</span>
                </div>
                <div>
                  <div className="text-[13px] font-medium text-slate-200">{report.title}</div>
                  <div className="text-[11px] text-mine-400 mt-0.5">
                    {new Date(report.createdAt).toLocaleDateString('en-US')}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={report.status === 'completed' ? 'success' : 'blue'}>{report.status}</Badge>
                <Link href={`/individual/reports/${report.id}/download`}>
                  <Badge tone="dim" className="px-2 py-1 cursor-pointer hover:bg-white/10">
                    Download
                  </Badge>
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
