'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { GlassCard, SectionHeading, Spinner } from '@/components/ui/primitives';
import { Button } from '@/components/ui/primitives';
import { Field, Select } from '@/components/ui/fields';

interface RecordOption {
  id: string;
  title: string;
  type: string;
}

interface DocOption {
  id: string;
  originalName: string;
  status: string;
}

export default function ReconcilePage() {
  const [records, setRecords] = useState<RecordOption[]>([]);
  const [documents, setDocuments] = useState<DocOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordId, setRecordId] = useState('');
  const [runType, setRunType] = useState('gst');
  const [sourceAId, setSourceAId] = useState('');
  const [sourceBId, setSourceBId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ items: RecordOption[] }>('/individual/records').catch(() => ({ items: [] })),
      api.get<{ items: DocOption[] }>('/individual/documents').catch(() => ({ items: [] })),
    ]).then(([recordsRes, docsRes]) => {
      setRecords(recordsRes.items || []);
      setDocuments(docsRes.items || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    try {
      const payload: Record<string, unknown> = {
        recordId,
        type: runType as 'gst' | 'bank' | 'ais_26as',
        sourceAId,
      };
      if (sourceBId) payload.sourceBId = sourceBId;

      await api.post('/individual/reconciliations', payload);
      // Redirect to dashboard after successful submission
      window.location.href = '/individual/dashboard';
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create reconciliation');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Spinner label="Loading..." />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
        Reconcile
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <GlassCard className="p-5 flex flex-col gap-4">
          <SectionHeading title="New Reconciliation" eyebrow="Create" />

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Field label="Record" required>
              <Select value={recordId} onChange={(e) => setRecordId(e.target.value)}>
                <option value="">Select a record...</option>
                {records.map((r) => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </Select>
            </Field>

            <Field label="Reconciliation Type" required>
              <Select value={runType} onChange={(e) => setRunType(e.target.value)}>
                <option value="gst">GST (GSTR-2B)</option>
                <option value="bank">Bank Statement</option>
                <option value="ais_26as">AIS / 26AS</option>
              </Select>
            </Field>

            <Field label="Source A (Primary)" required hint="Main document">
              <Select value={sourceAId} onChange={(e) => setSourceAId(e.target.value)}>
                <option value="">Select document...</option>
                {documents.filter(d => d.status === 'stored').map((d) => (
                  <option key={d.id} value={d.id}>{d.originalName}</option>
                ))}
              </Select>
            </Field>

            <Field label="Source B (Optional)" hint="Second document for matching">
              <Select value={sourceBId} onChange={(e) => setSourceBId(e.target.value)}>
                <option value="">No secondary document</option>
                {documents.filter(d => d.status === 'stored').map((d) => (
                  <option key={d.id} value={d.id}>{d.originalName}</option>
                ))}
              </Select>
            </Field>

            {submitError ? (
              <div className="rounded-lg p-3 text-xs text-rose-300 border border-rose-500/30 bg-rose-950/30">
                {submitError}
              </div>
            ) : null}

            <Button type="submit" loading={submitting} variant="primary" full>
              Start Reconciliation
            </Button>
          </form>
        </GlassCard>

        {/* Recent Runs */}
        <div className="flex flex-col gap-4">
          <SectionHeading title="Recent Runs" />
          <GlassCard className="p-4">
            <div className="text-xs text-mine-400 text-center py-8">
              No recent reconciliation runs
            </div>
          </GlassCard>

          {/* Quick Tips */}
          <GlassCard className="p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-mine-400 mb-3">Tips</div>
            <ul className="text-xs text-slate-300 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>Upload your documents first before starting reconciliation</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>GST reconciliation compares GSTR-2B with purchase register</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>Bank reconciliation matches bank statements with ledger</span>
              </li>
            </ul>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
