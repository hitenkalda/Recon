'use client';

import { useState } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useWorkingPaper } from '@/lib/hooks';
import { api, ApiError } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard, Badge, Button, Spinner, ErrorState, StatusBadge } from '@/components/ui/primitives';
import { Field, Textarea, Input } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo, date } from '@/lib/format';

const FLOW: { status: string; next: string; action: string; gate: string }[] = [
  { status: 'draft', next: 'ready_for_review', action: 'Send for review', gate: 'Anyone on the engagement' },
  { status: 'ready_for_review', next: 'senior_signed', action: 'Senior sign-off', gate: 'Senior or above' },
  { status: 'senior_signed', next: 'partner_signed', action: 'Partner sign-off', gate: 'Partner only · final' },
];

export default function WorkingPaperDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const qc = useQueryClient();
  const { data: wp, isLoading, error, refetch } = useWorkingPaper(id);

  const [procedures, setProcedures] = useState<string>('');
  const [conclusion, setConclusion] = useState('');
  const [reviewerNote, setReviewerNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  if (isLoading) return <Spinner label="Loading working paper" />;
  if (error || !wp) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const proceduresList = Array.isArray(wp.procedures) ? (wp.procedures as unknown as string[]) : [];
  const step = FLOW.findIndex((f) => f.status === wp.status);
  const nextStep = FLOW[step + 1];
  const showEditor = wp.status === 'draft' || wp.status === 'ready_for_review';

  async function saveContent() {
    setErrMsg(null);
    setOkMsg(null);
    const p = procedures.split('\n').map((s) => s.trim()).filter(Boolean);
    const payload: Record<string, unknown> = {};
    if (procedures.trim()) payload.procedures = p;
    if (conclusion.trim()) payload.conclusion = conclusion.trim();
    if (reviewerNote.trim()) payload.reviewerNote = reviewerNote.trim();
    if (!Object.keys(payload).length) return;
    setBusy(true);
    try {
      await api.patch(`/working-papers/${id}`, payload);
      setOkMsg('Content saved — evidence hash will update on next partner sign-off.');
      void qc.invalidateQueries({ queryKey: ['workingPaper', id] });
    } catch (err) {
      setErrMsg(err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  async function sign(next: string) {
    setErrMsg(null);
    setOkMsg(null);
    setBusy(true);
    try {
      await api.patch(`/working-papers/${id}`, { status: next });
      setOkMsg(`Status moved to ${label(next)}.`);
      void qc.invalidateQueries({ queryKey: ['workingPaper', id] });
      void qc.invalidateQueries({ queryKey: ['workingPapers'] });
    } catch (err) {
      setErrMsg(err instanceof ApiError ? err.message : 'Sign-off failed — check your role.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <section className="flex flex-col gap-2">
        <Link href="/working-papers" className="inline-flex items-center gap-1 font-mono text-[10px] text-mine-400 hover:text-white transition-colors uppercase tracking-wider">
          <Icon name="chevron_right" size={14} className="rotate-180" /> Working Papers
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
                {wp.title}
              </h1>
              <StatusBadge status={wp.status} />
              <Badge tone="dim">{label(wp.deliverable ?? '')}</Badge>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-mine-400 flex-wrap">
              <span className="inline-flex items-center gap-1"><Icon name="corporate_fare" size={13} />{wp.client?.name ?? '—'}</span>
              <span>·</span>
              <span>{wp.engagement?.title ?? '—'}</span>
              <span>·</span>
              <span>updated {timeAgo(wp.updatedAt ?? wp.createdAt)}</span>
            </div>
            {wp.evidenceHash ? (
              <div className="inline-flex items-center gap-2 font-mono text-[9px] text-slate-500 border border-white/[0.07] bg-white/[0.02] rounded-lg px-2.5 py-1 max-w-full">
                <Icon name="shield" size={11} className="text-emerald-400 shrink-0" />
                <span className="truncate">SHA-256 {wp.evidenceHash}</span>
                {wp.signedAt ? <span className="shrink-0 text-slate-600">· signed {date(wp.signedAt)}</span> : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            {wp.run ? (
              <Link href={`/reconciliation/${wp.run.id}`} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-medium text-white bg-white/[0.05] border border-white/10 hover:bg-white/[0.09] transition-colors">
                <Icon name="sync_alt" size={14} className="text-cyan-300" /> {label(wp.run.type)} run
              </Link>
            ) : null}
            <Link href={`/reports`} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-medium text-white bg-white/[0.05] border border-white/10 hover:bg-white/[0.09] transition-colors">
              <Icon name="description" size={14} className="text-cyan-300" /> Export report
            </Link>
          </div>
        </div>
      </section>

      {errMsg ? <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{errMsg}</div> : null}
      {okMsg ? <div className="rounded-lg p-3 text-[12px] text-emerald-300 border border-emerald-500/30 bg-emerald-950/30">{okMsg}</div> : null}

      {/* Sign-off flow */}
      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-mine-400">Two-step Sign-off</h2>
        <GlassCard className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            {['draft', 'ready_for_review', 'senior_signed', 'partner_signed'].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-wider ${
                    i <= step ? 'border-cyan-400/40 bg-cyan-950/30 text-cyan-200' : 'border-white/[0.08] text-mine-400'
                  }`}
                >
                  {i <= step ? <Icon name="check" size={11} /> : null}
                  {label(s)}
                </span>
                {i < 3 ? <Icon name="chevron_right" size={13} className="text-slate-600" /> : null}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {nextStep && showEditor ? (
              <Button size="sm" icon="check" onClick={() => void sign(nextStep.next)} loading={busy}>
                {nextStep.action}
              </Button>
            ) : wp.status === 'partner_signed' ? (
              <Badge tone="mint" dot pulse>Final — signed</Badge>
            ) : null}
            <span className="font-mono text-[9px] text-mine-400 hidden sm:inline">{nextStep?.gate ?? 'Complete'}</span>
          </div>
        </GlassCard>
      </section>

      {/* Content editor + evidence */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-mine-400">Procedures</h2>
          <GlassCard className="p-4">
            {showEditor ? (
              <Field label="One per line">
                <Textarea
                  value={procedures || proceduresList.join('\n')}
                  onChange={(e) => setProcedures(e.target.value)}
                  rows={9}
                  placeholder={'Vouch purchase ledger invoices to GSTR-2B\nConfirm ITC eligibility for each vendor\n...'}
                />
              </Field>
            ) : (
              <ul className="flex flex-col gap-2">
                {proceduresList.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-slate-300 leading-relaxed">
                    <Icon name="check" size={13} className="text-[#94bda4] shrink-0 mt-0.5" />
                    {p}
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-mine-400">Conclusion & Review</h2>
          <GlassCard className="p-4 flex flex-col gap-4">
            {showEditor ? (
              <Field label="Conclusion">
                <Textarea value={conclusion || (wp.conclusion ?? '')} onChange={(e) => setConclusion(e.target.value)} rows={4} placeholder="Draw a conclusion once procedures are complete…" />
              </Field>
            ) : wp.conclusion ? (
              <p className="text-[13px] text-slate-300 leading-relaxed border-l-2 border-[#94bda4]/50 pl-3">{wp.conclusion}</p>
            ) : (
              <p className="text-xs text-mine-400">No conclusion recorded.</p>
            )}
            {showEditor ? (
              <Field label="Reviewer note">
                <Input value={reviewerNote || (wp.reviewerNote ?? '')} onChange={(e) => setReviewerNote(e.target.value)} placeholder="Optional note for the reviewer" />
              </Field>
            ) : wp.reviewerNote ? (
              <div className="text-[11px] text-slate-400">
                <span className="font-caps text-[9px] text-mine-400 tracking-widest block mb-0.5">Reviewer note</span>
                {wp.reviewerNote}
              </div>
            ) : null}
            {showEditor ? (
              <Button variant="secondary" size="sm" icon="check" onClick={() => void saveContent()} loading={busy}>
                Save content
              </Button>
            ) : null}
          </GlassCard>
        </div>
      </section>

      {/* Related reports */}
      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-mine-400">Linked Reports</h2>
        <GlassCard className="p-4">
          {wp.reports && (wp.reports as unknown as unknown[]).length ? (
            <div className="flex flex-col divide-y divide-white/[0.06]">
              {(wp.reports as unknown as { id: string; format: string; createdAt: string }[]).map((r) => (
                <div key={r.id} className="py-2.5 flex items-center justify-between">
                  <span className="text-[12px] text-slate-200">{label(r.format)} · {timeAgo(r.createdAt)}</span>
                  <Link href="/reports" className="text-[12px] text-cyan-300 hover:underline">View all reports</Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-mine-400">No reports generated from this paper yet.</p>
          )}
        </GlassCard>
      </section>

      <p className="text-center font-mono text-[9px] text-slate-500 tracking-wider">SA 230 · AUDIT FILE EVIDENCE HASH LOCKED</p>
    </div>
  );
}