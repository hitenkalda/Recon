'use client';

import { useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useException, useTeam } from '@/lib/hooks';
import { api, ApiError } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard, Badge, Button, Spinner, ErrorState, StatusBadge } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo } from '@/lib/format';
import { Field, Select, Textarea, Modal } from '@/components/ui/fields';

function severityTone(severity: string): 'critical' | 'danger' | 'warning' | 'default' {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  return 'default';
}

export default function ExceptionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { data: ex, isLoading, error, refetch } = useException(id);
  const team = useTeam();

  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolution, setResolution] = useState('');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['exception', id] });
    void qc.invalidateQueries({ queryKey: ['exceptions'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  if (isLoading) return <Spinner label="Loading exception" />;
  if (error || !ex) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const resolved = ex.status === 'resolved';

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      invalidate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function addComment() {
    const text = comment.trim();
    if (!text) return;
    await act(() => api.post(`/exceptions/${id}/comments`, { text }));
    setComment('');
  }

  async function assign(assigneeId: string) {
    if (!assigneeId) return;
    await act(() => api.post(`/exceptions/${id}/assign`, { assigneeId }));
  }

  async function resolveNow() {
    const text = resolution.trim();
    if (!text) {
      setActionError('A resolution note is required to close the exception.');
      return;
    }
    await act(() => api.patch(`/exceptions/${id}`, { status: 'resolved', resolution: text }));
    setResolveOpen(false);
    setResolution('');
  }

  async function reopen() {
    await act(() => api.patch(`/exceptions/${id}`, { status: 'reopened' }));
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <section className="flex flex-col gap-2">
        <Link href="/exceptions" className="inline-flex items-center gap-1 font-mono text-[10px] text-mine-400 hover:text-white transition-colors uppercase tracking-wider">
          <Icon name="chevron_right" size={14} className="rotate-180" /> Exception Queue
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
                {ex.title}
              </h1>
              <Badge tone={severityTone(ex.severity)}>{ex.severity}</Badge>
              <StatusBadge status={ex.status} />
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-mine-400 flex-wrap">
              <span className="inline-flex items-center gap-1"><Icon name="corporate_fare" size={13} />{ex.client?.name ?? '—'}</span>
              <span>·</span>
              <span>{ex.engagement?.title ?? '—'}</span>
              {ex.run ? (
                <>
                  <span>·</span>
                  <Link href={`/reconciliation/${ex.run?.id}`} className="inline-flex items-center gap-1 text-cyan-300 hover:underline">
                    <Icon name="sync_alt" size={12} /> {label(ex.run.type)}
                  </Link>
                </>
              ) : null}
              <span>·</span>
              <span>{timeAgo(ex.createdAt)}</span>
            </div>
            <Badge tone="dim">{label(ex.kind)}</Badge>
            {ex.description ? <p className="text-[13px] text-slate-300 max-w-2xl leading-relaxed mt-1">{ex.description}</p> : null}
            {ex.resolution ? (
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/20 p-3 text-[13px] text-emerald-200/90 max-w-2xl mt-1">
                <span className="font-caps text-[9px] text-emerald-400/80 tracking-widest block mb-1">Resolution</span>
                {ex.resolution}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col items-stretch gap-2 shrink-0 min-w-[220px]">
            <Field label="Assignee">
              <Select value={ex.assigneeId ?? ''} onChange={(e) => void assign(e.target.value)} disabled={busy}>
                <option value="">Unassigned</option>
                {team.data?.items?.map((m) => (
                  <option key={m.id} value={m.userId}>{m.name}</option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              {resolved ? (
                <Button variant="secondary" size="sm" icon="refresh" onClick={() => void reopen()} loading={busy} className="flex-1">
                  Reopen
                </Button>
              ) : (
                <Button size="sm" icon="verified" onClick={() => setResolveOpen(true)} loading={busy} className="flex-1">
                  Resolve
                </Button>
              )}
            </div>
          </div>
        </div>
        {actionError ? (
          <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{actionError}</div>
        ) : null}
      </section>

      {/* Thread + activity */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-mine-400">Discussion</h2>
            <Badge tone="dim">{ex.comments?.length ?? 0}</Badge>
          </div>
          <GlassCard className="divide-y divide-white/[0.06] overflow-hidden">
            {(ex.comments ?? []).length === 0 ? (
              <div className="p-6 text-center text-xs text-mine-400">No comments yet — start the discussion below.</div>
            ) : (
              (ex.comments ?? []).map((c) => (
                <div key={c.id} className="px-4 py-3 flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-[10px] font-mono text-cyan-300 shrink-0">
                    {(c.user?.name ?? '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-white">{c.user?.name ?? 'Unknown'}</span>
                      <span className="font-mono text-[9px] text-mine-400">{timeAgo(c.createdAt)}</span>
                    </div>
                    <p className="text-[13px] text-slate-300 leading-relaxed break-words">{c.text}</p>
                  </div>
                </div>
              ))
            )}
            <div className="p-3 border-t border-white/[0.06] flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) void addComment();
                }}
                placeholder="Add a comment…"
                className="flex-1 rounded-lg text-white placeholder:text-zinc-600 text-[13px] px-3.5 py-2.5 border border-white/[0.08] bg-[rgba(15,18,22,0.7)]"
              />
              <Button size="sm" icon="arrow_forward" onClick={() => void addComment()} loading={busy}>
                Post
              </Button>
            </div>
          </GlassCard>
        </div>

        <div className="md:col-span-2 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-mine-400">Activity</h2>
          </div>
          <GlassCard className="divide-y divide-white/[0.06] overflow-hidden">
            {(ex.activities ?? []).length === 0 ? (
              <div className="p-6 text-center text-xs text-mine-400">No activity yet.</div>
            ) : (
              (ex.activities ?? []).map((a) => (
                <div key={a.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon name="radio_checked" size={12} className="text-accent-cyan shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] text-slate-200 capitalize truncate">{label(a.action)}</span>
                      {a.detail ? <span className="font-mono text-[9px] text-mine-400 truncate">{a.detail}</span> : null}
                    </div>
                  </div>
                  <span className="font-mono text-[9px] text-mine-400 shrink-0">{timeAgo(a.createdAt)}</span>
                </div>
              ))
            )}
          </GlassCard>
        </div>
      </section>

      {/* Resolve modal */}
      <Modal open={resolveOpen} onClose={() => setResolveOpen(false)} title="Resolve exception" eyebrow="Senior-gated">
        <div className="flex flex-col gap-4">
          <p className="text-xs text-mine-400">
            High and critical exceptions require a Senior or above. The resolution note becomes part of the audit record.
          </p>
          <Field label="Resolution note" required>
            <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={4} placeholder="Root cause, evidence reviewed and conclusion…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button icon="verified" onClick={() => void resolveNow()} loading={busy}>Resolve</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}