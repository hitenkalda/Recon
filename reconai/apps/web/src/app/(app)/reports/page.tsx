'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useReports, useRuns, useWorkingPapers, useExceptions, ApiError } from '@/lib/hooks';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard, Badge, Button, Spinner, ErrorState, StateBlock } from '@/components/ui/primitives';
import { Field, Select, Modal, Tabs } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo } from '@/lib/format';

type ScopeKind = 'run' | 'workingPaper' | 'exception';
const FORMATS = ['csv', 'pdf', 'xlsx'] as const;

function formatTone(f: string): 'cyan' | 'default' | 'mint' {
  if (f === 'csv') return 'default';
  if (f === 'xlsx') return 'mint';
  return 'cyan';
}

function byteSize(size: string | number | null | undefined): string {
  if (size == null) return '—';
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n > 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n > 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function Reports() {
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const presetRun = searchParams.get('run') ?? undefined;

  const { data, isLoading, error, refetch } = useReports();
  const runs = useRuns();
  const wps = useWorkingPapers();
  const excs = useExceptions({ status: 'open' });

  const [open, setOpen] = useState(Boolean(presetRun));
  const [scope, setScope] = useState<ScopeKind>('run');
  const [format, setFormat] = useState<(typeof FORMATS)[number]>('csv');
  const [form, setForm] = useState<Record<string, string>>({ runId: presetRun ?? '' });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generated, setGenerated] = useState<string | null>(null);

  async function generate() {
    setErrorMsg(null);
    setGenerated(null);
    const payload: Record<string, unknown> = { format };
    if (scope === 'run' && form.runId) payload.runId = form.runId;
    else if (scope === 'workingPaper' && form.workingPaperId) payload.workingPaperId = form.workingPaperId;
    else if (scope === 'exception' && form.exceptionId) payload.exceptionId = form.exceptionId;
    if (Object.keys(payload).length === 1) {
      setErrorMsg('Choose a run, working paper or exception to base the report on.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ report: { id: string }; uploadTo?: string; content?: string }>('/reports/generate', payload);
      if (res.uploadTo && res.content) {
        await fetch(res.uploadTo, { method: 'PUT', body: res.content });
      }
      setOpen(false);
      setGenerated('Report generated and stored.');
      void qc.invalidateQueries({ queryKey: ['reports'] });
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Could not generate the report.');
    } finally {
      setSubmitting(false);
    }
  }

  async function download(id: string) {
    try {
      const res = await api.get<{ url: string }>(`/reports/${id}/download`);
      window.open(res.url, '_blank', 'noopener');
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Download failed.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
            Reports
          </h1>
          <p className="text-xs text-mine-400 mt-1">{data?.total ?? 0} deliverables · SA 230 trail</p>
        </div>
        <Button icon="description" size="sm" onClick={() => setOpen(true)}>Generate</Button>
      </div>

      {generated ? (
        <div className="rounded-lg p-3 text-[12px] text-emerald-300 border border-emerald-500/30 bg-emerald-950/30">{generated}</div>
      ) : null}
      {errorMsg ? (
        <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{errorMsg}</div>
      ) : null}

      {isLoading ? <Spinner label="Loading reports" /> : null}
      {!isLoading && error ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> : null}

      {!isLoading && !error && (data?.items ?? []).length === 0 ? (
        <StateBlock
          icon="analytics"
          title="No reports yet"
          body="Generate a reconciliation, working paper or exception report from a run."
          action={<Button icon="description" size="sm" onClick={() => setOpen(true)}>Generate report</Button>}
        />
      ) : null}

      {!isLoading && !error && (data?.items ?? []).length > 0 ? (
        <div className="flex flex-col gap-2">
          {(data?.items ?? []).map((r) => (
            <GlassCard key={r.id} className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-cyan-300 shrink-0">
                  <Icon name="description" size={17} />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge tone={formatTone(r.format)}>{r.format.toUpperCase()}</Badge>
                    <span className="text-sm font-medium text-white truncate">{r.workingPaper?.title ?? r.engagement?.title ?? 'Report'}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px] text-mine-400 flex-wrap">
                    <span>{r.engagement?.title ?? '—'}</span>
                    <span>·</span>
                    <span>{byteSize(r.size)}</span>
                    <span>·</span>
                    <span>{timeAgo(r.createdAt)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="secondary" size="sm" icon="download" onClick={() => void download(r.id)}>
                  Get link
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : null}

      {/* Generate modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Generate report" eyebrow="Stored artifact" wide>
        <div className="flex flex-col gap-4">
          <Tabs<ScopeKind>
            tabs={[
              { key: 'run', label: 'Run' },
              { key: 'workingPaper', label: 'Working Paper' },
              { key: 'exception', label: 'Exception' },
            ]}
            active={scope}
            onChange={(k) => {
              setScope(k);
              setGenerated(null);
            }}
          />

          {scope === 'run' ? (
            <Field label="Reconciliation run" required>
              <Select value={form.runId ?? ''} onChange={(e) => setForm((f) => ({ ...f, runId: e.target.value }))}>
                <option value="">Select run…</option>
                {(runs.data?.items ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{label(r.type)} — {r.client?.name ?? '—'}</option>
                ))}
              </Select>
            </Field>
          ) : null}

          {scope === 'workingPaper' ? (
            <Field label="Working paper" required>
              <Select value={form.workingPaperId ?? ''} onChange={(e) => setForm((f) => ({ ...f, workingPaperId: e.target.value }))}>
                <option value="">Select working paper…</option>
                {(wps.data?.items ?? []).map((w) => (
                  <option key={w.id} value={w.id}>{w.title}</option>
                ))}
              </Select>
            </Field>
          ) : null}

          {scope === 'exception' ? (
            <Field label="Exception" required>
              <Select value={form.exceptionId ?? ''} onChange={(e) => setForm((f) => ({ ...f, exceptionId: e.target.value }))}>
                <option value="">Select exception…</option>
                {(excs.data?.items ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Format">
            <Select value={format} onChange={(e) => setFormat(e.target.value as (typeof FORMATS)[number])}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>{f.toUpperCase()}</option>
              ))}
            </Select>
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button icon="description" onClick={() => void generate()} loading={submitting}>Generate</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading reports" />}>
      <Reports />
    </Suspense>
  );
}