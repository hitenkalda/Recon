'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Logomark } from '@/components/ui/primitives';
import { Field, Input } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/login', { email, password });
      await refresh();
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="w-full max-w-md p-4 relative z-10 my-8">
      <div className="flex flex-col w-full">
        <div className="relative w-full rounded-xl overflow-hidden shadow-2xl transition-all duration-300"
          style={{ background: 'linear-gradient(rgba(17,20,24,0.85) 0%, rgba(10,12,15,0.95) 100%)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: 'rgba(0,0,0,0.7) 0px 25px 50px -12px, rgba(255,255,255,0.05) 0px 0px 0px 1px, rgba(103,232,249,0.12) 0px 0px 40px -10px' }}>
          <div className="absolute -top-28 left-1/2 -translate-x-1/2 w-72 h-44 rounded-full pointer-events-none blur-3xl" style={{ background: 'radial-gradient(circle, rgba(103,232,249,0.18) 0%, transparent 70%)' }} />
          <div className="absolute -bottom-24 -right-24 w-60 h-60 rounded-full pointer-events-none blur-3xl" style={{ background: 'radial-gradient(circle, rgba(84,216,232,0.08) 0%, transparent 70%)' }} />

          <div className="relative z-10 p-6 sm:p-8 flex flex-col gap-6">
            {/* Brand */}
            <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <Logomark size={34} />
                <div className="flex flex-col leading-none">
                  <span className="text-[17px] font-bold tracking-[0.14em] text-white uppercase" style={{ fontFamily: 'var(--font-geist)' }}>
                    Recon<span style={{ color: '#67e8f9' }}>AI</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-400 font-medium mt-1">Defense Platform</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[#67e8f9] border border-cyan-400/25" style={{ background: 'rgba(103,232,249,0.06)', boxShadow: 'inset 0 0 8px rgba(103,232,249,0.1)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="font-mono text-[10px] tracking-wider uppercase font-semibold text-cyan-300">SYS:ONLINE</span>
              </div>
            </div>

            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[26px] font-semibold text-white tracking-[-0.03em] leading-tight" style={{ fontFamily: 'var(--font-geist)' }}>
                Institutional Sign-In
              </h1>
              <p className="text-[13px] text-zinc-400 leading-relaxed">Autonomous Financial Ledger Defense &amp; Audit Portal</p>
            </div>

            {error ? (
              <div className="rounded-lg p-3 flex items-start gap-2 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30" role="alert">
                <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <form onSubmit={submit} className="flex flex-col gap-4">
              <Field label="Work Email Address" required hint="required">
                <div className="relative">
                  <Input
                    type="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="partner@auditfirm.com"
                    required
                    autoComplete="email"
                    className="pr-10"
                  />
                  <Icon name="person" size={18} className="absolute right-3.5 top-2.5 text-zinc-500 pointer-events-none" />
                </div>
              </Field>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label htmlFor="work-password" className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-300">
                    Security Key / Password
                  </label>
                  <a className="text-[11px] text-zinc-400 hover:text-cyan-300 transition-colors font-medium" href="/forgot-password">
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <Input
                    type={show ? 'text' : 'password'}
                    name="password"
                    id="work-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••••••"
                    required
                    autoComplete="current-password"
                    className="pr-10 tracking-[0.1em]"
                  />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-2 text-zinc-500 hover:text-zinc-200 p-1 transition-colors flex items-center justify-center" aria-label="Toggle password visibility">
                    <Icon name={show ? 'visibility_off' : 'visibility'} size={18} />
                  </button>
                </div>
              </div>

              <Button type="submit" loading={submitting} size="lg" full iconRight="arrow_forward" className="mt-1.5">
                <span>Initialize Session</span>
              </Button>
            </form>

            {/* Security card */}
            <div className="rounded-lg p-3 flex flex-col gap-1.5 border border-cyan-500/20" style={{ background: 'linear-gradient(135deg, rgba(8,28,36,0.5) 0%, rgba(13,17,23,0.5) 100%)' }}>
              <div className="flex items-center justify-between text-cyan-300">
                <div className="flex items-center gap-1.5">
                  <Icon name="verified" size={15} className="text-cyan-400" />
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase font-bold">Verified Vault Telemetry</span>
                </div>
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded text-cyan-300 border border-cyan-400/25 bg-cyan-900/30 font-medium">FIPS 140-3</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">SOC 2 Type II Certified • 256-Bit Financial Encryption • Zero Data Retention Architecture</p>
            </div>

            <div className="pt-1 text-center">
              <span className="text-[12px] text-zinc-400">Don&apos;t have a firm account? </span>
              <Link className="text-[12px] font-medium text-cyan-300 hover:text-cyan-200 underline underline-offset-4 decoration-cyan-400/40 transition-all" href="/signup">
                Register firm
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}