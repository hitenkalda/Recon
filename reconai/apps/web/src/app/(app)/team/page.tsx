'use client';

import { useState } from 'react';
import { useTeam } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { GlassCard, Badge, Button, Spinner, ErrorState, StatusBadge } from '@/components/ui/primitives';
import { Field, Select, Input, Modal } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { label, timeAgo, initials } from '@/lib/format';

const ROLES = ['partner', 'senior', 'article', 'viewer'];
const ROLE_TONE: Record<string, 'cyan' | 'mint' | 'default' | 'dim'> = {
  partner: 'cyan',
  senior: 'mint',
  article: 'default',
  viewer: 'dim',
};

export default function TeamPage() {
  const { me, firm, refresh } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useTeam();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: '', role: 'senior' });
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [firmOpen, setFirmOpen] = useState(false);
  const [firmForm, setFirmForm] = useState({ name: firm?.name ?? '', gstin: firm?.gstin ?? '' });
  const [firmError, setFirmError] = useState<string | null>(null);

  async function sendInvite() {
    setInviteError(null);
    setInviteOk(null);
    setBusy(true);
    try {
      await api.post('/auth/invite', { email: invite.email, role: invite.role });
      setInviteOk(`Invitation sent to ${invite.email}.`);
      setInvite((f) => ({ ...f, email: '' }));
      setInviteOpen(false);
      void qc.invalidateQueries({ queryKey: ['team'] });
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Invite failed.');
    } finally {
      setBusy(false);
    }
  }

  async function updateFirm() {
    setFirmError(null);
    setBusy(true);
    try {
      await api.post('/auth/firm', { name: firmForm.name, gstin: firmForm.gstin || undefined });
      await refresh();
      setFirmOpen(false);
    } catch (err) {
      setFirmError(err instanceof ApiError ? err.message : 'Could not update firm settings.');
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <Spinner label="Loading team" />;
  if (error || !data) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  const members = data.items ?? [];

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <section className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium tracking-tight hero-title-gradient" style={{ fontFamily: 'var(--font-geist)' }}>
              Team & Settings
            </h1>
            <p className="text-xs text-mine-400 mt-1">{members.length} members · {firm?.name ?? 'Firm'}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" size="sm" icon="settings" onClick={() => setFirmOpen(true)}>Firm settings</Button>
            <Button icon="person" size="sm" onClick={() => setInviteOpen(true)}>Invite</Button>
          </div>
        </div>
      </section>

      {inviteOk ? (
        <div className="rounded-lg p-3 text-[12px] text-emerald-300 border border-emerald-500/30 bg-emerald-950/30">{inviteOk}</div>
      ) : null}

      {/* Firm card */}
      <GlassCard className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
            <Icon name="corporate_fare" size={20} className="text-cyan-300" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-medium text-white truncate">{firm?.name ?? 'Practice Firm'}</span>
            <span className="font-mono text-[10px] text-mine-400 flex flex-wrap gap-x-3">
              {firm?.gstin ? <span>GST {firm.gstin}</span> : null}
              {firm?.pan ? <span>PAN {firm.pan}</span> : null}
            </span>
          </div>
          <StatusBadge status="online" />
        </div>
      </GlassCard>

      {/* Members */}
      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-widest text-mine-400">Members</h2>
        <GlassCard className="divide-y divide-white/[0.06] overflow-hidden">
          {members.map((m) => (
            <div key={m.id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-[11px] font-mono font-semibold text-cyan-300 shrink-0">
                {initials(m.name)}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-white truncate">
                    {m.name}
                    {m.userId === me?.id ? <span className="text-mine-400 font-normal"> · you</span> : null}
                  </span>
                  <Badge tone={ROLE_TONE[m.role] ?? 'dim'}>{label(m.role)}</Badge>
                </div>
                <div className="font-mono text-[10px] text-mine-400 flex items-center gap-2">
                  <span className="truncate">{m.email}</span>
                  {m.lastLoginAt ? <span>· last {timeAgo(m.lastLoginAt)}</span> : null}
                </div>
              </div>
              <Badge tone={m.isActive ? 'mint' : 'dim'}>{m.isActive ? 'active' : 'inactive'}</Badge>
            </div>
          ))}
        </GlassCard>
      </section>

      <p className="text-center font-mono text-[9px] text-slate-500 tracking-wider pt-1">RBAC · ROLE-BASED ACCESS CONTROL ENFORCED</p>

      {/* Invite modal */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite team member" eyebrow="Team.manage gate">
        <div className="flex flex-col gap-4">
          {inviteError ? (
            <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{inviteError}</div>
          ) : null}
          <Field label="Email" required>
            <Input type="email" value={invite.email} onChange={(e) => setInvite((f) => ({ ...f, email: e.target.value }))} placeholder="ca@practice.in" required />
          </Field>
          <Field label="Role" required>
            <Select value={invite.role} onChange={(e) => setInvite((f) => ({ ...f, role: e.target.value }))}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{label(r)}</option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button icon="arrow_forward" onClick={() => void sendInvite()} loading={busy}>Send invite</Button>
          </div>
        </div>
      </Modal>

      {/* Firm settings modal */}
      <Modal open={firmOpen} onClose={() => setFirmOpen(false)} title="Firm settings" eyebrow="Firm.settings gate">
        <div className="flex flex-col gap-4">
          {firmError ? (
            <div className="rounded-lg p-3 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30">{firmError}</div>
          ) : null}
          <Field label="Firm name" required>
            <Input value={firmForm.name} onChange={(e) => setFirmForm((f) => ({ ...f, name: e.target.value }))} required />
          </Field>
          <Field label="GSTIN">
              <Input value={firmForm.gstin} onChange={(e) => setFirmForm((f) => ({ ...f, gstin: e.target.value.toUpperCase() }))} placeholder="27AAACS1232F1ZU" />
            </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setFirmOpen(false)}>Cancel</Button>
            <Button icon="check" onClick={() => void updateFirm()} loading={busy}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}