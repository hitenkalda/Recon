/** Formatting helpers — money, dates, ratio, tags. */

/** Rupee format from paise (BigInt→Number at API boundary) or a rupee float. */
export function inr(value: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = opts.signed && value > 0 ? '+' : '';
  // Indian digit-grouping via Intl with a narrow no-break space separator.
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
  return `${sign}₹${formatted}`;
}

/** Formats a full date / ISO string. */
export function date(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Compact relative time (e.g. "24m ago"). */
export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return date(value);
}

/** Percentage string. */
export function pct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}

/** Human label for enum-ish snake/kebab values. */
export function label(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}