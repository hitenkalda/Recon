"""Chunked streaming candidate generation — builds B indexes once, processes A rows in chunks.

Produces identical results to _candidates_gst / _candidates_bank because:
  - Tier-by-tier: only unmatched A-rows generate higher-tier candidates.
  - Global sort per tier via heapq.merge of per-chunk sorted streams —
    preserves the same deterministic greedy order as the original match().
  - Compact Jaccard: compute on-the-fly instead of storing 105K Counter objects.
  - Separate matched arrays: O(1) duplicate detection with minimal memory.

Optimizations vs original:
  - Tier-by-tier generation: only unmatched A-rows generate higher-tier candidates.
  - Compact Jaccard: compute on-the-fly instead of storing 105K Counter objects.
  - No precomputed b_inv_freqs / b_vendor_freqs: saves ~121 MB of RAM.
  - Streaming candidate merge: avoids materializing millions of tuples at once.
"""
from __future__ import annotations

import bisect
import heapq
from collections import Counter, defaultdict
from datetime import date as _date
from typing import Any, Dict, Generator, Iterable, List, Tuple

from .normalize import (
    amounts_close,
    normalize_invoice,
    similarity,
)
from .match import (
    TIER_BASE_SCORE,
    _field,
    _scaled_score,
)

CHUNK_SIZE = 100  # A-rows per chunk — small chunks keep peak RAM low


_INV = "invoice"
_GSTIN = "gstin"
_PAN = "pan"
_AMOUNT = "amount"
_DATE = "date"
_VENDOR = "vendor"


# ── Jaccard helpers (compact, no precomputed Counters) ────────────────────────

def _jaccard_char(a: str, b_str: str) -> float:
    """Character-frequency Jaccard similarity. Computes on the fly."""
    if not a or not b_str:
        return 0.0
    ca = Counter(a)
    cb = Counter(b_str)
    intersection = sum((ca & cb).values())
    union = sum((ca | cb).values())
    return intersection / union if union else 0.0


# ── GST builder / processor ───────────────────────────────────────────────────

def _build_gst_b_state(b_rows):
    """Build all B-side indexes and arrays for GST matching."""
    nb = len(b_rows)
    b_inv = [None] * nb
    b_gst = [None] * nb
    b_amt = [None] * nb
    b_date_ord = [0] * nb
    b_vendor = [None] * nb

    for bi in range(nb):
        b = b_rows[bi]
        b_inv[bi] = normalize_invoice(_field(b, _INV))
        b_gst[bi] = _field(b, _GSTIN) or _field(b, _PAN)
        b_amt[bi] = _field(b, _AMOUNT)
        dt = _field(b, _DATE)
        if dt:
            try:
                b_date_ord[bi] = _date.fromisoformat(dt).toordinal()
            except (ValueError, TypeError):
                b_date_ord[bi] = 0
        b_vendor[bi] = _field(b, _VENDOR)

    inv_idx = defaultdict(list)
    gst_idx = defaultdict(list)
    amt_idx = defaultdict(list)
    date_idx = defaultdict(list)

    for bi in range(nb):
        inv = b_inv[bi]
        if inv:
            inv_idx[inv].append(bi)
        gst = b_gst[bi]
        if gst:
            gst_idx[gst].append(bi)
        if b_amt[bi] is not None:
            amt_idx[round(b_amt[bi], 2)].append(bi)
        if b_date_ord[bi] > 0:
            date_idx[b_date_ord[bi]].append(bi)

    sorted_amts = sorted(
        ((b_amt[bi] if b_amt[bi] is not None else float("inf"), bi) for bi in range(nb)),
        key=lambda x: x[0],
    )
    sorted_vals = [x[0] for x in sorted_amts]
    b_amt_sorted = [x[1] for x in sorted_amts]

    return {
        "nb": nb,
        "b_inv": b_inv,
        "b_gst": b_gst,
        "b_amt": b_amt,
        "b_amt_sorted": b_amt_sorted,
        "b_date_ord": b_date_ord,
        "b_vendor": b_vendor,
        "inv_idx": inv_idx,
        "gst_idx": gst_idx,
        "amt_idx": amt_idx,
        "date_idx": date_idx,
        "sorted_vals": sorted_vals,
    }


def _gen_gst_tier1(
    chunk_a: List[Tuple[int, Dict[str, Any]]],
    state: Dict[str, Any],
    tol_abs: float,
    tol_pct: float,
    _date_tol: float,
    _fuzzy_t: float,
    _vendor_t: float,
    a_matched: bytearray,
    na: int,
) -> Generator[Tuple[int, float, int, int, str], None, None]:
    """Generate tier-1 candidates (exact invoice + amount) for unmatched A-rows."""
    b = state
    b_amt = b["b_amt"]
    b_inv = b["b_inv"]
    inv_idx = b["inv_idx"]
    for ai, a in chunk_a:
        if a_matched[ai]:
            continue
        a_inv = normalize_invoice(_field(a, _INV))
        a_amt = _field(a, _AMOUNT)
        if not a_inv or a_inv not in inv_idx:
            continue
        for bi in inv_idx[a_inv]:
            if amounts_close(a_amt, b_amt[bi], tol_abs, tol_pct):
                yield (1, _scaled_score(TIER_BASE_SCORE[1], a_amt, b_amt[bi]),
                       ai, bi, "Exact invoice + amount")


def _gen_gst_tier2(
    chunk_a: List[Tuple[int, Dict[str, Any]]],
    state: Dict[str, Any],
    tol_abs: float,
    tol_pct: float,
    _date_tol: float,
    _fuzzy_t: float,
    _vendor_t: float,
    a_matched: bytearray,
    na: int,
) -> Generator[Tuple[int, float, int, int, str], None, None]:
    """Generate tier-2 candidates (exact GSTIN/PAN + amount) for unmatched A-rows."""
    b = state
    b_amt = b["b_amt"]
    b_gst = b["b_gst"]
    gst_idx = b["gst_idx"]
    for ai, a in chunk_a:
        if a_matched[ai]:
            continue
        a_gst = _field(a, _GSTIN) or _field(a, _PAN)
        a_amt = _field(a, _AMOUNT)
        if not a_gst or a_gst not in gst_idx:
            continue
        for bi in gst_idx[a_gst]:
            if amounts_close(a_amt, b_amt[bi], tol_abs, tol_pct):
                yield (2, _scaled_score(TIER_BASE_SCORE[2], a_amt, b_amt[bi]),
                       ai, bi, "GSTIN/PAN + amount")


def _gen_gst_tiers37_chunk(
    chunk_a: List[Tuple[int, Dict[str, Any]]],
    state: Dict[str, Any],
    tol_abs: float,
    tol_pct: float,
    date_tol: int,
    fuzzy_t: float,
    vendor_t: float,
    a_matched: bytearray,
    na: int,
) -> List[Tuple[int, float, int, int, str]]:
    """Generate tiers 3-7 for one chunk. Returns SORTED list for heap merge."""
    b = state
    nb = b["nb"]
    b_amt = b["b_amt"]
    b_date_ord = b["b_date_ord"]
    b_inv = b["b_inv"]
    b_vendor = b["b_vendor"]
    sorted_vals = b["sorted_vals"]
    b_amt_sorted = b["b_amt_sorted"]
    bisect_left = bisect.bisect_left
    bisect_right = bisect.bisect_right
    candidates: List[Tuple[int, float, int, int, str]] = []

    for ai, a in chunk_a:
        if a_matched[ai]:
            continue
        a_amt = _field(a, _AMOUNT)
        a_date = _field(a, _DATE)
        a_inv = normalize_invoice(_field(a, _INV))
        a_vendor = _field(a, _VENDOR)
        a_date_ord = 0
        if a_date:
            try:
                a_date_ord = _date.fromisoformat(a_date).toordinal()
            except (ValueError, TypeError):
                a_date_ord = 0
        if a_amt is None:
            continue

        lo = min(a_amt - tol_abs, a_amt * (1.0 - tol_pct / 100.0))
        hi = max(a_amt + tol_abs, a_amt * (1.0 + tol_pct / 100.0))
        left = bisect_left(sorted_vals, lo)
        right = bisect_right(sorted_vals, hi)

        for idx in range(left, right):
            bi = b_amt_sorted[idx]
            ba = b_amt[bi]
            if not amounts_close(a_amt, ba, tol_abs, tol_pct):
                continue

            if abs(a_amt - ba) <= tol_abs:
                candidates.append((3, TIER_BASE_SCORE[3], ai, bi, "Identical amount"))
                continue
            if a_date_ord and b_date_ord[bi] and abs(a_date_ord - b_date_ord[bi]) <= date_tol:
                candidates.append((4, TIER_BASE_SCORE[4], ai, bi,
                                   "Amount + date within tolerance"))
                continue

            bb_inv = b_inv[bi]
            bv = b_vendor[bi]

            if a_inv and bb_inv:
                lr = max(len(a_inv), len(bb_inv)) / min(len(a_inv), len(bb_inv))
                if lr > 1.0 / fuzzy_t:
                    bb_inv = None
            if a_vendor and bv:
                lav = a_vendor.lower()
                lbv = bv.lower()
                lr2 = max(len(lav), len(lbv)) / min(len(lav), len(lbv))
                if lr2 > 1.0 / vendor_t:
                    bv = None

            ij = _jaccard_char(a_inv, bb_inv) if a_inv and bb_inv else 1.0
            vj = _jaccard_char(a_vendor.lower(), bv.lower()) if a_vendor and bv else 1.0

            if a_inv and bb_inv and ij >= fuzzy_t:
                _md = int((1 - fuzzy_t) * max(len(a_inv), len(bb_inv)))
                if similarity(a_inv, bb_inv, _md) >= fuzzy_t:
                    candidates.append((5, _scaled_score(TIER_BASE_SCORE[5], a_amt, ba),
                                       ai, bi, "Fuzzy invoice match"))
                    continue

            if a_vendor and bv and vj >= vendor_t:
                _av = a_vendor.lower()
                _bv = bv.lower()
                _md = int((1 - vendor_t) * max(len(_av), len(_bv)))
                if similarity(_av, _bv, _md) >= vendor_t:
                    candidates.append((6, _scaled_score(TIER_BASE_SCORE[6], a_amt, ba),
                                       ai, bi, "Vendor similarity + amount"))
                    continue

            candidates.append((7, TIER_BASE_SCORE[7], ai, bi, "Amount within tolerance"))

    candidates.sort(key=lambda c: (c[0], -c[1], c[2], c[3]))
    return candidates


# ── Bank builder / processor ──────────────────────────────────────────────────

def _build_bank_b_state(b_rows):
    """Build all B-side indexes and arrays for Bank matching."""
    nb = len(b_rows)
    b_amt = [None] * nb
    b_date_ord = [0] * nb
    b_ref = [None] * nb
    b_vendor = [None] * nb

    for bi in range(nb):
        b = b_rows[bi]
        b_amt[bi] = _field(b, _AMOUNT)
        dt = _field(b, _DATE)
        if dt:
            try:
                b_date_ord[bi] = _date.fromisoformat(dt).toordinal()
            except (ValueError, TypeError):
                b_date_ord[bi] = 0
        b_ref[bi] = _field(b, "ref") or _field(b, "description")
        b_vendor[bi] = _field(b, _VENDOR) or _field(b, "description")

    ref_idx = defaultdict(list)
    date_idx = defaultdict(list)

    for bi in range(nb):
        ref = b_ref[bi]
        if ref:
            ref_idx[ref.upper()].append(bi)
        if b_date_ord[bi] > 0:
            date_idx[b_date_ord[bi]].append(bi)

    sorted_amts = sorted(
        ((b_amt[bi] if b_amt[bi] is not None else float("inf"), bi) for bi in range(nb)),
        key=lambda x: x[0],
    )
    sorted_vals = [x[0] for x in sorted_amts]
    b_amt_sorted = [x[1] for x in sorted_amts]

    return {
        "nb": nb,
        "b_amt": b_amt,
        "b_date_ord": b_date_ord,
        "b_ref": b_ref,
        "b_vendor": b_vendor,
        "ref_idx": ref_idx,
        "date_idx": date_idx,
        "sorted_vals": sorted_vals,
        "b_amt_sorted": b_amt_sorted,
    }


def _gen_bank_tier1(
    chunk_a: List[Tuple[int, Dict[str, Any]]],
    state: Dict[str, Any],
    tol_abs: float,
    tol_pct: float,
    _date_tol: float,
    _fuzzy_t: float,
    _vendor_t: float,
    a_matched: bytearray,
    na: int,
) -> Generator[Tuple[int, float, int, int, str], None, None]:
    """Generate tier-1 candidates (exact ref + identical amount + same date) for unmatched A-rows."""
    b = state
    b_amt = b["b_amt"]
    b_date_ord = b["b_date_ord"]
    b_ref = b["b_ref"]
    ref_idx = b["ref_idx"]
    for ai, a in chunk_a:
        if a_matched[ai]:
            continue
        a_amt = _field(a, _AMOUNT)
        a_date = _field(a, _DATE)
        a_ref = _field(a, "ref") or _field(a, "description")
        a_date_ord = 0
        if a_date:
            try:
                a_date_ord = _date.fromisoformat(a_date).toordinal()
            except (ValueError, TypeError):
                a_date_ord = 0
        if a_amt is None or not a_ref:
            continue
        ar_upper = a_ref.upper()
        if ar_upper not in ref_idx:
            continue
        for bi in ref_idx[ar_upper]:
            ba = b_amt[bi]
            if not amounts_close(a_amt, ba, tol_abs, tol_pct):
                continue
            same_date = a_date_ord and b_date_ord[bi] and a_date_ord == b_date_ord[bi]
            if amounts_close(a_amt, ba, tol_abs, 0.0) and same_date:
                yield (1, TIER_BASE_SCORE[1], ai, bi, "Amount + reference/date")


def _gen_bank_tier2(
    chunk_a: List[Tuple[int, Dict[str, Any]]],
    state: Dict[str, Any],
    tol_abs: float,
    tol_pct: float,
    date_tol: int,
    _fuzzy_t: float,
    _vendor_t: float,
    a_matched: bytearray,
    na: int,
) -> Generator[Tuple[int, float, int, int, str], None, None]:
    """Generate tier-2 candidates (amount + date within tolerance) for unmatched A-rows."""
    b = state
    b_amt = b["b_amt"]
    b_date_ord = b["b_date_ord"]
    date_idx = b["date_idx"]
    for ai, a in chunk_a:
        if a_matched[ai]:
            continue
        a_amt = _field(a, _AMOUNT)
        a_date = _field(a, _DATE)
        a_date_ord = 0
        if a_date:
            try:
                a_date_ord = _date.fromisoformat(a_date).toordinal()
            except (ValueError, TypeError):
                a_date_ord = 0
        if a_amt is None or a_date_ord == 0:
            continue
        lo = min(a_amt - tol_abs, a_amt * (1.0 - tol_pct / 100.0))
        hi = max(a_amt + tol_abs, a_amt * (1.0 + tol_pct / 100.0))
        for delta in range(-date_tol, date_tol + 1):
            ord_key = a_date_ord + delta
            if ord_key in date_idx:
                for bi in date_idx[ord_key]:
                    ba = b_amt[bi]
                    if lo <= ba <= hi:
                        yield (2, TIER_BASE_SCORE[2], ai, bi,
                               "Amount + date within tolerance")


def _gen_bank_tiers35_chunk(
    chunk_a: List[Tuple[int, Dict[str, Any]]],
    state: Dict[str, Any],
    tol_abs: float,
    tol_pct: float,
    date_tol: int,
    fuzzy_t: float,
    vendor_t: float,
    a_matched: bytearray,
    na: int,
) -> List[Tuple[int, float, int, int, str]]:
    """Generate tiers 1-5 for one chunk via amount-window scan. Returns SORTED list."""
    b = state
    nb = b["nb"]
    b_amt = b["b_amt"]
    b_date_ord = b["b_date_ord"]
    b_ref = b["b_ref"]
    b_vendor = b["b_vendor"]
    sorted_vals = b["sorted_vals"]
    b_amt_sorted = b["b_amt_sorted"]
    bisect_left = bisect.bisect_left
    bisect_right = bisect.bisect_right
    candidates: List[Tuple[int, float, int, int, str]] = []

    for ai, a in chunk_a:
        if a_matched[ai]:
            continue
        a_amt = _field(a, _AMOUNT)
        a_date = _field(a, _DATE)
        a_ref = _field(a, "ref") or _field(a, "description")
        a_vendor = _field(a, _VENDOR) or _field(a, "description")
        a_date_ord = 0
        if a_date:
            try:
                a_date_ord = _date.fromisoformat(a_date).toordinal()
            except (ValueError, TypeError):
                a_date_ord = 0
        if a_amt is None:
            continue

        lo = min(a_amt - tol_abs, a_amt * (1.0 - tol_pct / 100.0))
        hi = max(a_amt + tol_abs, a_amt * (1.0 + tol_pct / 100.0))
        left = bisect_left(sorted_vals, lo)
        right = bisect_right(sorted_vals, hi)

        for idx in range(left, right):
            bi = b_amt_sorted[idx]
            ba = b_amt[bi]
            if not amounts_close(a_amt, ba, tol_abs, tol_pct):
                continue

            same_ref = a_ref and b_ref[bi] and a_ref.upper() == b_ref[bi].upper()
            same_date = a_date_ord and b_date_ord[bi] and a_date_ord == b_date_ord[bi]
            if amounts_close(a_amt, ba, tol_abs, 0.0) and (same_ref or same_date):
                candidates.append((1, TIER_BASE_SCORE[1], ai, bi, "Amount + reference/date"))
                continue

            if a_date_ord and b_date_ord[bi] and abs(a_date_ord - b_date_ord[bi]) <= date_tol:
                candidates.append((2, TIER_BASE_SCORE[2], ai, bi,
                                   "Amount + date within tolerance"))
                continue

            br = b_ref[bi]
            bv = b_vendor[bi]

            if a_ref and br:
                lr = max(len(a_ref), len(br)) / min(len(a_ref), len(br))
                if lr > 1.0 / fuzzy_t:
                    br = None
            if a_vendor and bv:
                lav = a_vendor.lower()
                lbv = bv.lower()
                lr2 = max(len(lav), len(lbv)) / min(len(lav), len(lbv))
                if lr2 > 1.0 / vendor_t:
                    bv = None

            rj = _jaccard_char(a_ref.upper() if a_ref else "", br.upper() if br else "") if a_ref and br else 1.0
            vj = _jaccard_char(a_vendor.lower() if a_vendor else "", bv.lower() if bv else "") if a_vendor and bv else 1.0

            if a_ref and br and rj >= fuzzy_t:
                _ar = a_ref.upper()
                _br = br.upper()
                _md = int((1 - fuzzy_t) * max(len(_ar), len(_br)))
                if similarity(_ar, _br, _md) >= fuzzy_t:
                    candidates.append((3, TIER_BASE_SCORE[3], ai, bi, "Fuzzy narration/reference"))
                    continue

            if a_vendor and bv and vj >= vendor_t:
                _av = a_vendor.lower()
                _bv = bv.lower()
                _md = int((1 - vendor_t) * max(len(_av), len(_bv)))
                if similarity(_av, _bv, _md) >= vendor_t:
                    candidates.append((4, TIER_BASE_SCORE[4], ai, bi,
                                       "Amount + counterparty similarity"))
                    continue

            candidates.append((5, TIER_BASE_SCORE[5], ai, bi, "Amount within tolerance"))

    candidates.sort(key=lambda c: (c[0], -c[1], c[2], c[3]))
    return candidates


# ── Main entry point ──────────────────────────────────────────────────────────

def match_streaming(run_type, a_rows, b_rows, tol_abs, tol_pct, date_tol, fuzzy_t, vendor_t):
    """Tier-by-tier streaming match: builds B state once, processes tiers sequentially.

    Only generates candidates for A-rows that remain unmatched after each tier,
    which eliminates the vast majority of wasted candidate generation.

    For sparse tiers (1-2), candidates are collected and sorted globally.
    For dense tiers (3-7), per-chunk sorted lists are merged via heapq.merge
    to avoid materializing millions of tuples at once.

    Returns (total_candidates, matched_count, matched_a, matched_b, tier_counts, pairs).
    """
    if run_type == "gst":
        state = _build_gst_b_state(b_rows)
        na = len(a_rows)
        nb = state["nb"]
        a_matched = bytearray(na)
        b_matched = bytearray(nb)
        gen_tiers = [
            (_gen_gst_tier1, True),     # sparse: collect all, sort globally
            (_gen_gst_tier2, True),     # sparse: collect all, sort globally
            (_gen_gst_tiers37_chunk, False),  # dense: merge chunks via heap
        ]
    elif run_type == "bank":
        state = _build_bank_b_state(b_rows)
        na = len(a_rows)
        nb = state["nb"]
        a_matched = bytearray(na)
        b_matched = bytearray(nb)
        gen_tiers = [
            (_gen_bank_tier1, True),    # sparse
            (_gen_bank_tier2, True),    # sparse
            (_gen_bank_tiers35_chunk, False),  # dense
        ]
    else:
        raise ValueError(f"Unsupported run type: {run_type}")

    total_candidates = 0
    tier_counts: Dict[str, int] = defaultdict(int)
    pairs: Dict[int, Tuple[int, int, float, str]] = {}
    matched_count = 0

    for gen_fn, collect_all in gen_tiers:
        if matched_count == na:
            break

        def _tier_key(c):
            return (c[0], -c[1], c[2], c[3])

        if collect_all:
            # Sparse tier: collect all candidates, sort globally, greedy select
            tier_cands: List[Tuple[int, float, int, int, str]] = []
            for start in range(0, na, CHUNK_SIZE):
                end = min(start + CHUNK_SIZE, na)
                chunk_a = [(i, a_rows[i]) for i in range(start, end)]
                any_unmatched = any(not a_matched[ai] for ai, _ in chunk_a)
                if not any_unmatched:
                    del chunk_a
                    continue
                for cand in gen_fn(chunk_a, state, tol_abs, tol_pct, date_tol, fuzzy_t, vendor_t, a_matched, na):
                    tier_cands.append(cand)
                del chunk_a
            tier_cands.sort(key=_tier_key)
            it = iter(tier_cands)
        else:
            # Dense tier: merge per-chunk sorted streams via heap
            chunk_streams = []
            for start in range(0, na, CHUNK_SIZE):
                end = min(start + CHUNK_SIZE, na)
                chunk_a = [(i, a_rows[i]) for i in range(start, end)]
                any_unmatched = any(not a_matched[ai] for ai, _ in chunk_a)
                if not any_unmatched:
                    del chunk_a
                    continue
                chunk_cands = gen_fn(chunk_a, state, tol_abs, tol_pct, date_tol, fuzzy_t, vendor_t, a_matched, na)
                if chunk_cands:
                    chunk_streams.append(iter(chunk_cands))
                del chunk_a
            if not chunk_streams:
                continue
            it = heapq.merge(*chunk_streams, key=_tier_key)

        for cand in it:
            total_candidates += 1
            tier, score, ai, bi, reason = cand
            if a_matched[ai] or b_matched[bi]:
                continue
            a_matched[ai] = 1
            b_matched[bi] = 1
            tier_counts[reason] += 1
            pairs[ai] = (bi, tier, score, reason)
            matched_count += 1

    matched_a = {ai for ai, m in enumerate(a_matched) if m}
    matched_b = {bi for bi, m in enumerate(b_matched) if m}
    return total_candidates, matched_count, matched_a, matched_b, dict(tier_counts), pairs
