/**
 * Indian currency (INR) utilities.
 * All monetary amounts are stored as **paise** (integer) in the database.
 * This module provides deterministic helpers — no AI.
 */
/** Convert rupees (number) to paise (integer). */
export declare function toPaise(rupees: number): number;
/** Convert paise to rupees (number, 2 decimal places). */
export declare function toRupees(paise: number): number;
/**
 * Format paise as INR string: "₹1,23,456.78" (Indian lakhs/crores grouping).
 * Returns the symbol-prefixed string by default; pass `showSymbol: false` for
 * the bare number used inside dense tables.
 */
export declare function formatINR(paiseAmount: number, opts?: {
    showSymbol?: boolean;
    decimals?: number;
}): string;
/**
 * Compare two paise amounts within an absolute tolerance.
 * Default tolerance: ₹1.00 (100 paise).
 */
export declare function amountsMatch(a: number, b: number, tolerancePaise?: number): boolean;
/**
 * Compute a percentage variance between two paise amounts.
 * Returns positive when `actual` > `expected`, negative when less.
 * Returns Infinity when expected is 0.
 */
export declare function variancePct(expected: number, actual: number): number;
/** Difference in paise (positive if a > b). */
export declare function diffPaise(a: number, b: number): number;
/**
 * String similarity using Levenshtein distance (for vendor/invoice fuzzy matching).
 * Returns a value between 0 (no match) and 1 (identical).
 */
export declare function levenshteinSimilarity(a: string, b: string): number;
/**
 * Date similarity for fuzzy date matching (within a tolerance window).
 * Both dates are compared at day granularity.
 * Returns true if |a - b| ≤ toleranceDays.
 */
export declare function datesWithinTolerance(a: Date, b: Date, toleranceDays: number): boolean;
//# sourceMappingURL=money.d.ts.map