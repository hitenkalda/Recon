'use client';

import { useMemo, useState } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEngagements, useDocuments, useRuns, ApiError } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard, Button, Spinner, ErrorState, StateBlock, StatusBadge } from '@/components/ui/primitives';
import { Field, Select, Modal, Tabs } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo } from '@/lib/format';

type RunType = 'gst' | 'bank' | 'ais_26as';
const RUN_TYPES: { key: RunType; label: string }[] = [
  { key: 'gst', label: 'GST / GSTR-2B' },
  { key: 'bank', label: 'Bank' },
  { key: 'ais_26as', label: 'AIS / 26AS' },
];

function Reconciliation() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const filterEngagementId = searchParams.get('engagementId') ?? undefined;

  const runs = useRuns({ engagementId: filterEngagementId });
  const engagements = useEngagements();

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RunType>('gst');
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedEngagementId = (form.engagementId as string) || filterEngagementId || '';
  const docs = useDocuments({ engagementId: selectedEngagementId });

  const docsByCategory = useMemo(() => {
    const map: Record<string, { id: string; originalName: string }[]> = {};
    for (const d of docs.data?.items ?? []) {
      const k = d.category ?? 'other';
      (map[k] ??= []).push({ id: d.id, originalName: d.originalName });
    }
    return map;
  }, [docs.data]);

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const engagementId = form.engagementId;
      const clientId = form.clientId;
      const [from, to] = (form.period || '2025-04|2026-03').split('|');
      const period = { from, to };

      let payload: Record<string, unknown>;
      if (type === 'gst') {
        payload = {
          type: 'gst',
          data: {
            engagementId, clientId,
            purchaseLedgerDocumentId: form.purchaseLedgerDocumentId,
            gstr2bDocumentId: form.gstr2bDocumentId,
            period,
            params: { toleranceDays: 5, amountTolerancePaise: 100 },
          },
        };
      } else if (type === 'bank') {
        payload = {
          type: 'bank',
          data: {
            engagementId, clientId,
            bankStatementDocumentId: form.bankStatementDocumentId,
            bookLedgerDocumentId: form.bookLedgerDocumentId,
            bankAccount: {
              bankName: form.bankName ?? '',
              accountNumber: form.accountNumber ?? '',
              ifsc: form.ifsc ?? '',
            },
            period,
          },
        };
      } else {
        payload = {
          type: 'ais_26as',
          data: {
            engagementId, clientId,
            ais26asDocumentId: form.ais26asDocumentId,
            booksDocumentId: form.booksDocumentId || undefined,
            tan: form.tan || undefined,
            period,
          },
        };
      }

      const run = await api.post<{ id: string }>('/reconciliations', payload);
      void qc.invalidateQueries({ queryKey: ['runs'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      setOpen(false);
      router.push(`/reconciliation/${run.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not launch the reconciliation.');
    } finally {
      setSubmitting(false);
    }
  }

  function engagementList() {
    return engagements.data?.items ?? [];
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
            Reconciliation
          </h1>
          <p className="text-xs text-mine-400 mt-1">{runs.data?.total ?? 0} runs · deterministic engine</p>
        </div>
        <Button icon="sync_alt" size="sm" onClick={() => setOpen(true)}>New Run</Button>
      </div>

      {runs.isLoading ? <Spinner label="Loading runs" /> : null}
      {!runs.isLoading && runs.error ? <ErrorState message={(runs.error as Error).message} onRetry={() => runs.refetch()} /> : null}

      {!runs.isLoading && !runs.error && runs.data?.items.length === 0 ? (
        <StateBlock
          icon="sync_alt"
          title="No reconciliation runs"
          body="Pick a client engagement, upload source documents, then launch a GST, Bank or AIS matching pass."
          action={<Button icon="sync_alt" size="sm" onClick={() => setOpen(true)}>Start first run</Button>}
        />
      ) : null}

      {!runs.isLoading && !runs.error && runs.data && runs.data.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {runs.data.items.map((r) => (
            <GlassCard key={r.id} interactive className="p-4 flex items-center justify-between gap-3" onClick={() => router.push(`/reconciliation/${r.id}`)}>
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white capitalize truncate">{label(r.type)}</span>
                  <StatusBadge status={r.status} />
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] text-mine-400 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Icon name="corporate_fare" size={12} />{r.client?.name ?? '—'}</span>
                  <span>·</span>
                  <span>{r.engagement?.title ?? '—'}</span>
                  <span>·</span>
                  <span>{timeAgo(r.createdAt)}</span>
                </div>
                {r.metrics ? (
                  <div className="flex items-center gap-3 font-mono text-[10px] mt-0.5">
                    {typeof r.metrics.matchedCount === 'number' ? <span className="text-[#94bda4]">{r.metrics.matchedCount} matched</span> : null}
                    {typeof r.metrics.unmatchedCount === 'number' ? <span className="text-rose-300">{r.metrics.unmatchedCount} unmatched</span> : null}
                  </div>
                ) : null}
              </div>
              <Icon name="chevron_right" size={18} className="text-mine-400 shrink-0" />
            </GlassCard>
          ))}
        </div>
      ) : null}

      {/* Create-run modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Launch Reconciliation" eyebrow="Engine pass" wide>
        <div className="flex flex-col gap-4">
          {error ? <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{error}</div> : null}
          <Tabs<RunType>
            tabs={RUN_TYPES.map((t) => ({ key: t.key, label: t.label }))}
            active={type}
            onChange={(k) => {
              setType(k);
              setError(null);
            }}
          />

          <Field label="Engagement" required>
            <Select value={selectedEngagementId} onChange={(e) => set('engagementId', e.target.value)}>
              <option value="">Select engagement…</option>
              {engagementList().map((e) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </Select>
          </Field>

          {selectedEngagementId ? (
            <>
              <Field label="Client" required>
                <Select value={form.clientId ?? ''} onChange={(e) => set('clientId', e.target.value)}>
                  <option value="">Auto — choose here if needed</option>
                  {engagementList()
                    .filter((e) => e.id === selectedEngagementId)
                    .map((e) => (
                      <option key={e.clientId} value={e.clientId}>{e.client?.name ?? 'Client'}</option>
                    ))}
                </Select>
              </Field>

              {type === 'gst' ? (
                <>
                  <Field label="Purchase Ledger Document (Books)" required>
                    <Select value={form.purchaseLedgerDocumentId ?? ''} onChange={(e) => set('purchaseLedgerDocumentId', e.target.value)}>
                      <option value="">Select document…</option>
                      {(docsByCategory.purchase_invoice ?? []).concat(docsByCategory.other ?? []).map((d) => (
                        <option key={d.id} value={d.id}>{d.originalName}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="GSTR-2B Document (Portal)" required>
                    <Select value={form.gstr2bDocumentId ?? ''} onChange={(e) => set('gstr2bDocumentId', e.target.value)}>
                      <option value="">Select document…</option>
                      {(docsByCategory.gstr_2b ?? []).map((d) => (
                        <option key={d.id} value={d.id}>{d.originalName}</option>
                      ))}
                    </Select>
                  </Field>
                </>
              ) : null}

              {type === 'bank' ? (
                <>
                  <Field label="Bank Statement" required>
                    <Select value={form.bankStatementDocumentId ?? ''} onChange={(e) => set('bankStatementDocumentId', e.target.value)}>
                      <option value="">Select document…</option>
                      {(docsByCategory.bank_statement ?? []).concat(docsByCategory.other ?? []).map((d) => (
                        <option key={d.id} value={d.id}>{d.originalName}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Book Ledger" required>
                    <Select value={form.bookLedgerDocumentId ?? ''} onChange={(e) => set('bookLedgerDocumentId', e.target.value)}>
                      <option value="">Select document…</option>
                      {(docsByCategory.other ?? []).concat(docsByCategory.purchase_invoice ?? []).concat(docsByCategory.sales_invoice ?? []).map((d) => (
                        <option key={d.id} value={d.id}>{d.originalName}</option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Bank Name">
                      <input className="w-full rounded-lg text-white placeholder:text-zinc-600 text-[13px] px-3.5 py-2.5 border border-white/[0.08] bg-[rgba(15,18,22,0.7)]" value={form.bankName ?? ''} onChange={(e) => set('bankName', e.target.value)} placeholder="HDFC Bank" />
                    </Field>
                    <Field label="Account No">
                      <input className="w-full rounded-lg text-white placeholder:text-zinc-600 text-[13px] px-3.5 py-2.5 border border-white/[0.08] bg-[rgba(15,18,22,0.7)]" value={form.accountNumber ?? ''} onChange={(e) => set('accountNumber', e.target.value)} placeholder="50100234567890" />
                    </Field>
                  </div>
                </>
              ) : null}

              {type === 'ais_26as' ? (
                <>
                  <Field label="AIS / 26AS Document" required>
                    <Select value={form.ais26asDocumentId ?? ''} onChange={(e) => set('ais26asDocumentId', e.target.value)}>
                      <option value="">Select document…</option>
                      {(docsByCategory.ais_26as ?? []).map((d) => (
                        <option key={d.id} value={d.id}>{d.originalName}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Books Document (optional)">
                    <Select value={form.booksDocumentId ?? ''} onChange={(e) => set('booksDocumentId', e.target.value)}>
                      <option value="">None — compare 26AS only</option>
                      {(docsByCategory.tds_receivable ?? []).length > 0 && (
                        <optgroup label="TDS Receivable (recommended)">
                          {(docsByCategory.tds_receivable ?? []).map((d) => (
                            <option key={d.id} value={d.id}>{d.originalName}</option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Other">
                        {(docsByCategory.other ?? []).map((d) => (
                          <option key={d.id} value={d.id}>{d.originalName}</option>
                        ))}
                      </optgroup>
                    </Select>
                    <span className="text-[10px] text-slate-500 mt-1">Select a TDS-Receivable ledger or any book containing TDS credit entries.</span>
                  </Field>
                </>
              ) : null}

              <Field label="Period">
                <Select value={form.period ?? '2025-04 | 2026-03'} onChange={(e) => set('period', e.target.value)}>
                  <option value="2025-04|2026-03">Apr 2025 – Mar 2026</option>
                  <option value="2025-10|2026-03">Oct 2025 – Mar 2026 (H2)</option>
                  <option value="2025-04|2025-09">Apr 2025 – Sep 2025 (H1)</option>
                </Select>
              </Field>
            </>
          ) : (
            <p className="text-xs text-mine-400">Select an engagement to choose its processed documents.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button icon="play_arrow" onClick={submit} disabled={!selectedEngagementId} loading={submitting}>
              Launch Run
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function ReconciliationPage() {
  return (
    <Suspense fallback={<Spinner label="Loading reconciliation" />}>
      <Reconciliation />
    </Suspense>
  );
}