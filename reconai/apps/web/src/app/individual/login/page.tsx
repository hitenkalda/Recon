'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Button, Logomark } from '@/components/ui/primitives';
import { Field, Input } from '@/components/ui/fields';
import { Icon } from '@/components/ui/icon';

export default function IndividualLoginPage() {
  const router = useRouter();
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
      await api.post('/individual/auth/login', { email, password });
      router.replace('/individual/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundColor: '#08090b',
        backgroundImage:
          'radial-gradient(circle at 50% 0%, rgba(103,232,249,0.06) 0%, transparent 55%), radial-gradient(circle at 100% 100%, rgba(30,41,59,0.25) 0%, transparent 50%)',
      }}
    >
      <div className="w-full max-w-md">
        <div className="relative rounded-xl overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(rgba(17,20,24,0.85) 0%, rgba(10,12,15,0.95) 100%)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow: 'rgba(0,0,0,0.7) 0px 25px 50px -12px, rgba(103,232,249,0.08) 0px 0px 40px -10px',
          }}
        >
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-40 rounded-full pointer-events-none blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(103,232,249,0.15) 0%, transparent 70%)' }} />

          <div className="relative z-10 p-6 sm:p-8 flex flex-col gap-5">
            {/* Brand */}
            <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <Logomark size={30} />
                <div className="flex flex-col leading-none">
                  <span className="text-[15px] font-bold tracking-[0.14em] text-white uppercase" style={{ fontFamily: 'var(--font-geist)' }}>
                    Recon<span style={{ color: '#67e8f9' }}>AI</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500 font-medium mt-0.5">Individual</span>
                </div>
              </div>
              <Link href="/pricing" className="text-[11px] text-zinc-500 hover:text-cyan-400 transition-colors">
                View Plans
              </Link>
            </div>

            {/* Title */}
            <div className="flex flex-col gap-1">
              <h1 className="text-[22px] font-semibold text-white tracking-[-0.02em] leading-tight" style={{ fontFamily: 'var(--font-geist)' }}>
                Sign in to your account
              </h1>
              <p className="text-[13px] text-zinc-400 leading-relaxed">Access your reconciliation workspace</p>
            </div>

            {/* Google button */}
            <a
              href="/api/individual/auth/google"
              className="w-full py-2.5 px-4 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-medium text-slate-200 hover:bg-white/8 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </a>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            {error ? (
              <div className="rounded-lg p-3 flex items-start gap-2 text-[12px] text-rose-300 border border-rose-500/30 bg-rose-950/30" role="alert">
                <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <form onSubmit={submit} className="flex flex-col gap-3.5">
              <Field label="Email" required>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </Field>

              <Field label="Password" required>
                <div className="relative">
                  <Input
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-2 text-zinc-500 hover:text-zinc-200 p-1 transition-colors" aria-label="Toggle password visibility">
                    <Icon name={show ? 'visibility_off' : 'visibility'} size={18} />
                  </button>
                </div>
              </Field>

              <Button type="submit" loading={submitting} size="lg" full className="mt-1">
                Sign In
              </Button>
            </form>

            <div className="pt-1 text-center">
              <span className="text-[12px] text-zinc-400">Don&apos;t have an account? </span>
              <Link className="text-[12px] font-medium text-cyan-300 hover:text-cyan-200 underline underline-offset-4 decoration-cyan-400/40 transition-all" href="/individual/signup">
                Sign up free
              </Link>
            </div>

            <div className="pt-1 text-center">
              <span className="text-[11px] text-zinc-500">Have a firm account? </span>
              <Link className="text-[11px] font-medium text-zinc-400 hover:text-white transition-colors" href="/login">
                Sign in as firm
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
