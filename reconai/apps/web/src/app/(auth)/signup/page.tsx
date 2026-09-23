'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/primitives';
import { Field, Input } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';
import { Suspense } from 'react';

function SignupForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { refresh } = useAuth();
  const inviteToken = search.get('token') ?? '';

  const [form, setForm] = useState({ name: '', email: '', password: '', firmName: '' });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors([]);
    if (form.password.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/signup', { ...form, inviteToken: inviteToken || undefined });
      await refresh();
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.details && typeof err.details === 'object') {
          setFieldErrors(Object.values(err.details as Record<string, unknown>).map(String));
        }
      } else {
        setError('Unable to create the account. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inviteMode = Boolean(inviteToken);

  return (
    <main className="w-full max-w-md p-4 relative z-10 my-8">
      <div className="relative w-full rounded-xl overflow-hidden shadow-2xl transition-all duration-300"
        style={{ background: 'linear-gradient(rgba(17,20,24,0.85) 0%, rgba(10,12,15,0.95) 100%)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: 'rgba(0,0,0,0.7) 0px 25px 50px -12px, rgba(255,255,255,0.05) 0px 0px 0px 1px, rgba(103,232,249,0.12) 0px 0px 40px -10px' }}>
        <div className="absolute -top-28 left-1/2 -translate-x-1/2 w-72 h-44 rounded-full pointer-events-none blur-3xl" style={{ background: 'radial-gradient(circle, rgba(103,232,249,0.18) 0%, transparent 70%)' }} />

        <div className="relative z-10 p-6 sm:p-8 flex flex-col gap-6">
          <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
            <div>
              <span className="text-[17px] font-bold tracking-[0.14em] text-white uppercase" style={{ fontFamily: 'var(--font-geist)' }}>
                Recon<span style={{ color: '#67e8f9' }}>AI</span>
              </span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-400 font-medium mt-1">Firm Onboarding</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <h1 className="text-[24px] font-semibold text-white tracking-[-0.03em] leading-tight" style={{ fontFamily: 'var(--font-geist)' }}>
              {inviteMode ? 'Join your firm' : 'Register your firm'}
            </h1>
            <p className="text-[13px] text-zinc-400 leading-relaxed">
              {inviteMode ? 'Accept the invitation and set up your credentials.' : 'Create a CA practice workspace with tenant-isolated client data.'}
            </p>
          </div>

          {error ? (
            <div className="rounded-lg p-3 flex items-start gap-2 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30" role="alert">
              <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span>{error}</span>
                {fieldErrors.map((fe, i) => (
                  <span key={i} className="text-rose-300/80">{fe}</span>
                ))}
              </div>
            </div>
          ) : null}

          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Full Name" required hint="as per PAN">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Partner Name" required minLength={2} autoComplete="name" />
            </Field>
            <Field label="Work Email Address" required>
              <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="partner@auditfirm.com" required autoComplete="email" />
            </Field>
            <Field label="Password" required hint="10+ characters">
              <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="••••••••••••••••" required minLength={10} autoComplete="new-password" className="tracking-[0.1em]" />
            </Field>
            {!inviteMode ? (
              <Field label="CA Firm Name" required hint="legal name">
                <Input value={form.firmName} onChange={(e) => set('firmName', e.target.value)} placeholder="M/s Rajesh & Co." required minLength={2} />
              </Field>
            ) : null}

            <Button type="submit" loading={submitting} size="lg" full iconRight="arrow_forward" className="mt-1">
              {inviteMode ? 'Accept Invitation' : 'Create Firm Workspace'}
            </Button>
          </form>

          <div className="pt-1 text-center">
            <span className="text-[12px] text-zinc-400">Already registered? </span>
            <Link className="text-[12px] font-medium text-cyan-300 hover:text-cyan-200 underline underline-offset-4 decoration-cyan-400/40 transition-all" href="/login">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}