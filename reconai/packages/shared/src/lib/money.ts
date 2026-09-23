/**
 * Indian currency (INR) utilities.
 * All monetary amounts are stored as **paise** (integer) in the database.
 * This module provides deterministic helpers — no AI.
 */

/** Convert rupees (number) to paise (integer). */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Convert paise to rupees (number, 2 decimal places). */
export function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/**
 * Format paise as INR string: "₹1,23,456.78" (Indian lakhs/crores grouping).
 * Returns the symbol-prefixed string by default; pass `showSymbol: false` for
 * the bare number used inside dense tables.
 */
export function formatINR(paiseAmount: number, opts?: { showSymbol?: boolean; decimals?: number }): string {
  const { showSymbol = true, decimals = 2 } = opts ?? {};
  const rupees = toRupees(paiseAmount);
  const formatted = rupees.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return showSymbol ? `₹${formatted}` : formatted;
}

/**
 * Compare two paise amounts within an absolute tolerance.
 * Default tolerance: ₹1.00 (100 paise).
 */
export function amountsMatch(a: number, b: number, tolerancePaise = 100): boolean {
  return Math.abs(Math.round(a) - Math.round(b)) <= tolerancePaise;
}

/**
 * Compute a percentage variance between two paise amounts.
 * Returns positive when `actual` > `expected`, negative when less.
 * Returns Infinity when expected is 0.
 */
export function variancePct(expected: number, actual: number): number {
  if (expected === 0) return actual === 0 ? 0 : Infinity;
  return ((actual - expected) / Math.abs(expected)) * 100;
}

/** Difference in paise (positive if a > b). */
export function diffPaise(a: number, b: number): number {
  return Math.round(a) - Math.round(b);
}

/**
 * String similarity using Levenshtein distance (for vendor/invoice fuzzy matching).
 * Returns a value between 0 (no match) and 1 (identical).
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0) return 0;
  if (b.length === 0) return 0;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  // Optimised single-row DP
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr.push(
        Math.min(
          prev[j] + 1,      // deletion
          curr[j - 1] + 1,  // insertion
          prev[j - 1] + cost, // substitution
        ),
      );
    }
    prev = curr;
  }
  return 1 - prev[b.length] / maxLen;
}

/**
 * Date similarity for fuzzy date matching (within a tolerance window).
 * Both dates are compared at day granularity.
 * Returns true if |a - b| ≤ toleranceDays.
 */
export function datesWithinTolerance(
  a: Date,
  b: Date,
  toleranceDays: number,
): boolean {
  const diffMs = Math.abs(a.getTime() - b.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= toleranceDays;
}