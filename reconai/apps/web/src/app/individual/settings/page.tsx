'use client';

import { useEffect, useState } from 'react';
import { api, type IndividualPlansResponse } from '@/lib/api';
import { GlassCard, SectionHeading, Spinner, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/primitives';

export default function SettingsPage() {
  const [profile, setProfile] = useState<{ name: string; email: string; plan: string } | null>(null);
  const [plans, setPlans] = useState<IndividualPlansResponse['plans'] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<{ user: { name: string; email: string }; profile: { plan: string } }>('/individual/auth/me').catch(() => null),
      api.get<IndividualPlansResponse>('/individual/plans').catch(() => null),
    ]).then(([meRes, plansRes]) => {
      if (meRes) {
        setProfile({
          name: meRes.user.name,
          email: meRes.user.email,
          plan: meRes.profile.plan,
        });
      }
      if (plansRes) {
        setPlans(plansRes.plans);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading..." />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-white" style={{ fontFamily: 'var(--font-geist)' }}>
        Settings
      </h1>

      {/* Profile Section */}
      <GlassCard className="p-5 flex flex-col gap-4">
        <SectionHeading title="Profile" eyebrow="Account" />
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between py-2 border-b border-white/[0.05]">
            <span className="text-xs font-mono uppercase tracking-wider text-mine-400">Name</span>
            <span className="text-[13px] text-slate-200">{profile?.name ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-white/[0.05]">
            <span className="text-xs font-mono uppercase tracking-wider text-mine-400">Email</span>
            <span className="text-[13px] text-slate-200">{profile?.email ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-xs font-mono uppercase tracking-wider text-mine-400">Plan</span>
            <Badge tone={profile?.plan === 'pro' ? 'mint' : profile?.plan === 'basic' ? 'cyan' : 'dim'}>
              {profile?.plan?.toUpperCase() ?? 'FREE'}
            </Badge>
          </div>
        </div>
      </GlassCard>

      {/* Plan Upgrades */}
      {plans && plans.length > 0 ? (
        <GlassCard className="p-5 flex flex-col gap-4">
          <SectionHeading title="Plans & Pricing" eyebrow="Upgrade" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`p-4 rounded-lg border transition-colors ${
                  profile?.plan === plan.id
                    ? 'border-cyan-500/30 bg-cyan-950/20'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">{plan.name}</span>
                  {profile?.plan === plan.id ? (
                    <Badge tone="cyan">Current</Badge>
                  ) : null}
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-lg font-bold text-white">
                    {plan.price === 0 ? 'Free' : `₹${plan.price.toLocaleString()}`}
                  </span>
                  {plan.monthly ? <span className="text-xs text-mine-400">/month</span> : null}
                </div>
                <ul className="text-xs text-slate-400 space-y-1.5 mb-4">
                  {plan.features.slice(0, 3).map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-0.5 shrink-0">•</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {plan.price > 0 ? (
                  <Button size="sm" variant="secondary" full>
                    Upgrade
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </GlassCard>
      ) : null}

      {/* Danger Zone */}
      <GlassCard className="p-5 flex flex-col gap-4">
        <SectionHeading title="Danger Zone" eyebrow="Alert" />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-medium text-slate-200">Delete Account</div>
            <div className="text-xs text-mine-400 mt-0.5">Permanently delete your account and all data</div>
          </div>
          <Button size="sm" variant="danger">
            Delete
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
