'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRunRiskAnalysis, useEngagements, useDocuments } from '@/lib/hooks';
import { GlassCard, Button } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { Field, Select, Input } from '@/components/ui/fields';
import { label } from '@/lib/format';
import { clsx } from 'clsx';
import { ApiError } from '@/lib/api';

const ANALYSIS_TYPES = ['transaction', 'invoice', 'expense'] as const;

export default function AnalyzePage() {
  const router = useRouter();
  const runMutation = useRunRiskAnalysis();
  const { data: engData, isLoading: engLoading } = useEngagements();
  const [engagementId, setEngagementId] = useState('');
  const [type, setType] = useState<string>('transaction');
  const [thresholds, setThresholds] = useState({ minAmount: '', maxAmount: '' });

  useDocuments(engagementId ? { engagementId } : undefined);

  const selectedEngagement = useMemo(
    () => (engData?.items ?? []).find((e) => e.id === engagementId),
    [engData, engagementId],
  );

  const clientId = selectedEngagement?.clientId ?? '';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!engagementId || !clientId) return;

    const config: Record<string, unknown> = {};
    if (thresholds.minAmount) config.minAmount = Number(thresholds.minAmount);
    if (thresholds.maxAmount) config.maxAmount = Number(thresholds.maxAmount);

    runMutation.mutate(
      { engagementId, clientId, type, config },
      {
        onSuccess: (data) => {
          router.push(`/risk/${data.id}`);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <Link href="/risk" className="inline-flex items-center gap-1 font-mono text-[10px] text-mine-400 hover:text-white transition-colors uppercase tracking-wider">
          <Icon name="chevron_right" size={14} className="rotate-180" /> Risk & Verification
        </Link>
        <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
          Run Risk Analysis
        </h1>
        <p className="text-xs text-mine-400">Configure and launch a new risk analysis run</p>
      </section>

      {runMutation.isError ? (
        <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">
          {runMutation.error instanceof ApiError ? runMutation.error.message : 'Analysis failed. Please try again.'}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-2xl">
        <GlassCard className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="settings" size={16} className="text-cyan-300" />
            <span className="font-caps text-[10px] text-mine-400 tracking-widest">Configuration</span>
          </div>

          <Field label="Engagement" required>
            <Select value={engagementId} onChange={(e) => setEngagementId(e.target.value)} disabled={engLoading}>
              <option value="">Select engagement…</option>
              {(engData?.items ?? []).map((eng) => (
                <option key={eng.id} value={eng.id}>{eng.title}</option>
              ))}
            </Select>
          </Field>

          {engagementId && selectedEngagement?.client ? (
            <Field label="Client">
              <div className="rounded-lg text-white text-[13px] px-3.5 py-2.5 border border-white/[0.08] bg-[rgba(15,18,22,0.7)] text-slate-300">
                {selectedEngagement.client.name}
              </div>
            </Field>
          ) : null}

          <Field label="Analysis Type" required>
            <div className="flex gap-2">
              {ANALYSIS_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={clsx(
                    'flex-1 px-3 py-2.5 rounded-lg font-mono text-[11px] uppercase tracking-wider border transition-all',
                    type === t
                      ? 'bg-white text-slate-950 border-white'
                      : 'text-mine-400 border-white/[0.08] hover:text-white hover:border-white/20',
                  )}
                >
                  <Icon name={t === 'transaction' ? 'sync_alt' : t === 'invoice' ? 'receipt_long' : 'account_balance_wallet'} size={14} className="inline mr-1.5" />
                  {label(t)}
                </button>
              ))}
            </div>
          </Field>

          <div className="flex flex-col gap-2 mt-1">
            <span className="font-caps text-[10px] text-mine-400 tracking-widest">Thresholds (optional)</span>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Min Amount (₹)">
                <Input
                  type="number"
                  placeholder="0"
                  value={thresholds.minAmount}
                  onChange={(e) => setThresholds((p) => ({ ...p, minAmount: e.target.value }))}
                />
              </Field>
              <Field label="Max Amount (₹)">
                <Input
                  type="number"
                  placeholder="No limit"
                  value={thresholds.maxAmount}
                  onChange={(e) => setThresholds((p) => ({ ...p, maxAmount: e.target.value }))}
                />
              </Field>
            </div>
          </div>
        </GlassCard>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => router.push('/risk')}>Cancel</Button>
          <Button
            type="submit"
            icon="analytics"
            loading={runMutation.isPending}
            disabled={!engagementId}
          >
            Run Analysis
          </Button>
        </div>
      </form>
    </div>
  );
}
