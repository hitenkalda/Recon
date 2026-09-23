'use client';

import { useMemo, useState } from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEngagements, useDocuments, useTdsRuns, ApiError } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard, Button, Spinner, ErrorState, StateBlock, StatusBadge } from '@/components/ui/primitives';
import { Field, Select, Modal } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo } from '@/lib/format';
import { TDS_SECTIONS, DED_STATUS_LABELS } from '@/lib/tds';

interface LedgerRow {
  documentId: string;
  name: string;
  section: string;
  tdsCol: string;
  amountCol: string;
}

function baseName(file: string) {
  return String(file).replace(/\.(xlsx?|csv|txt)$/i, '').replace(/[_-]+/g, ' ').trim();
}

function TdsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const filterEngagementId = searchParams.get('engagementId') ?? undefined;

  const runs = useTdsRuns({ engagementId: filterEngagementId });
  const engagements = useEngagements();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedEngagementId = (form.engagementId as string) || filterEngagementId || '';
  const docs = useDocuments({ engagementId: selectedEngagementId });

  const expDocs = useMemo(
    () => (docs.data?.items ?? []).filter((d) => (d.category ?? 'other') === 'expense_ledger'),
    [docs.data],
  );
  const payDocs = useMemo(
    () => (docs.data?.items ?? []).filter((d) => (d.category ?? 'other') === 'tds_payable'),
    [docs.data],
  );
  const otherDocs = useMemo(
    () => (docs.data?.items ?? []).filter((d) => {
      const c = d.category ?? 'other';
      return c !== 'expense_ledger' && c !== 'tds_payable';
    }),
    [docs.data],
  );

  function set(k: string, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function addLedgerRow() {
    setRows((r) => [...r, { documentId: '', name: '', section: '194I_land', tdsCol: '', amountCol: '' }]);
  }

  function updateRow(i: number, patch: Partial<LedgerRow>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  function pickDoc(i: number, documentId: string) {
    const doc = docs.data?.items.find((d) => d.id === documentId);
    updateRow(i, {
      documentId,
      // Autofill the ledger name from the file unless the user already typed one.
      name: rows[i].name || (doc ? baseName(doc.originalName) : ''),
    });
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const validRows = rows.filter((r) => r.documentId && r.name && r.section);
      if (validRows.length === 0) {
        setError('Add at least one expense ledger.');
        return;
      }
      const engagementId = form.engagementId;
      const clientId = form.clientId;
      const run = await api.post<{ id: string }>('/tds', {
        engagementId,
        clientId,
        ledgers: validRows.map((r) => ({
          documentId: r.documentId,
          name: r.name,
          section: r.section,
          tdsCol: r.tdsCol || undefined,
          amountCol: r.amountCol || undefined,
        })),
        payableDocumentId: form.payableDocumentId || undefined,
        config: {
          financialYear: form.fyFrom && form.fyTo
            ? { from: Number(form.fyFrom), to: Number(form.fyTo) }
            : undefined,
          clientName: form.clientName || undefined,
        },
      });
      void qc.invalidateQueries({ queryKey: ['tdsRuns'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      setOpen(false);
      router.push(`/tds/${run.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not launch the TDS checklist.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
            TDS Compliance Checklist
          </h1>
          <p className="text-xs text-mine-400 mt-1">{runs.data?.total ?? 0} checks · expense ledgers vs section thresholds &amp; deposits</p>
        </div>
        <Button icon="receipt_long" size="sm" onClick={() => setOpen(true)}>New Checklist</Button>
      </div>

      {runs.isLoading ? <Spinner label="Loading checklists" /> : null}
      {!runs.isLoading && runs.error ? <ErrorState message={(runs.error as Error).message} onRetry={() => runs.refetch()} /> : null}

      {!runs.isLoading && !runs.error && runs.data?.items.length === 0 ? (
        <StateBlock
          icon="receipt_long"
          title="No TDS checklists"
          body="Upload expense-ledger exports (and optionally a TDS Payable ledger) for an engagement, then run the compliance pass."
          action={<Button icon="receipt_long" size="sm" onClick={() => setOpen(true)}>Start first checklist</Button>}
        />
      ) : null}

      {!runs.isLoading && !runs.error && runs.data && runs.data.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {runs.data.items.map((r) => {
            const s = (r.metrics?.summary ?? {}) as Record<string, number>;
            return (
              <GlassCard key={r.id} interactive className="p-4 flex items-center justify-between gap-3" onClick={() => router.push(`/tds/${r.id}`)}>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white capitalize">{label(r.id.slice(-6))}</span>
                    <StatusBadge status={r.status} />
                    <span className="font-mono text-[9px] text-mine-400 border border-white/[0.08] rounded-full px-2 py-0.5">
                      {r.ledgers?.length ?? 0} ledgers
                    </span>
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
                      {typeof s.notDeducted === 'number' ? <span className="text-rose-300">{s.notDeducted} not deducted</span> : null}
                      {typeof s.shortDeductions === 'number' ? <span className="text-amber-300">{s.shortDeductions} short</span> : null}
                      {typeof s.notDeposited === 'number' ? <span className="text-fuchsia-300">{s.notDeposited} not deposited</span> : null}
                      {typeof s.interestLiability === 'number' && s.interestLiability > 0 ? <span className="text-cyan-300">₹{s.interestLiability} interest</span> : null}
                      <span className="text-mine-400">{s.transactionCount} txns</span>
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
      <Modal open={open} onClose={() => setOpen(false)} title="Launch TDS Compliance Checklist" eyebrow="Engine pass" wide>
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

              {/* Expense ledgers */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-caps text-[9px] text-mine-400 uppercase tracking-wider">Expense Ledgers</span>
                  <Button variant="ghost" size="sm" icon="plus" onClick={addLedgerRow}>Add ledger</Button>
                </div>
                {rows.length === 0 ? (
                  <p className="text-[11px] text-mine-400">Add one or more expense ledgers (e.g. Rent A/c, Professional Fees). TDS columns are auto-detected when left blank.</p>
                ) : null}
                {rows.map((row, i) => (
                  <div key={i} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-mine-400">Ledger {i + 1}</span>
                      <button className="text-mine-400 hover:text-rose-300" onClick={() => removeRow(i)} aria-label="Remove ledger">
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Field label="Document">
                        <Select value={row.documentId} onChange={(e) => pickDoc(i, e.target.value)}>
                          <option value="">Select document…</option>
                          {expDocs.map((d) => (
                            <option key={d.id} value={d.id}>{d.originalName}</option>
                          ))}
                          {otherDocs.map((d) => (
                            <option key={d.id} value={d.id}>{d.originalName}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Ledger Name">
                        <input
                          className="w-full rounded-lg text-white placeholder:text-zinc-600 text-[13px] px-3.5 py-2.5 border border-white/[0.08] bg-[rgba(15,18,22,0.7)]"
                          value={row.name} onChange={(e) => updateRow(i, { name: e.target.value })} placeholder="e.g. Rent A/c"
                        />
                      </Field>
                      <Field label="TDS Section">
                        <Select value={row.section} onChange={(e) => updateRow(i, { section: e.target.value })}>
                          {TDS_SECTIONS.map((s) => (
                            <option key={s.key} value={s.key}>{s.label} — {s.desc}</option>
                          ))}
                        </Select>
                      </Field>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="TDS column">
                          <input
                            className="w-full rounded-lg text-white placeholder:text-zinc-600 text-[13px] px-3.5 py-2.5 border border-white/[0.08] bg-[rgba(15,18,22,0.7)]"
                            value={row.tdsCol} onChange={(e) => updateRow(i, { tdsCol: e.target.value })} placeholder="auto"
                          />
                        </Field>
                        <Field label="Amount column">
                          <input
                            className="w-full rounded-lg text-white placeholder:text-zinc-600 text-[13px] px-3.5 py-2.5 border border-white/[0.08] bg-[rgba(15,18,22,0.7)]"
                            value={row.amountCol} onChange={(e) => updateRow(i, { amountCol: e.target.value })} placeholder="auto"
                          />
                        </Field>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Payable + FY */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="TDS Payable ledger (opts into deposit tracking)">
                  <Select value={form.payableDocumentId ?? ''} onChange={(e) => set('payableDocumentId', e.target.value)}>
                    <option value="">None — skip deposit reconciliation</option>
                    {payDocs.map((d) => (
                      <option key={d.id} value={d.id}>{d.originalName}</option>
                    ))}
                    {otherDocs.map((d) => (
                      <option key={d.id} value={d.id}>{d.originalName}</option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="FY From">
                    <input
                      className="w-full rounded-lg text-white placeholder:text-zinc-600 text-[13px] px-3.5 py-2.5 border border-white/[0.08] bg-[rgba(15,18,22,0.7)]"
                      value={form.fyFrom ?? ''} onChange={(e) => set('fyFrom', e.target.value)} type="number" placeholder="2025"
                    />
                  </Field>
                  <Field label="FY To">
                    <input
                      className="w-full rounded-lg text-white placeholder:text-zinc-600 text-[13px] px-3.5 py-2.5 border border-white/[0.08] bg-[rgba(15,18,22,0.7)]"
                      value={form.fyTo ?? ''} onChange={(e) => set('fyTo', e.target.value)} type="number" placeholder="2026"
                    />
                  </Field>
                </div>
              </div>

              <p className="text-[11px] text-mine-400">
                Deterministic engine pass. Findings become exceptions you confirm in the inbox; <span className="text-rose-300">Not Deducted / Not Deposited</span> are high risk.
              </p>
            </>
          ) : (
            <p className="text-xs text-mine-400">Select an engagement to choose its processed ledger documents.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button icon="play_arrow" onClick={submit} disabled={!selectedEngagementId} loading={submitting}>
              Run Checklist
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function TdsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading TDS checklist" />}>
      <TdsPageContent />
    </Suspense>
  );
}

// Kept referenced so tree-shaking preserves the status mapping helpers.
void DED_STATUS_LABELS;