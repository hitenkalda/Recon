'use client';

import Link from 'next/link';
import { clsx } from 'clsx';
import { Icon, type IconName } from './icon';

/* ── Button ─────────────────────────────────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

const BTN: Record<ButtonVariant, string> = {
  primary:
    'bg-white text-slate-950 hover:bg-slate-100 shadow-[0_4px_20px_rgba(0,240,255,0.18)] active:scale-[0.98]',
  secondary:
    'bg-white/[0.06] border border-white/15 text-white hover:bg-white/10 active:scale-[0.98]',
  ghost: 'text-mine-400 hover:text-white hover:bg-white/[0.05]',
  danger: 'bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 active:scale-[0.98]',
  outline: 'border border-white/10 text-white hover:border-white/25 active:scale-[0.98]',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: IconName;
  iconRight?: IconName;
  size?: 'sm' | 'md' | 'lg';
  full?: boolean;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  icon,
  iconRight,
  size = 'md',
  full,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const sizes = {
    sm: 'px-3 py-1.5 text-[11px] gap-1.5 rounded-lg',
    md: 'px-4 py-2.5 text-xs gap-2 rounded-lg',
    lg: 'px-5 py-3 text-xs gap-2 rounded-xl',
  };
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center font-semibold uppercase tracking-[0.08em]',
        'transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none',
        'font-mono',
        sizes[size],
        BTN[variant],
        full && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Icon name="progress_activity" size={size === 'sm' ? 13 : 15} className="animate-spin" />
      ) : icon ? (
        <Icon name={icon} size={size === 'sm' ? 13 : 15} />
      ) : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 13 : 15} /> : null}
    </button>
  );
}

interface ButtonLinkProps {
  href: string;
  variant?: ButtonVariant;
  icon?: IconName;
  iconRight?: IconName;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}

export function ButtonLink({
  href,
  variant = 'primary',
  icon,
  iconRight,
  size = 'md',
  className,
  children,
}: ButtonLinkProps) {
  const sizes = {
    sm: 'px-3 py-1.5 text-[11px] gap-1.5 rounded-lg',
    md: 'px-4 py-2.5 text-xs gap-2 rounded-lg',
    lg: 'px-5 py-3 text-xs gap-2 rounded-xl',
  };
  return (
    <Link
      href={href}
      className={clsx(
        'inline-flex items-center justify-center font-semibold uppercase tracking-[0.08em]',
        'transition-all duration-200 font-mono',
        sizes[size],
        BTN[variant],
        className,
      )}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 13 : 15} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 13 : 15} /> : null}
    </Link>
  );
}

/* ── GlassCard ───────────────────────────────────────────────────────── */

export function GlassCard({
  className,
  interactive,
  children,
  onClick,
}: {
  className?: string;
  interactive?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'rounded-xl shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_8px_32px_rgba(0,0,0,0.35)]',
        interactive ? 'glass-card-interactive cursor-pointer' : 'glass-card',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── Badge / tag ─────────────────────────────────────────────────────── */

type Tone = 'default' | 'cyan' | 'mint' | 'teal' | 'success' | 'warning' | 'danger' | 'critical' | 'blue' | 'dim';

const TONE: Record<Tone, string> = {
  default: 'border-white/10 bg-white/[0.04] text-slate-300',
  cyan: 'border-cyan-500/30 bg-cyan-950/40 text-cyan-300',
  mint: 'border-[#94bda4]/25 bg-[#94bda4]/10 text-[#9fd0b8]',
  teal: 'border-[#4ecdc4]/25 bg-[#4ecdc4]/10 text-[#5fe0d7]',
  success: 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300',
  warning: 'border-amber-500/30 bg-amber-950/40 text-amber-300',
  danger: 'border-rose-500/40 bg-rose-950/40 text-rose-300',
  critical: 'border-pink-500/40 bg-pink-950/40 text-pink-300',
  blue: 'border-blue-500/30 bg-blue-950/40 text-blue-300',
  dim: 'border-white/5 bg-white/[0.02] text-slate-500',
};

export function Badge({
  tone = 'default',
  dot,
  pulse,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border',
        TONE[tone],
        className,
      )}
    >
      {dot ? (
        <span
          className={clsx(
            'w-1.5 h-1.5 rounded-full',
            pulse ? 'animate-pulse-dot' : '',
            tone === 'cyan'
              ? 'bg-accent-cyan'
              : tone === 'success'
                ? 'bg-emerald-400'
                : tone === 'danger' || tone === 'critical'
                  ? 'bg-rose-400'
                  : tone === 'warning'
                    ? 'bg-amber-400'
                    : tone === 'mint'
                      ? 'bg-[#94bda4]'
                      : tone === 'blue'
                        ? 'bg-blue-400'
                        : 'bg-slate-400',
          )}
        />
      ) : null}
      {children}
    </span>
  );
}

/** Maps a status enum value → badge tone, so pages stay consistent. */
export function statusTone(status: string | null | undefined): Tone {
  if (!status) return 'dim';
  if (['completed', 'resolved', 'records_ready', 'validated', 'signed', 'active', 'success'].includes(status))
    return 'success';
  if (['queued', 'uploaded', 'stored', 'scanned', 'classifying', 'draft'].includes(status)) return 'blue';
  if (['running', 'processing', 'in_progress', 'extracting', 'classifying', 'normalizing', 'assigned', 'in_review', 'under_review'].includes(status))
    return 'cyan';
  if (['failed', 'cancelled', 'archived', 'high', 'critical'].includes(status)) return 'danger';
  if (['warning', 'medium', 'needs_recon', 'in_setup'].includes(status)) return 'warning';
  if (['matched', 'exact_invoice', 'gstin_pan'].includes(status)) return 'mint';
  return 'default';
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <Badge tone={statusTone(status)} dot pulse={['running', 'processing', 'in_progress', 'queued'].includes(status ?? '')}>
      {status?.replace(/[_-]+/g, ' ') ?? '—'}
    </Badge>
  );
}

/* ── Stat tile ───────────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  hint,
  accent,
  tag,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: 'cyan' | 'mint' | 'teal' | 'none';
  tag?: React.ReactNode;
}) {
  const accents = {
    cyan: 'text-accent-cyan',
    mint: 'text-[#94bda4]',
    teal: 'text-[#4ecdc4]',
    none: 'text-white',
  };
  return (
    <GlassCard className="p-3.5 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2">
        <span className="font-caps text-[10px] text-mine-400">{label}</span>
        {tag ? <span className="flex">{tag}</span> : null}
      </div>
      <div className="mt-2.5">
        <div className={clsx('text-2xl font-mono font-medium tracking-tight', accents[accent ?? 'none'])}>{value}</div>
        {hint ? <div className="text-[11px] text-mine-400 mt-0.5">{hint}</div> : null}
      </div>
    </GlassCard>
  );
}

/* ── Feedback states ─────────────────────────────────────────────────── */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-10 text-mine-400">
      <Icon name="progress_activity" size={20} className="animate-spin text-accent-cyan" />
      {label ? <span className="font-mono text-[11px] uppercase tracking-wider">{label}</span> : null}
    </div>
  );
}

export function StateBlock({
  icon = 'inbox',
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <GlassCard className="p-10 flex flex-col items-center justify-center text-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-mine-400">
        <Icon name={icon} size={22} />
      </div>
      <div className="text-sm font-medium text-white">{title}</div>
      {body ? <div className="text-xs text-mine-400 max-w-sm leading-relaxed">{body}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </GlassCard>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <GlassCard className="p-8 flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-300">
        <Icon name="error" size={22} />
      </div>
      <div className="text-sm font-medium text-white">Something went wrong</div>
      {message ? <div className="text-xs text-mine-400 max-w-sm leading-relaxed">{message}</div> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </GlassCard>
  );
}

/* ── Section heading + pill ──────────────────────────────────────────── */

export function SectionHeading({
  title,
  trailing,
  eyebrow,
}: {
  title: string;
  trailing?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {eyebrow ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.03] text-mine-400 font-mono text-[10px] uppercase tracking-wider">
            {eyebrow}
          </span>
        ) : null}
        <h2 className="text-[13px] font-medium text-slate-200">{title}</h2>
      </div>
      {trailing}
    </div>
  );
}

/* ── App logo mark (neural blossom, per design assets) ───────────────── */

export function Logomark({ size = 32 }: { size?: number }) {
  const petal =
    'M0 -60 C20 -60, 35 -40, 20 -20 C10 -5, -10 -5, -20 -20 C-35 -40, -20 -60, 0 -60 Z';
  return (
    <div
      className="rounded-lg overflow-hidden flex items-center justify-center shrink-0 ring-1 ring-white/10 bg-[#0b1120] shadow-md"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 320 220" fill="none">
        <g transform="translate(160, 100)">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((r) => (
            <path key={r} d={petal} transform={`rotate(${r})`} stroke="#0077ff" strokeWidth="2.5" />
          ))}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((r) => (
            <circle key={r} cx="0" cy="-62" r="3.5" transform={`rotate(${r})`} fill="#00e5ff" />
          ))}
          {[0, 60, 120, 180, 240, 300].map((r) => (
            <path
              key={r}
              d="M0,-12 A16,16 0 0,1 18,-6"
              transform={`rotate(${r})`}
              stroke="#00e5ff"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          ))}
          <circle cx="0" cy="0" r="3" fill="#00e5ff" />
        </g>
      </svg>
    </div>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Logomark size={28} />
      <div className="flex flex-col leading-none">
        <span className="text-[15px] font-bold tracking-[0.12em] text-white uppercase" style={{ fontFamily: 'var(--font-geist)' }}>
          Recon<span className="text-[#67e8f9]">AI</span>
        </span>
        <span className="font-mono text-[8px] uppercase tracking-[0.16em] text-mine-400 mt-1">Defense Platform</span>
      </div>
    </div>
  );
}

export { clsx };