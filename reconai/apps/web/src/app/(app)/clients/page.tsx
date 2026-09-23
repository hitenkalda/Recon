'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useClients, useCreateClient, ApiError } from '@/lib/hooks';
import { validateGSTIN, validatePAN, validateTAN, validateCIN } from '@reconai/shared';
import { GlassCard, Badge, Button, Spinner, ErrorState, StateBlock } from '@/components/ui/primitives';
import { SearchInput, Field, Input, Select, Modal } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo } from '@/lib/format';
import { clsx } from 'clsx';

const TYPES = ['company', 'llp', 'partnership', 'proprietorship', 'trust', 'individual'];
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active_gst', label: 'Active GST' },
  { key: 'tax_audit', label: 'Tax Audit' },
];

const empty = { name: '', type: 'company', gstin: '', pan: '', tan: '', cin: '', address: '' };

export default function ClientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState<string | null>(null);

  const query = useMemo(() => ({ search: search || undefined, filter: filter === 'all' ? undefined : filter }), [search, filter]);
  const { data, isLoading, error, refetch } = useClients(query);
  const createClient = useCreateClient();

  function set<K extends keyof typeof empty>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((fe) => ({ ...fe, [k]: '' }));
  }

  async function submit() {
    setCreateError(null);
    const fe: Record<string, string> = {};
    if (form.gstin) {
      const g = validateGSTIN(form.gstin);
      if (!g.valid) fe.gstin = g.reason ?? 'Invalid GSTIN';
    }
    if (form.pan) {
      const p = validatePAN(form.pan);
      if (!p.valid) fe.pan = p.reason ?? 'Invalid PAN';
    }
    if (form.tan) {
      const t = validateTAN(form.tan);
      if (!t.valid) fe.tan = t.reason ?? 'Invalid TAN';
    }
    if (form.cin) {
      const c = validateCIN(form.cin);
      if (!c.valid) fe.cin = c.reason ?? 'Invalid CIN';
    }
    if (Object.keys(fe).length) {
      setFieldErrors(fe);
      return;
    }
    try {
      await createClient.mutateAsync({
        name: form.name,
        type: form.type,
        gstin: form.gstin || undefined,
        pan: form.pan || undefined,
        tan: form.tan || undefined,
        cin: form.cin || undefined,
        address: form.address || undefined,
        tags: filter === 'tax_audit' && form.type ? ['tax_audit'] : [],
      });
      setForm(empty);
      setCreateOpen(false);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Unable to create client.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
              Client Management
            </h1>
            <p className="text-xs text-mine-400 mt-1">{data?.total ?? 0} audit entities · tenant-scoped</p>
          </div>
          <Button icon="plus" onClick={() => setCreateOpen(true)} size="sm">Add Client</Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, GSTIN, PAN…" className="flex-1" />
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={clsx(
                  'px-3 py-2 rounded-full font-mono text-[11px] uppercase tracking-wider border transition-all',
                  filter === f.key ? 'bg-white text-slate-950 border-white' : 'text-mine-400 border-white/[0.08] hover:text-white',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? <Spinner label="Loading clients" /> : null}
      {!isLoading && error ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> : null}

      {!isLoading && !error && data?.items.length === 0 ? (
        <StateBlock
          icon="corporate_fare"
          title="No clients yet"
          body="Create your first client to begin organizing engagements, reconciliations and working papers."
          action={<Button icon="plus" size="sm" onClick={() => setCreateOpen(true)}>Add Client</Button>}
        />
      ) : null}

      {!isLoading && !error && data && data.items.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {data.items.map((c) => (
            <GlassCard key={c.id} interactive className="p-4 flex flex-col gap-3" onClick={() => router.push(`/engagements?clientId=${c.id}`)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-sm font-medium text-white truncate">{c.name}</span>
                  <Badge tone="dim">{label(c.type)}</Badge>
                </div>
                <StatusDot status={c.status} />
              </div>
              <div className="flex flex-col gap-1 font-mono text-[11px] text-mine-400">
                {c.gstin ? <Code label="GST" value={c.gstin} /> : null}
                {c.pan ? <Code label="PAN" value={c.pan} /> : null}
                {c.tan ? <Code label="TAN" value={c.tan} /> : null}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
                <div className="flex items-center gap-3 font-mono text-[10px] text-mine-400">
                  <span>{c.engagementsCount ?? 0} engagements</span>
                  <span>·</span>
                  <span>{timeAgo(c.updatedAt)}</span>
                </div>
                <Icon name="arrow_outward" size={14} className="text-mine-400" />
              </div>
            </GlassCard>
          ))}
        </div>
      ) : null}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Register Client" eyebrow="New audit entity" wide>
        <div className="flex flex-col gap-4">
          {createError ? (
            <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{createError}</div>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Legal Name" required error={fieldErrors.name} className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="M/s Delta Traders" required />
            </Field>
            <Field label="Entity Type" required>
              <Select value={form.type} onChange={(e) => set('type', e.target.value)}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{label(t)}</option>
                ))}
              </Select>
            </Field>
            <Field label="GSTIN" error={fieldErrors.gstin}>
              <Input value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="27AAACS1232F1ZU" />
            </Field>
            <Field label="PAN" error={fieldErrors.pan}>
              <Input value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} placeholder="AAACS1232F" />
            </Field>
            <Field label="TAN" error={fieldErrors.tan}>
              <Input value={form.tan} onChange={(e) => set('tan', e.target.value.toUpperCase())} placeholder="PNAS01234A" />
            </Field>
            <Field label="CIN" error={fieldErrors.cin} className="sm:col-span-2">
              <Input value={form.cin} onChange={(e) => set('cin', e.target.value.toUpperCase())} placeholder="L99999MH2000PLC123456" />
            </Field>
            <Field label="Registered Address" className="sm:col-span-2">
              <Input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="City, State" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button icon="check" onClick={submit} loading={createClient.isPending}>Create Client</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const tone = status === 'active' ? 'bg-emerald-400' : status === 'inactive' ? 'bg-amber-400' : 'bg-slate-600';
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase text-mine-400 tracking-wider">
      <span className={clsx('w-1.5 h-1.5 rounded-full', tone)} />
      {status}
    </span>
  );
}

function Code({ label: l, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-slate-500 w-8 shrink-0">{l}</span>
      <span className="text-slate-300 font-medium tracking-wide truncate">{value}</span>
    </span>
  );
}