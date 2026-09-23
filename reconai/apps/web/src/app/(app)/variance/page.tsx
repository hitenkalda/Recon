'use client';

import { useMemo, useState } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEngagements, useDocuments, useVarianceRuns, ApiError } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard, Button, Spinner, ErrorState, StateBlock, StatusBadge } from '@/components/ui/primitives';
import { Field, Select, Modal } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo } from '@/lib/format';

function Variance() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const filterEngagementId = searchParams.get('engagementId') ?? undefined;

  const runs = useVarianceRuns({ engagementId: filterEngagementId });
  const engagements = useEngagements();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedEngagementId = (form.engagementId as string) || filterEngagementId || '';
  const docs = useDocuments({ engagementId: selectedEngagementId });

  const tbDocs = useMemo(
    () => (docs.data?.items ?? []).filter((d) => (d.category ?? 'other') === 'trial_balance'),
    [docs.data],
  );
  const otherDocs = useMemo(
    () => (docs.data?.items ?? []).filter((d) => (d.category ?? 'other') !== 'trial_balance'),
    [docs.data],
  );

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const engagementId = form.engagementId;
      const clientId = form.clientId;
      const config = {
        plAllLedgers: form.plMode === 'all',
        quickThreshold: Number(form.quickThreshold || 10),
        detailedThreshold: Number(form.detailedThreshold || 20),
        obTolerance: Number(form.obTolerance || 0.5),
      };
      const run = await api.post<{ id: string }>('/variance', {
        engagementId,
        clientId,
        priorDocumentId: form.priorDocumentId || undefined,
        currentDocumentId: form.currentDocumentId || undefined,
        config,
      });
      void qc.invalidateQueries({ queryKey: ['varianceRuns'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      setOpen(false);
      router.push(`/variance/${run.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not launch the variance analysis.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
            P&L Variance
          </h1>
          <p className="text-xs text-mine-400 mt-1">{runs.data?.total ?? 0} analyses · trial balance to profit &amp; loss</p>
        </div>
        <Button icon="account_balance" size="sm" onClick={() => setOpen(true)}>New Analysis</Button>
      </div>

      {runs.isLoading ? <Spinner label="Loading analyses" /> : null}
      {!runs.isLoading && runs.error ? <ErrorState message={(runs.error as Error).message} onRetry={() => runs.refetch()} /> : null}

      {!runs.isLoading && !runs.error && runs.data?.items.length === 0 ? (
        <StateBlock
          icon="account_balance"
          title="No variance analyses"
          body="Upload a prior-period and current-period trial balance for an engagement, then run the P&L variance pass."
          action={<Button icon="account_balance" size="sm" onClick={() => setOpen(true)}>Start first analysis</Button>}
        />
      ) : null}

      {!runs.isLoading && !runs.error && runs.data && runs.data.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {runs.data.items.map((r) => {
            const m = r.metrics ?? {};
            return (
              <GlassCard key={r.id} interactive className="p-4 flex items-center justify-between gap-3" onClick={() => router.push(`/variance/${r.id}`)}>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white capitalize">{label(r.id.slice(-6))}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px] text-mine-400 flex-wrap">
                    <span className="inline-flex items-center gap-1"><Icon name="corporate_fare" size={12} />{r.client?.name ?? '—'}</span>
                    <span>·</span>
                    <span>{r.engagement?.title ?? '—'}</span>
                    <span>·</span>
                    <span>{timeAgo(r.createdAt)}</span>
                  </div>
                  {r.status === 'completed' ? (
                    <div className="flex items-center gap-3 font-mono text-[10px] flex-wrap">
                      {typeof m.detailedReview === 'number' ? <span className="text-rose-300">{m.detailedReview} detailed</span> : null}
                      {typeof m.quickReview === 'number' ? <span className="text-amber-300">{m.quickReview} quick</span> : null}
                      {typeof m.withinThreshold === 'number' ? <span className="text-[#94bda4]">{m.withinThreshold} within</span> : null}
                      {typeof m.newLedgers === 'number' ? <span className="text-cyan-300">{m.newLedgers} new</span> : null}
                      {typeof m.obMismatches === 'number' ? <span className="text-fuchsia-300">{m.obMismatches} OB mismatch</span> : null}
                    </div>
                  ) : null}
                </div>
                <Icon name="chevron_right" size={18} className="text-mine-400 shrink-0" />
              </GlassCard>
            );
          })}
        </div>
      ) : null}

      {/* Create-run modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Launch P&L Variance" eyebrow="Engine pass" wide>
        <div className="flex flex-col gap-4">
          {error ? <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{error}</div> : null}

          <Field label="Engagement" required>
            <Select value={selectedEngagementId} onChange={(e) => set('engagementId', e.target.value)}>
              <option value="">Select engagement…</option>
              {engagements.data?.items.map((e) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </Select>
          </Field>

          {selectedEngagementId ? (
            <>
              <Field label="Client" required>
                <Select value={form.clientId ?? ''} onChange={(e) => set('clientId', e.target.value)}>
                  <option value="">Auto — choose here if needed</option>
                  {engagements.data?.items
                    .filter((e) => e.id === selectedEngagementId)
                    .map((e) => (
                      <option key={e.clientId} value={e.clientId}>{e.client?.name ?? 'Client'}</option>
                    ))}
                </Select>
              </Field>

              <Field label="Prior Period Trial Balance" required>
                <Select value={form.priorDocumentId ?? ''} onChange={(e) => set('priorDocumentId', e.target.value)}>
                  <option value="">Select document…</option>
                  {tbDocs.map((d) => (
                    <option key={d.id} value={d.id}>{d.originalName}</option>
                  ))}
                  {otherDocs.map((d) => (
                    <option key={d.id} value={d.id}>{d.originalName}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Current Period Trial Balance" required>
                <Select value={form.currentDocumentId ?? ''} onChange={(e) => set('currentDocumentId', e.target.value)}>
                  <option value="">Select document…</option>
                  {tbDocs.map((d) => (
                    <option key={d.id} value={d.id}>{d.originalName}</option>
                  ))}
                  {otherDocs.map((d) => (
                    <option key={d.id} value={d.id}>{d.originalName}</option>
                  ))}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="P&L Scope">
                  <Select value={form.plMode ?? 'keywords'} onChange={(e) => set('plMode', e.target.value)}>
                    <option value="keywords">Keyword mode (P&L only)</option>
                    <option value="all">All ledgers</option>
                  </Select>
                </Field>
                <Field label="OB Tolerance">
                  <input
                    className="w-full rounded-lg text-white placeholder:text-zinc-600 text-[13px] px-3.5 py-2.5 border border-white/[0.08] bg-[rgba(15,18,22,0.7)]"
                    value={form.obTolerance ?? '0.5'} onChange={(e) => set('obTolerance', e.target.value)} type="number" step="0.1" min="0"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quick Review at ≥ (%)">
                  <input
                    className="w-full rounded-lg text-white placeholder:text-zinc-600 text-[13px] px-3.5 py-2.5 border border-white/[0.08] bg-[rgba(15,18,22,0.7)]"
                    value={form.quickThreshold ?? '10'} onChange={(e) => set('quickThreshold', e.target.value)} type="number" step="1" min="0"
                  />
                </Field>
                <Field label="Detailed Review at ≥ (%)">
                  <input
                    className="w-full rounded-lg text-white placeholder:text-zinc-600 text-[13px] px-3.5 py-2.5 border border-white/[0.08] bg-[rgba(15,18,22,0.7)]"
                    value={form.detailedThreshold ?? '20'} onChange={(e) => set('detailedThreshold', e.target.value)} type="number" step="1" min="0"
                  />
                </Field>
              </div>
              <p className="text-[11px] text-mine-400">
                Ledgers classified as &lt;{form.quickThreshold ?? 10}% <span className="text-[#94bda4]">Within Threshold</span>,{' '}
                {(form.quickThreshold ?? 10)}–{(form.detailedThreshold ?? 20)}% <span className="text-amber-300">Quick Review</span>,{' '}
                &gt;{(form.detailedThreshold ?? 20)}% <span className="text-rose-300">Detailed Review</span>.
              </p>
            </>
          ) : (
            <p className="text-xs text-mine-400">Select an engagement to choose its processed trial-balance documents.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button icon="play_arrow" onClick={submit} disabled={!selectedEngagementId} loading={submitting}>
              Launch Analysis
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function VariancePage() {
  return (
    <Suspense fallback={<Spinner label="Loading P&L variance" />}>
      <Variance />
    </Suspense>
  );
}