'use client';

import { clsx } from 'clsx';
import { Icon } from './icon';

/* ── Field shell ─────────────────────────────────────────────────────── */

export function Field({
  label,
  required,
  hint,
  error,
  className,
  children,
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label ? (
        <label className="flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-300">
          <span>
            {label}
            {required ? <span className="text-accent-cyan"> *</span> : null}
          </span>
          {hint ? <span className="text-zinc-500 normal-case font-normal text-[10px]">{hint}</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="text-[11px] text-rose-300/90 leading-snug">{error}</p> : null}
    </div>
  );
}

const inputBase =
  'w-full rounded-lg text-white placeholder:text-zinc-600 text-[13px] px-3.5 py-2.5 outline-none transition-all duration-200 ' +
  'border border-white/[0.08] focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/30 bg-[rgba(15,18,22,0.7)]';

export function Input({
  className,
  invalid,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={clsx(inputBase, invalid && 'border-rose-500/50 focus:border-rose-400/70 focus:ring-rose-400/30', className)}
      {...rest}
    />
  );
}

export function Select({
  className,
  invalid,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      className={clsx(
        inputBase,
        'appearance-none pr-9 bg-[rgba(15,18,22,0.7)] data-[open]:border-cyan-400/60',
        'cursor-pointer [&>option]:bg-[#0d121c] [&>option]:text-white',
        invalid && 'border-rose-500/50',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(inputBase, 'min-h-[84px] resize-y', className)} {...rest} />;
}

export function Checkbox({
  className,
  id,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      id={id}
      type="checkbox"
      className={clsx(
        'w-4 h-4 rounded bg-zinc-900 border border-zinc-700 text-cyan-400 ' +
          'focus:ring-cyan-400/40 focus:ring-offset-0 accent-cyan-400',
        className,
      )}
      {...rest}
    />
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={clsx('relative', className)}>
      <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Search…'}
        className={clsx(inputBase, 'pl-9')}
      />
    </div>
  );
}

/* ── Tabs ────────────────────────────────────────────────────────────── */

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: { key: T; label: string; count?: number }[];
  active: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={clsx('flex gap-1.5 flex-wrap', className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={clsx(
            'px-3.5 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-wider transition-all duration-150 border',
            active === t.key
              ? 'bg-white text-slate-950 border-white shadow-[0_0_12px_rgba(0,240,255,0.15)]'
              : 'text-mine-400 border-white/[0.08] hover:text-white hover:border-white/20',
          )}
        >
          {t.label}
          {typeof t.count === 'number' && t.count > 0 ? (
            <span className={clsx('ml-1.5 font-mono text-[10px]', active === t.key ? 'text-slate-500' : 'text-mine-400')}>
              {t.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* ── Modal ───────────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={clsx(
          'relative w-full rounded-t-2xl sm:rounded-2xl glass-card p-5 sm:p-6 shadow-2xl animate-sheet-in sm:max-h-[88vh] overflow-y-auto',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex flex-col gap-0.5">
            {eyebrow ? <span className="font-caps text-[9px] text-mine-400">{eyebrow}</span> : null}
            <h3 className="text-base font-medium text-white tracking-tight">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-mine-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Simple table shell ──────────────────────────────────────────────── */

export function Table({
  headers,
  children,
  className,
}: {
  headers: React.ReactNode[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/[0.07]">
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-wider text-mine-400 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={clsx('px-3 py-3 text-[13px] text-slate-200 whitespace-nowrap', className)}>{children}</td>;
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={clsx('text-left px-3 py-2.5 font-mono text-[10px] uppercase tracking-wider text-mine-400 font-medium whitespace-nowrap', className)}>
      {children}
    </th>
  );
}