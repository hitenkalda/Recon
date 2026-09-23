'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useWorkingPapers, useEngagements, ApiError } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard, Badge, Button, Spinner, ErrorState, StateBlock, StatusBadge } from '@/components/ui/primitives';
import { Field, Select, Input, Textarea, Modal } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo } from '@/lib/format';
import { clsx } from 'clsx';

const DELIVERABLES = ['gst_reconciliation', 'bank_reconciliation', 'ais_reconciliation', 'exception_summary', 'risk_report', 'tax_credit'];

function WorkingPapers() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const engagementFilter = searchParams.get('engagementId') ?? undefined;
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useWorkingPapers({ engagementId: engagementFilter });
  const engagements = useEngagements();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ engagementId: engagementFilter ?? '', title: '', deliverable: 'gst_reconciliation', conclusion: '' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreateError(null);
    const engagement = engagements.data?.items.find((e) => e.id === form.engagementId);
    if (!form.engagementId) {
      setCreateError('Choose an engagement.');
      return;
    }
    setCreating(true);
    try {
      await api.post('/working-papers', {
        engagementId: form.engagementId,
        clientId: engagement?.clientId,
        title: form.title,
        deliverable: form.deliverable,
        conclusion: form.conclusion.trim() || undefined,
        procedures: [],
      });
      setCreateOpen(false);
      setForm({ engagementId: '', title: '', deliverable: 'gst_reconciliation', conclusion: '' });
      void qc.invalidateQueries({ queryKey: ['workingPapers'] });
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Unable to create working paper.');
    } finally {
      setCreating(false);
    }
  }

  const statusFlow: Record<string, number> = { draft: 0, ready_for_review: 1, senior_signed: 2, partner_signed: 3 };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
            Working Papers
          </h1>
          <p className="text-xs text-mine-400 mt-1">{data?.total ?? 0} working papers · SA 230 evidence</p>
        </div>
        <Button icon="plus" size="sm" onClick={() => setCreateOpen(true)}>New Paper</Button>
      </div>

      {isLoading ? <Spinner label="Loading working papers" /> : null}
      {!isLoading && error ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> : null}

      {!isLoading && !error && (data?.items ?? []).length === 0 ? (
        <StateBlock
          icon="description"
          title="No working papers"
          body="Working papers consolidate the procedures, evidence hash and conclusions for an engagement."
          action={<Button icon="plus" size="sm" onClick={() => setCreateOpen(true)}>New Paper</Button>}
        />
      ) : null}

      {!isLoading && !error && (data?.items ?? []).length > 0 ? (
        <div className="flex flex-col gap-2">
          {(data?.items ?? []).map((wp) => {
            const step = statusFlow[wp.status] ?? 0;
            return (
              <GlassCard key={wp.id} interactive className="p-4 flex items-center justify-between gap-3" onClick={() => router.push(`/working-papers/${wp.id}`)}>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={wp.status} />
                    <Badge tone="dim">{label(wp.deliverable ?? '')}</Badge>
                  </div>
                  <span className="text-sm font-medium text-white truncate">{wp.title}</span>
                  <div className="flex items-center gap-2 font-mono text-[10px] text-mine-400 flex-wrap">
                    <span className="inline-flex items-center gap-1"><Icon name="corporate_fare" size={12} />{wp.client?.name ?? '—'}</span>
                    <span>·</span>
                    <span>{wp.engagement?.title ?? '—'}</span>
                    <span>·</span>
                    <span>{timeAgo(wp.updatedAt ?? wp.createdAt)}</span>
                    {typeof wp._count?.reports === 'number' ? <span>· <span className="text-cyan-300">{wp._count.reports} reports</span></span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden sm:flex items-center gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <span key={i} className={clsx('w-1.5 h-1.5 rounded-full', i <= step ? 'bg-accent-cyan' : 'bg-slate-700')} />
                    ))}
                  </div>
                  <Icon name="chevron_right" size={18} className="text-mine-400" />
                </div>
              </GlassCard>
            );
          })}
        </div>
      ) : null}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Working Paper" eyebrow="Deliverable draft" wide>
        <div className="flex flex-col gap-4">
          {createError ? (
            <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{createError}</div>
          ) : null}
          <Field label="Engagement" required>
            <Select value={form.engagementId} onChange={(e) => setForm((f) => ({ ...f, engagementId: e.target.value }))}>
              <option value="">Select engagement…</option>
              {(engagements.data?.items ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Title" required>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="GST payable reconciliation — GSTR-2B vs books" required />
          </Field>
          <Field label="Deliverable" required>
            <Select value={form.deliverable} onChange={(e) => setForm((f) => ({ ...f, deliverable: e.target.value }))}>
              {DELIVERABLES.map((d) => (
                <option key={d} value={d}>{label(d)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Conclusion (optional)">
            <Textarea value={form.conclusion} onChange={(e) => setForm((f) => ({ ...f, conclusion: e.target.value }))} rows={3} placeholder="Draft conclusion…" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button icon="check" onClick={() => void create()} loading={creating}>Create Paper</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function WorkingPapersPage() {
  return (
    <Suspense fallback={<Spinner label="Loading working papers" />}>
      <WorkingPapers />
    </Suspense>
  );
}