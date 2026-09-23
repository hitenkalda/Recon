'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useClients, useEngagements, useCreateEngagement, ApiError } from '@/lib/hooks';
import { GlassCard, Button, Spinner, ErrorState, StateBlock, StatusBadge } from '@/components/ui/primitives';
import { SearchInput, Field, Input, Select } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { label } from '@/lib/format';
import { Modal } from '@/components/ui/fields';
import { Suspense } from 'react';

const KINDS = ['gst_compliance', 'tax_audit', 'reconciliation', 'management_audit', 'other'];
const FY = ['2025-04-01', '2026-03-31'];

function Engagements() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = searchParams.get('clientId') ?? undefined;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    clientId: clientId ?? '',
    title: '',
    kind: 'gst_compliance',
    fyStart: '2025-04-01',
    fyEnd: '2026-03-31',
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const query = useMemo(() => ({ search: search || undefined, status: status === 'all' ? undefined : status, clientId }), [search, status, clientId]);
  const { data, isLoading, error, refetch } = useEngagements(query);
  const clients = useClients();
  const createEngagement = useCreateEngagement();

  async function submit() {
    setCreateError(null);
    try {
      await createEngagement.mutateAsync({
        clientId: form.clientId,
        title: form.title,
        kind: form.kind,
        financialYear: { start: form.fyStart, end: form.fyEnd },
        scope: { months: { from: form.fyStart, to: form.fyEnd } },
      });
      setCreateOpen(false);
      setForm({ clientId: '', title: '', kind: 'gst_compliance', fyStart: FY[0], fyEnd: FY[1] });
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Unable to create engagement.');
    }
  }

  const statuses = ['all', 'in_setup', 'in_progress', 'under_review', 'completed'];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
            Engagements
          </h1>
          <p className="text-xs text-mine-400 mt-1">{data?.total ?? 0} workstreams</p>
        </div>
        <Button icon="plus" size="sm" onClick={() => setCreateOpen(true)}>New Engagement</Button>
      </div>

      <div className="flex flex-col gap-2">
        <SearchInput value={search} onChange={setSearch} placeholder="Search engagements…" />
        <div className="flex gap-1.5 flex-wrap">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider border transition-all ${status === s ? 'bg-white text-slate-950 border-white' : 'text-mine-400 border-white/[0.08] hover:text-white'}`}
            >
              {s === 'all' ? 'All' : label(s)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <Spinner label="Loading engagements" /> : null}
      {!isLoading && error ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> : null}
      {!isLoading && !error && data?.items.length === 0 ? (
        <StateBlock
          icon="folder"
          title="No engagements"
          body="Create an engagement to drive reconciliations, working papers and reports for a client."
          action={<Button icon="plus" size="sm" onClick={() => setCreateOpen(true)}>New Engagement</Button>}
        />
      ) : null}

      {!isLoading && !error && data && data.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {data.items.map((e) => (
            <GlassCard key={e.id} interactive className="p-4 flex items-center justify-between gap-3" onClick={() => router.push(`/engagements/${e.id}`)}>
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white truncate">{e.title}</span>
                  <StatusBadge status={e.status} />
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] text-mine-400 flex-wrap">
                  <span className="inline-flex items-center gap-1"><Icon name="corporate_fare" size={12} />{e.client?.name ?? '—'}</span>
                  <span>·</span>
                  <span>{label(e.kind)}</span>
                  <span>·</span>
                  <span>FY {e.financialYear.start.split('-')[0] ?? e.financialYear.start}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {typeof e.progressPercent === 'number' ? (
                  <span className="font-mono text-[11px] text-accent-cyan">{e.progressPercent}%</span>
                ) : null}
                {e._count ? (
                  <span className="font-mono text-[10px] text-mine-400 hidden sm:inline">
                    {e._count.documents} docs · {e._count.runs} runs
                  </span>
                ) : null}
                <Icon name="chevron_right" size={18} className="text-mine-400" />
              </div>
            </GlassCard>
          ))}
        </div>
      ) : null}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Engagement" eyebrow="From client setup" wide>
        <div className="flex flex-col gap-4">
          {createError ? <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{createError}</div> : null}
          <Field label="Client" required>
            <Select value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}>
              <option value="">Select client…</option>
              {clients.data?.items.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Engagement Title" required>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="FY 2025-26 GST reconciliation" required />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type" required>
              <Select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                {KINDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}
              </Select>
            </Field>
            <Field label="Financial Year">
              <Select value={form.fyStart} onChange={(e) => setForm((f) => ({ ...f, fyStart: e.target.value }))}>
                <option value="2025-04-01">FY 2025-26</option>
                <option value="2024-04-01">FY 2024-25</option>
                <option value="2026-04-01">FY 2026-27</option>
              </Select>
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button icon="check" onClick={submit} loading={createEngagement.isPending}>Create Engagement</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function EngagementsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading engagements" />}>
      <Engagements />
    </Suspense>
  );
}