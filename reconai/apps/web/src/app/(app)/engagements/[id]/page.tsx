'use client';

import { useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEngagement } from '@/lib/hooks';
import { api, ApiError } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard, Badge, Button, Spinner, ErrorState, StatusBadge } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo } from '@/lib/format';
import { Modal, Field, Select } from '@/components/ui/fields';
import { DocumentCategory } from '@reconai/shared';

const CATEGORIES = Object.values(DocumentCategory);

/** One queued file with its real Blob and chosen category. */
interface QFile {
  id: string;
  name: string;
  size: number;
  mime: string;
  file: File;
  category: string;
}

/** Active upload state: presigned PUT then confirm (worker processes after). */
interface UploadJob {
  name: string;
  busy: boolean;
  ok?: boolean;
  error?: string;
}

export default function EngagementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const q = useQueryClient();
  const { data: engagement, isLoading, error, refetch } = useEngagement(id);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [queued, setQueued] = useState<QFile[]>([]);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const invalidate = () => {
    void q.invalidateQueries({ queryKey: ['engagement', id] });
    void q.invalidateQueries({ queryKey: ['documents'] });
  };

  if (isLoading) return <Spinner label="Loading engagement" />;
  if (error || !engagement) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const client = engagement.client as { name: string; gstin: string | null; pan: string | null } | null;
  const checklist = Array.isArray(engagement.checklist) ? engagement.checklist : [];
  const documents = Array.isArray(engagement.documents) ? engagement.documents : [];
  const runs = Array.isArray(engagement.runs) ? engagement.runs : [];
  const workingPapers = Array.isArray(engagement.workingPapers) ? engagement.workingPapers : [];
  const members = Array.isArray(engagement.members) ? engagement.members : [];

  async function toggleChecklist(key: string) {
    try {
      await api.post<unknown>(`/engagements/${id}/checklist/${key}`);
      void q.invalidateQueries({ queryKey: ['engagement', id] });
    } catch {
      /* ignore */
    }
  }

  function pickFiles(files: FileList) {
    setUploadError(null);
    const added = Array.from(files).map((f) => ({
      id: `${Date.now()}-${f.name}`,
      name: f.name,
      size: f.size,
      mime: f.type || 'application/octet-stream',
      file: f,
      category: 'other',
    }));
    setQueued((q0) => [...q0, ...added]);
  }

  async function runUpload() {
    if (!queued.length || running) return;
    if (error || !engagement) return;
    setRunning(true);
    setUploadError(null);
    setJobs(queued.map((f) => ({ name: f.name, busy: true })));
    try {
      const res = await api.post<{ uploadId: string; uploads: { documentId: string; presignedUrl: string }[] }>(
        '/documents/upload-init',
        {
          engagementId: id,
          clientId: engagement.clientId,
          files: queued.map(({ name, size, mime }) => ({ name, size, mime })),
        },
      );
      const uploads = res.uploads;
      for (let i = 0; i < queued.length; i++) {
        const f = queued[i];
        const slot = uploads[i];
        setJobs((j) => j.map((j0, idx) => (idx === i ? { ...j0, busy: true } : j0)));
        if (!slot) {
          setJobs((j) => j.map((j0, idx) => (idx === i ? { ...j0, busy: false, error: 'No storage slot returned' } : j0)));
          continue;
        }
        try {
          // direct-to-storage PUT from the browser to the presigned URL
          const put = await fetch(slot.presignedUrl, { method: 'PUT', body: f.file });
          if (!put.ok) throw new Error(`Storage rejected the upload (HTTP ${put.status})`);
          await api.post<unknown>(`/documents/${slot.documentId}/confirm`, {
            uploadId: res.uploadId,
            fieldId: slot.documentId,
            category: f.category,
          });
          setJobs((j) => j.map((j0, idx) => (idx === i ? { ...j0, busy: false, ok: true } : j0)));
        } catch (err) {
          setJobs((j) => j.map((j0, idx) => (idx === i ? { ...j0, busy: false, error: err instanceof Error ? err.message : 'Upload failed' } : j0)));
        }
      }
      const failures = jobs.filter((j) => j.error).length;
      if (failures === 0 && queued.length) {
        setTimeout(() => {
          setUploadOpen(false);
          setQueued([]);
          setJobs([]);
          invalidate();
        }, 700);
      }
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Could not initiate the upload.');
      setJobs([]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <section className="flex flex-col gap-2">
        <Link href="/engagements" className="inline-flex items-center gap-1 font-mono text-[10px] text-mine-400 hover:text-white transition-colors uppercase tracking-wider">
          <Icon name="chevron_right" size={14} className="rotate-180" /> Engagements
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
                {engagement.title}
              </h1>
              <StatusBadge status={engagement.status} />
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-mine-400 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Icon name="corporate_fare" size={13} />
                {client?.name ?? '—'}
              </span>
              <span>·</span>
              <span>{label(engagement.kind)}</span>
              <span>·</span>
              <span>FY {engagement.financialYear?.start?.slice(0, 4) ?? '—'}</span>
            </div>
            {client?.gstin ? (
              <div className="flex gap-3 font-mono text-[10px] text-slate-500">
                {client.gstin ? <span>GST {client.gstin}</span> : null}
                {client.pan ? <span>PAN {client.pan}</span> : null}
              </div>
            ) : null}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" size="sm" icon="sync_alt" onClick={() => router.push(`/reconciliation?engagementId=${id}`)}>
              Reconcile
            </Button>
            <Button variant="secondary" size="sm" icon="account_balance" onClick={() => router.push(`/variance?engagementId=${id}`)}>
              P&L Variance
            </Button>
            <Button variant="secondary" size="sm" icon="receipt_long" onClick={() => router.push(`/tds?engagementId=${id}`)}>
              TDS Checklist
            </Button>
            <Button variant="secondary" size="sm" icon="upload" onClick={() => setUploadOpen(true)}>
              Upload
            </Button>
          </div>
        </div>
      </section>

      {/* Summary */}
      <section className="grid grid-cols-3 gap-2">
        {[
          { l: 'Runs Completed', v: engagement.summary?.completed ?? 0, tone: 'text-white' },
          { l: 'Matched', v: engagement.summary?.totalMatched ?? 0, tone: 'text-[#94bda4]' },
          { l: 'Unmatched', v: engagement.summary?.totalUnmatched ?? 0, tone: 'text-rose-300' },
        ].map((s) => (
          <GlassCard key={s.l} className="p-3.5">
            <div className="font-caps text-[9px] text-mine-400">{s.l}</div>
            <div className={`mt-1.5 text-xl font-mono font-medium tracking-tight ${s.tone}`}>{s.v}</div>
          </GlassCard>
        ))}
      </section>

      {/* Checklist */}
      {checklist.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionTitle
            title="Setup Checklist"
            trailing={
              <Badge tone="cyan" dot pulse>
                {checklist.filter((c: { done?: boolean }) => c.done).length}/{checklist.length}
              </Badge>
            }
          />
          <GlassCard className="divide-y divide-white/[0.06] overflow-hidden">
            {checklist.map((item: { key: string; label: string; done: boolean }) => (
              <button
                key={item.key}
                onClick={() => toggleChecklist(item.key)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                      item.done ? 'bg-cyan-400 border-cyan-400 text-slate-950' : 'border-zinc-700 text-transparent'
                    }`}
                  >
                    <Icon name="check" size={14} />
                  </span>
                  <span className={`text-[13px] ${item.done ? 'text-mine-400 line-through decoration-white/20' : 'text-slate-200'}`}>{item.label}</span>
                </span>
                <Icon name="chevron_right" size={15} className="text-mine-400/60" />
              </button>
            ))}
          </GlassCard>
        </section>
      ) : null}

      {/* Documents */}
      <section className="flex flex-col gap-2">
        <SectionTitle title="Source Documents" trailing={<Badge tone="dim">{documents.length}</Badge>} />
        {documents.length > 0 ? (
          <GlassCard className="divide-y divide-white/[0.06] overflow-hidden">
            {documents.map((d: { id: string; category: string | null; originalName: string; status: string; recordCount: number | null; createdAt: string }) => (
              <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-mine-400 shrink-0">
                    <Icon name="description" size={16} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] text-slate-200 truncate">{d.originalName}</span>
                    <span className="font-mono text-[10px] text-mine-400">
                      {d.category ? label(d.category) : 'Unclassified'} · {d.recordCount ?? 0} records · {timeAgo(d.createdAt)}
                    </span>
                  </div>
                </div>
                <StatusBadge status={d.status} />
              </div>
            ))}
          </GlassCard>
        ) : (
          <GlassCard className="p-5 flex items-center justify-between gap-3">
            <span className="text-xs text-mine-400">No documents uploaded for this engagement.</span>
            <Button variant="secondary" size="sm" icon="upload" onClick={() => setUploadOpen(true)}>
              Upload first file
            </Button>
          </GlassCard>
        )}
      </section>

      {/* Runs */}
      <section className="flex flex-col gap-2">
        <SectionTitle title="Reconciliation Runs" trailing={<Badge tone="dim">{runs.length}</Badge>} />
        {runs.length > 0 ? (
          <GlassCard className="divide-y divide-white/[0.06] overflow-hidden">
            {runs.map((r: { id: string; type: string; status: string; progress: number; createdAt: string; metrics?: Record<string, number> | null }) => (
              <Link key={r.id} href={`/reconciliation/${r.id}`} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center text-cyan-300 shrink-0">
                    <Icon name="sync_alt" size={16} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] text-slate-200 capitalize">{label(r.type)}</span>
                    <span className="font-mono text-[10px] text-mine-400">{timeAgo(r.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  {typeof r.metrics?.matchedCount === 'number' ? (
                    <span className="font-mono text-[11px] text-[#94bda4]">{r.metrics.matchedCount} matched</span>
                  ) : null}
                  <StatusBadge status={r.status} />
                  <Icon name="chevron_right" size={16} className="text-mine-400 group-hover:text-white" />
                </div>
              </Link>
            ))}
          </GlassCard>
        ) : (
          <GlassCard className="p-5 flex items-center justify-between gap-3">
            <span className="text-xs text-mine-400">No reconciliation runs yet.</span>
            <Button size="sm" icon="sync_alt" onClick={() => router.push(`/reconciliation?engagementId=${id}`)}>
              Start a run
            </Button>
          </GlassCard>
        )}
      </section>

      {/* Working papers + team */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <SectionTitle title="Working Papers" trailing={<Badge tone="dim">{engagement._count?.workingPapers ?? 0}</Badge>} />
          {workingPapers.length > 0 ? (
            <GlassCard className="divide-y divide-white/[0.06] overflow-hidden">
              {workingPapers.slice(0, 5).map((wp: { id: string; title: string; status: string }) => (
                <div key={wp.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <span className="text-[12px] text-slate-200 truncate">{wp.title}</span>
                  <StatusBadge status={wp.status} />
                </div>
              ))}
            </GlassCard>
          ) : (
            <GlassCard className="p-5 text-xs text-mine-400">No working papers drafted yet.</GlassCard>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <SectionTitle title="Team" trailing={<Badge tone="dim">{members.length}</Badge>} />
          <GlassCard className="p-4">
            {members.length > 0 ? (
              <div className="flex flex-col gap-2">
                {members.map((m: { id: string; user?: { id: string; name: string; email: string } }) => (
                  <div key={m.id} className="flex items-center justify-between gap-2">
                    <span className="text-[13px] text-slate-200">{m.user?.name ?? '—'}</span>
                    <span className="font-mono text-[10px] text-mine-400 truncate">{m.user?.email}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-xs text-mine-400">No members assigned.</span>
            )}
          </GlassCard>
        </div>
      </section>

      {/* Upload modal */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload source documents" eyebrow="Pipeline start" wide>
        <div className="flex flex-col gap-4">
          {uploadError ? <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{uploadError}</div> : null}
          <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-white/15 rounded-xl p-8 cursor-pointer hover:border-cyan-400/40 transition-colors">
            <input type="file" multiple className="hidden" onChange={(e) => e.target.files && pickFiles(e.target.files)} />
            <Icon name="upload" size={22} className="text-cyan-300" />
            <span className="text-[13px] text-slate-200">Drop files here or click to browse</span>
            <span className="font-mono text-[10px] text-mine-400">XLSX · CSV · PDF</span>
          </label>

          {queued.length > 0 ? (
            <div className="flex flex-col gap-2">
              {queued.map((f, i) => (
                <div key={f.id} className="flex flex-col gap-1.5 p-3 rounded-lg bg-white/[0.03] border border-white/[0.07]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-slate-200 truncate">{f.name}</span>
                    {jobs[i]?.ok ? <Icon name="check" size={15} className="text-emerald-400 shrink-0" /> : jobs[i]?.busy ? <Icon name="progress_activity" size={14} className="animate-spin text-accent-cyan shrink-0" /> : null}
                  </div>
                  {jobs[i]?.error ? <span className="text-[11px] text-rose-300">{jobs[i].error}</span> : null}
                  <Field label="Category">
                    <Select value={f.category} onChange={(e) => setQueued((q0) => q0.map((x, idx) => (idx === i ? { ...x, category: e.target.value } : x)))} className="py-1.5 text-[12px]">
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{label(c)}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setUploadOpen(false)} disabled={running}>
              Cancel
            </Button>
            <Button icon="upload" onClick={runUpload} disabled={!queued.length} loading={running}>
              Confirm &amp; Process
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SectionTitle({ title, trailing }: { title: string; trailing?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-mono text-[10px] uppercase tracking-widest text-mine-400">{title}</h2>
      {trailing}
    </div>
  );
}