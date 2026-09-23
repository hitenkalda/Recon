"""Deterministic reconciliation matcher per the TRD matching order.

Matching order (highest preference first):
  1. exact_invoice       — identical invoice + amount
  2. gstin_pan           — identical GSTIN/PAN + amount
  3. amount              — identical amount
  4. date_tolerance      — date within tolerance (+ amount proximity)
  5. fuzzy_invoice       — fuzzy invoice similarity (+ amount proximity)
  6. vendor_similarity   — vendor name similarity (+ amount proximity)
  7. amount_tolerance    — amount within tolerance %
  8. (ai_assisted / manual / unmatched are decided by users)

Every (A, B) pair is greedily claimed, one-to-one, tier by tier. The output
row objects are the SAME {index, data} dicts that were passed in, so the API can
map results back to source records.
"""
from __future__ import annotations

import bisect
import re
from collections import Counter, defaultdict
from typing import Any, Callable, Dict, List, Optional, Tuple

from .normalize import (
    amounts_close,
    date_diff_days,
    normalize_amount,
    normalize_invoice,
    similarity,
)

TOLERANCE_DEFAULTS: Dict[str, Any] = {
    "amount_tolerance_pct": 2.0,
    "amount_tolerance_abs": 1.0,      # ₹1
    "date_tolerance_days": 3,
    "fuzzy_threshold": 0.85,
    "vendor_threshold": 0.75,
}

# tier → MatchStatus value (mirrors packages/shared enums)
TIER_STATUS = {
    1: "exact_invoice",
    2: "gstin_pan",
    3: "amount",
    4: "date_tolerance",
    5: "fuzzy_invoice",
    6: "vendor_similarity",
    7: "amount_tolerance",
}

TIER_BASE_SCORE = {1: 1.0, 2: 0.95, 3: 0.90, 4: 0.88, 5: 0.85, 6: 0.80, 7: 0.75}


def _field(row: Dict[str, Any], key: str) -> Any:
    return (row.get("data") or {}).get(key)


def _scaled_score(base: float, a: Optional[float], b: Optional[float]) -> float:
    """Knock the base score down slightly as the amount gap grows."""
    if a is None or b is None or b == 0:
        return base
    ratio = abs(a - b) / max(abs(b), 1.0)
    penalty = min(0.2, ratio * 4.0)
    return max(0.0, round(base - penalty, 4))


def _jaccard_freq(a: str, b_counter: Counter) -> float:
    """Character-frequency Jaccard similarity as an O(n) pre-filter for Levenshtein.

    Returns a value in [0, 1] where 1.0 means identical character distributions.
    Used to short-circuit expensive similarity() calls: if Jaccard is below the
    match threshold, the pair cannot possibly pass the similarity check.
    """
    if not a or not b_counter:
        return 0.0
    a_counter = Counter(a)
    intersection = sum((a_counter & b_counter).values())
    union = sum((a_counter | b_counter).values())
    if union == 0:
        return 0.0
    return intersection / union


def _candidates_gst(
    a_rows: List[Dict[str, Any]],
    b_rows: List[Dict[str, Any]],
    tol_abs: float,
    tol_pct: float,
    date_tol: int,
    fuzzy_t: float,
    vendor_t: float,
) -> List[Tuple[int, float, int, int, str]]:
    """Indexed candidate generation for GST matcher.

    Strategy — layered indexes to avoid scanning the full cross-product:
      1. Exact invoice index → tier 1 (O(1) lookup)
      2. Exact GSTIN/PAN index → tier 2 (O(1) lookup)
      3. Exact amount hash + date index → pre-fill tiers 3 & 4
      4. Amount-range bisect → remaining candidates; length-ratio gate
         skips Jaccard+Levenshtein when strings differ too much in length
    """
    from datetime import date as _date
    nb = len(b_rows)

    b_inv = [None] * nb
    b_gst = [None] * nb
    b_amt = [None] * nb
    b_date_ord = [0] * nb
    b_vendor = [None] * nb
    for bi in range(nb):
        b = b_rows[bi]
        b_inv[bi] = normalize_invoice(_field(b, "invoice"))
        b_gst[bi] = _field(b, "gstin") or _field(b, "pan")
        b_amt[bi] = _field(b, "amount")
        dt = _field(b, "date")
        if dt:
            try:
                b_date_ord[bi] = _date.fromisoformat(dt).toordinal()
            except (ValueError, TypeError):
                b_date_ord[bi] = 0
        b_vendor[bi] = _field(b, "vendor")

    # ── Indexes ────────────────────────────────────────────────────────────
    inv_idx: Dict[str, List[int]] = defaultdict(list)
    gst_idx: Dict[str, List[int]] = defaultdict(list)
    amt_idx: Dict[float, List[int]] = defaultdict(list)
    date_idx: Dict[int, List[int]] = defaultdict(list)

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

    # Pre-compute character-frequency vectors for Jaccard pre-filter
    b_inv_freqs = [Counter(normalized) if normalized else Counter() for normalized in b_inv]
    b_vendor_freqs = [Counter(v.lower()) if v else Counter() for v in b_vendor]

    seen: Dict[Tuple[int, int], Tuple[int, float, str]] = {}

    for ai, a in enumerate(a_rows):
        a_inv = normalize_invoice(_field(a, "invoice"))
        a_gst = _field(a, "gstin") or _field(a, "pan")
        a_amt = _field(a, "amount")
        a_date = _field(a, "date")
        a_vendor = _field(a, "vendor")
        a_date_ord = 0
        if a_date:
            try:
                a_date_ord = _date.fromisoformat(a_date).toordinal()
            except (ValueError, TypeError):
                a_date_ord = 0

        # ── Tier 1: exact invoice + amount ────────────────────────────────
        if a_inv and a_inv in inv_idx:
            for bi in inv_idx[a_inv]:
                if (ai, bi) not in seen and amounts_close(a_amt, b_amt[bi], tol_abs, tol_pct):
                    seen[(ai, bi)] = (1, _scaled_score(TIER_BASE_SCORE[1], a_amt, b_amt[bi]),
                                      "Exact invoice + amount")

        # ── Tier 2: exact GSTIN/PAN + amount ──────────────────────────────
        if a_gst and a_gst in gst_idx:
            for bi in gst_idx[a_gst]:
                if (ai, bi) not in seen and amounts_close(a_amt, b_amt[bi], tol_abs, tol_pct):
                    seen[(ai, bi)] = (2, _scaled_score(TIER_BASE_SCORE[2], a_amt, b_amt[bi]),
                                      "GSTIN/PAN + amount")

        if a_amt is None:
            continue

        # ── Tier 4: amount + date within tolerance ────────────────────────
        # Note: compute lo/hi here so both pre-pop and main loop use the
        # same bounds (pre-pop avoids recomputing for each date delta).
        lo = min(a_amt - tol_abs, a_amt * (1.0 - tol_pct / 100.0))
        hi = max(a_amt + tol_abs, a_amt * (1.0 + tol_pct / 100.0))
        if a_date_ord > 0:
            for delta in range(-date_tol, date_tol + 1):
                ord_key = a_date_ord + delta
                if ord_key in date_idx:
                    for bi in date_idx[ord_key]:
                        if (ai, bi) not in seen and lo <= b_amt[bi] <= hi:
                            seen[(ai, bi)] = (4, TIER_BASE_SCORE[4], "Amount + date within tolerance")

        # ── Tiers 5–7: amount-window candidates not yet claimed ──────────
        left = bisect.bisect_left(sorted_vals, lo)
        right = bisect.bisect_right(sorted_vals, hi)

        for idx in range(left, right):
            bi = sorted_amts[idx][1]
            if (ai, bi) in seen:
                continue
            ba = b_amt[bi]
            if not amounts_close(a_amt, ba, tol_abs, tol_pct):
                continue

            # Tier 3: identical amount (tight tolerance)
            if amounts_close(a_amt, ba, tol_abs, 0.0):
                seen[(ai, bi)] = (3, TIER_BASE_SCORE[3], "Identical amount")
                continue
            # Tier 4: amount + date within tolerance
            if a_date_ord and b_date_ord[bi] and abs(a_date_ord - b_date_ord[bi]) <= date_tol:
                seen[(ai, bi)] = (4, TIER_BASE_SCORE[4], "Amount + date within tolerance")
                continue

            bb_inv = b_inv[bi]
            bv = b_vendor[bi]

            # Length-ratio gate: skip Jaccard+similarity when strings differ
            # too much in length (Jaccard can never reach threshold).
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

            # Jaccard pre-filter for tiers 5 (invoice) and 6 (vendor)
            inv_jacc = _jaccard_freq(a_inv, b_inv_freqs[bi]) if a_inv and bb_inv else 1.0
            vend_jacc = _jaccard_freq(a_vendor.lower(), b_vendor_freqs[bi]) if a_vendor and bv else 1.0

            if a_inv and bb_inv and inv_jacc >= fuzzy_t:
                _md = int((1 - fuzzy_t) * max(len(a_inv), len(bb_inv)))
                if similarity(a_inv, bb_inv, _md) >= fuzzy_t:
                    seen[(ai, bi)] = (5, _scaled_score(TIER_BASE_SCORE[5], a_amt, ba), "Fuzzy invoice match")
                    continue

            if a_vendor and bv and vend_jacc >= vendor_t:
                _av = a_vendor.lower()
                _bv = bv.lower()
                _md = int((1 - vendor_t) * max(len(_av), len(_bv)))
                if similarity(_av, _bv, _md) >= vendor_t:
                    seen[(ai, bi)] = (6, _scaled_score(TIER_BASE_SCORE[6], a_amt, ba), "Vendor similarity + amount")
                    continue

            seen[(ai, bi)] = (7, TIER_BASE_SCORE[7], "Amount within tolerance")

    cands = [(tier, score, ai, bi, reason) for (ai, bi), (tier, score, reason) in seen.items()]
    cands.sort(key=lambda c: (c[0], -c[1], c[2], c[3]))
    return cands


def _candidates_bank(a_rows, b_rows, tol_abs, tol_pct, date_tol, fuzzy_t, vendor_t):
    """Indexed candidate generation for Bank matcher.

    Strategy — layered indexes to avoid scanning the full cross-product:
      1. Exact reference index → tier 1 (O(1) lookup)
      2. Date-window index → pre-fill tier 2
      3. Amount-range bisect → remaining candidates; length-ratio gate
         skips Jaccard+Levenshtein when strings differ too much in length
    """
    from datetime import date as _date
    nb = len(b_rows)

    b_amt = [None] * nb
    b_date_ord = [0] * nb
    b_ref = [None] * nb
    b_vendor = [None] * nb
    for bi in range(nb):
        b = b_rows[bi]
        b_amt[bi] = _field(b, "amount")
        dt = _field(b, "date")
        if dt:
            try:
                b_date_ord[bi] = _date.fromisoformat(dt).toordinal()
            except (ValueError, TypeError):
                b_date_ord[bi] = 0
        b_ref[bi] = _field(b, "ref") or _field(b, "description")
        b_vendor[bi] = _field(b, "vendor") or _field(b, "description")

    # ── Indexes ────────────────────────────────────────────────────────────
    ref_idx: Dict[str, List[int]] = defaultdict(list)
    date_idx: Dict[int, List[int]] = defaultdict(list)

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

    # Pre-compute character-frequency vectors for Jaccard pre-filter
    b_ref_freqs = [Counter((r or "").upper()) for r in b_ref]
    b_vendor_freqs = [Counter((v or "").lower()) for v in b_vendor]

    seen: Dict[Tuple[int, int], Tuple[int, float, str]] = {}

    for ai, a in enumerate(a_rows):
        a_amt = _field(a, "amount")
        a_date = _field(a, "date")
        a_ref = _field(a, "ref") or _field(a, "description")
        a_vendor = _field(a, "vendor") or _field(a, "description")
        a_date_ord = 0
        if a_date:
            try:
                a_date_ord = _date.fromisoformat(a_date).toordinal()
            except (ValueError, TypeError):
                a_date_ord = 0

        if a_amt is None:
            continue

        # ── Tier 1: exact reference + (identical amount or same date) ─────
        if a_ref:
            ar_upper = a_ref.upper()
            if ar_upper in ref_idx:
                for bi in ref_idx[ar_upper]:
                    if (ai, bi) in seen:
                        continue
                    ba = b_amt[bi]
                    if not amounts_close(a_amt, ba, tol_abs, tol_pct):
                        continue
                    same_ref = True
                    same_date = a_date_ord and b_date_ord[bi] and a_date_ord == b_date_ord[bi]
                    if amounts_close(a_amt, ba, tol_abs, 0.0) and (same_ref or same_date):
                        seen[(ai, bi)] = (1, TIER_BASE_SCORE[1], "Amount + reference/date")

        # ── Tier 2: amount + date within tolerance (no ref match) ────────
        if a_date_ord > 0:
            lo = min(a_amt - tol_abs, a_amt * (1.0 - tol_pct / 100.0))
            hi = max(a_amt + tol_abs, a_amt * (1.0 + tol_pct / 100.0))
            for delta in range(-date_tol, date_tol + 1):
                ord_key = a_date_ord + delta
                if ord_key in date_idx:
                    for bi in date_idx[ord_key]:
                        if (ai, bi) not in seen and lo <= b_amt[bi] <= hi:
                            seen[(ai, bi)] = (2, TIER_BASE_SCORE[2], "Amount + date within tolerance")

        # ── Tiers 3–5: amount-window candidates not yet claimed ──────────
        lo = min(a_amt - tol_abs, a_amt * (1.0 - tol_pct / 100.0))
        hi = max(a_amt + tol_abs, a_amt * (1.0 + tol_pct / 100.0))
        left = bisect.bisect_left(sorted_vals, lo)
        right = bisect.bisect_right(sorted_vals, hi)

        for idx in range(left, right):
            bi = sorted_amts[idx][1]
            if (ai, bi) in seen:
                continue
            ba = b_amt[bi]
            if not amounts_close(a_amt, ba, tol_abs, tol_pct):
                continue

            same_ref = a_ref and b_ref[bi] and a_ref.upper() == b_ref[bi].upper()
            same_date = a_date_ord and b_date_ord[bi] and a_date_ord == b_date_ord[bi]
            if amounts_close(a_amt, ba, tol_abs, 0.0) and (same_ref or same_date):
                seen[(ai, bi)] = (1, TIER_BASE_SCORE[1], "Amount + reference/date")
                continue

            if a_date_ord and b_date_ord[bi] and abs(a_date_ord - b_date_ord[bi]) <= date_tol:
                seen[(ai, bi)] = (2, TIER_BASE_SCORE[2], "Amount + date within tolerance")
                continue

            br = b_ref[bi]
            bv = b_vendor[bi]

            # Length-ratio gate
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

            # Jaccard pre-filter for tiers 3 (narration) and 4 (vendor)
            ref_jacc = _jaccard_freq(a_ref.upper(), b_ref_freqs[bi]) if a_ref and br else 1.0
            vend_jacc = _jaccard_freq(a_vendor.lower(), b_vendor_freqs[bi]) if a_vendor and bv else 1.0

            if a_ref and br and ref_jacc >= fuzzy_t:
                _ar = a_ref.upper()
                _br = br.upper()
                _md = int((1 - fuzzy_t) * max(len(_ar), len(_br)))
                if similarity(_ar, _br, _md) >= fuzzy_t:
                    seen[(ai, bi)] = (3, TIER_BASE_SCORE[3], "Fuzzy narration/reference")
                    continue

            if a_vendor and bv and vend_jacc >= vendor_t:
                _av = a_vendor.lower()
                _bv = bv.lower()
                _md = int((1 - vendor_t) * max(len(_av), len(_bv)))
                if similarity(_av, _bv, _md) >= vendor_t:
                    seen[(ai, bi)] = (4, TIER_BASE_SCORE[4], "Amount + counterparty similarity")
                    continue

            seen[(ai, bi)] = (5, TIER_BASE_SCORE[5], "Amount within tolerance")

    cands = [(tier, score, ai, bi, reason) for (ai, bi), (tier, score, reason) in seen.items()]
    cands.sort(key=lambda c: (c[0], -c[1], c[2], c[3]))
    return cands


def _candidates_ais(a_rows, b_rows, tol_abs, tol_pct, date_tol, fuzzy_t, vendor_t):
    """Indexed candidate generation for AIS matcher — replaces O(A×B) with PAN/TAN partition."""
    nb = len(b_rows)

    b_pan = [None] * nb
    b_amt = [None] * nb
    b_date = [None] * nb
    for bi in range(nb):
        b = b_rows[bi]
        b_pan[bi] = _field(b, "pan") or _field(b, "gstin")
        b_amt[bi] = _field(b, "amount")
        b_date[bi] = _field(b, "date")

    pan_idx: Dict[str, List[int]] = defaultdict(list)
    amt_idx: Dict[float, List[int]] = defaultdict(list)
    date_idx: Dict[str, List[int]] = defaultdict(list)

    for bi in range(nb):
        pan = b_pan[bi]
        if pan:
            pan_idx[pan].append(bi)
        amt = b_amt[bi]
        if amt is not None:
            amt_idx[round(amt, 2)].append(bi)
        dt = b_date[bi]
        if dt:
            date_idx[dt].append(bi)

    seen: Dict[Tuple[int, int], Tuple[int, float, str]] = {}

    for ai, a in enumerate(a_rows):
        a_pan = _field(a, "pan") or _field(a, "gstin")
        a_amt = _field(a, "amount")
        a_date = _field(a, "date")

        if a_pan and a_pan in pan_idx:
            for bi in pan_idx[a_pan]:
                if (ai, bi) in seen:
                    continue
                ba = b_amt[bi]
                if amounts_close(a_amt, ba, tol_abs, tol_pct):
                    seen[(ai, bi)] = (1, _scaled_score(TIER_BASE_SCORE[1], a_amt, ba), "PAN/TAN + amount")
                    continue
                bb_date = b_date[bi]
                if a_date and bb_date and date_diff_days(a_date, bb_date) is not None \
                        and date_diff_days(a_date, bb_date) <= date_tol:
                    seen[(ai, bi)] = (2, TIER_BASE_SCORE[2], "PAN/TAN + date within tolerance")

        if a_amt is not None:
            for bi in amt_idx.get(round(a_amt, 2), ()):
                if (ai, bi) in seen:
                    continue
                if amounts_close(a_amt, b_amt[bi], tol_abs, 0.0):
                    seen[(ai, bi)] = (3, TIER_BASE_SCORE[3], "Identical amount")

        if a_date and a_date in date_idx:
            for bi in date_idx[a_date]:
                if (ai, bi) in seen:
                    continue
                ba = b_amt[bi]
                if amounts_close(a_amt, ba, tol_abs, tol_pct):
                    seen[(ai, bi)] = (4, TIER_BASE_SCORE[4], "Amount + date within tolerance")

        if a_date:
            try:
                from datetime import date as _date
                a_ord = _date.fromisoformat(a_date).toordinal()
                for bi in range(nb):
                    if (ai, bi) in seen:
                        continue
                    bdt = b_date[bi]
                    if not bdt:
                        continue
                    try:
                        b_ord = _date.fromisoformat(bdt).toordinal()
                        if abs(a_ord - b_ord) <= date_tol:
                            ba = b_amt[bi]
                            if amounts_close(a_amt, ba, tol_abs, tol_pct):
                                seen[(ai, bi)] = (4, TIER_BASE_SCORE[4], "Amount + date within tolerance")
                    except (ValueError, TypeError):
                        pass
            except (ValueError, TypeError):
                pass

        if a_amt is not None:
            for bi in range(nb):
                if (ai, bi) in seen:
                    continue
                ba = b_amt[bi]
                if amounts_close(a_amt, ba, tol_abs, tol_pct):
                    seen[(ai, bi)] = (5, TIER_BASE_SCORE[5], "Amount within tolerance")

    cands = [(tier, score, ai, bi, reason) for (ai, bi), (tier, score, reason) in seen.items()]
    cands.sort(key=lambda c: (c[0], -c[1], c[2], c[3]))
    return cands


_RUN_CANDIDATES: Dict[str, Callable[..., List[Tuple[int, float, int, int, str]]]] = {
    "gst": _candidates_gst,
    "bank": _candidates_bank,
    "ais_26as": _candidates_ais,
}

_TIER_STATUS_OVERRIDE = {
    "bank": {1: "exact_invoice", 2: "date_tolerance", 3: "fuzzy_invoice", 4: "vendor_similarity", 5: "amount_tolerance"},
    "ais_26as": {1: "gstin_pan", 2: "gstin_pan", 3: "amount", 4: "date_tolerance", 5: "amount_tolerance"},
}


def _status_for(run_type: str, tier: int) -> str:
    override = _TIER_STATUS_OVERRIDE.get(run_type, {})
    return override.get(tier, TIER_STATUS[tier])


# ── 26AS/AIS tax reconciliation (Phase 8) ────────────────────────────────────
#
# Implements the TRD matching order — PAN → Deductor TAN → Section → FY/quarter
# → Gross → TDS — as a weighted, greedy, one-to-one score. Every 26AS row (side A)
# is classified into one of the Phase-8 views via its matchStatus:
#   gstin_pan / amount       → Matched
#   amount_tolerance         → Amount Difference
#   income_mismatch          → Income mismatch (gross differs on a TDS-matched pair)
#   section_mismatch         → Section mismatch (key-matched, section differs)
#   duplicate                → Duplicates (same PAN/TAN+section+quarter+amount 2×)
#   unmatched, recordB null  → TDS missing in books (26AS credit may not be booked)
#   unmatched, recordA null  → TDS missing in 26AS (deductor may not have filed)
# Deterministic — no AI. Records are returned as the SAME {index, data} dicts so
# the API can trace every finding back to its source row.

_AIS_TDS_TOL = 10.0
_AIS_GATE = 40.0
_AIS_HIGH_RISK_TDS = 50000.0
_AIS_NAME_DROP = {
    "pvt", "ltd", "llp", "llc", "inc", "co", "and", "the", "of", "india", "indian",
    "limited", "private", "company", "corporation", "corp", "enterprises", "enterprise",
}


def _tax_ident(v: Any) -> str:
    if v is None:
        return ""
    return re.sub(r"\s+", "", str(v).upper())


def _name_tokens(name: str) -> List[str]:
    s = re.sub(r"[^a-z0-9\s]", " ", str(name or "").lower())
    return sorted({w for w in s.split() if len(w) > 1 and w not in _AIS_NAME_DROP})


def _name_sim(a: Any, b: Any) -> float:
    ta, tb = _name_tokens(a), _name_tokens(b)
    if not ta or not tb:
        return 0.0
    inter = sum(1 for w in ta if w in tb)
    base = inter / float(max(len(ta), len(tb)))
    ra = re.sub(r"[^a-z0-9]", "", str(a).lower())
    rb = re.sub(r"[^a-z0-9]", "", str(b).lower())
    if ra and rb and (ra in rb or rb in ra):
        return max(base, 0.85)
    return base


def _quarter_from_date(iso: Any) -> Optional[str]:
    if not iso:
        return None
    m = re.search(r"-(\d{2})-", str(iso))
    if not m:
        return None
    month = int(m.group(1))
    return {1: "Q4", 2: "Q4", 3: "Q4", 4: "Q1", 5: "Q1", 6: "Q1",
            7: "Q2", 8: "Q2", 9: "Q2", 10: "Q3", 11: "Q3", 12: "Q3"}.get(month)


def _fy_from_date(iso: Any) -> Optional[str]:
    if not iso:
        return None
    m = re.search(r"(\d{4})-(\d{2})-", str(iso))
    if not m:
        return None
    year, month = int(m.group(1)), int(m.group(2))
    start = year if month >= 4 else year - 1
    return f"{start}-{str(start + 1)[-2:]}"


def _ais_row(row: Dict[str, Any]) -> Dict[str, Any]:
    d = row.get("data") or {}

    def f(*keys: str) -> Any:
        for k in keys:
            v = d.get(k)
            if v is not None and v != "":
                return v
        return None

    tds = f("tds", "amount")
    gross = f("gross", "amount")
    section = f("section")
    quarter = f("quarter")
    fy = f("fy")
    date = f("date")
    if not quarter and date:
        quarter = _quarter_from_date(date)
    if not fy and date:
        fy = _fy_from_date(date)
    return {
        "row": row,
        "name": f("name", "vendor", "party"),
        "pan": f("pan"),
        "tan": f("tan"),
        "section": section,
        "quarter": quarter,
        "fy": fy,
        "date": date,
        "gross": _as_amount(gross),
        "tds": _as_amount(tds),
    }


def _as_amount(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _ais_score(a: Dict[str, Any], b: Dict[str, Any], tds_tol: float) -> Tuple[float, bool, float, List[str]]:
    """Weighted score in [0,100] honouring the PAN→TAN→Section→FY/qtr→Gross→TDS order.
    Returns (score, keyExact, nameSim, reasons)."""
    a_key = _tax_ident(a["pan"]) or _tax_ident(a["tan"])
    b_key = _tax_ident(b["pan"]) or _tax_ident(b["tan"])
    key_exact = bool(a_key and b_key and a_key == b_key)
    sim = _name_sim(a["name"], b["name"]) if (a["name"] and b["name"]) else 0.0

    score = 0.0
    reasons: List[str] = []
    if key_exact:
        score += 35
        reasons.append("PAN/TAN match")
    if a["name"] and b["name"]:
        if sim >= 0.999:
            score += 16
            reasons.append(f"Name 100%")
        elif sim >= 0.75:
            score += 10
            reasons.append(f"Name {round(sim * 100)}%")
        elif sim >= 0.5:
            score += 6
            reasons.append(f"Name {round(sim * 100)}%")
    if a["section"] and b["section"] and a["section"] == b["section"]:
        score += 10
    if a["quarter"] and b["quarter"] and a["quarter"] == b["quarter"]:
        score += 10
    elif a["fy"] and b["fy"] and a["fy"] == b["fy"]:
        score += 4
    if a["gross"] is not None and b["gross"] is not None:
        gdiff = abs(a["gross"] - b["gross"])
        if gdiff < 1:
            score += 12
        elif gdiff <= max(abs(a["gross"]), abs(b["gross"])) * 0.01:
            score += 8
    if a["tds"] is not None and b["tds"] is not None:
        tdiff = abs(a["tds"] - b["tds"])
        if tdiff <= tds_tol:
            score += 18
        elif tdiff <= max(abs(a["tds"]), abs(b["tds"])) * 0.05:
            score += 12
        elif tdiff <= max(abs(a["tds"]), abs(b["tds"])) * 0.20:
            score += 6
    score = min(100.0, score)
    return round(score, 3), key_exact, sim, reasons


def _ais_band(score: float) -> str:
    if score >= 90:
        return "Exact"
    if score >= 75:
        return "Strong"
    if score >= 50:
        return "Potential"
    if score >= 1:
        return "Weak"
    return "No match"


def _ais_item_tax(row: Dict[str, Any], side: str) -> Dict[str, Any]:
    return {
        "side": side,
        "name": row["name"],
        "pan": _tax_ident(row["pan"]) or None,
        "tan": _tax_ident(row["tan"]) or None,
        "section": row["section"],
        "quarter": row["quarter"],
        "fy": row["fy"],
        "gross": row["gross"],
        "tds": row["tds"],
    }


def _ais_master(
    rows_a: List[Dict[str, Any]],
    rows_b: List[Dict[str, Any]],
    params: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Deterministic tax reconciliation of 26AS (a) against books TDS (b)."""
    p = {**TOLERANCE_DEFAULTS, **(params or {})}
    tds_tol = float(p.get("tdsTolerance", _AIS_TDS_TOL))
    gate = float(p.get("matchGate", _AIS_GATE))
    tax_cfg = p.get("tax") if isinstance(p.get("tax"), dict) else {}
    high_tds = float(tax_cfg.get("highRiskTdsThreshold") or p.get("highRiskTdsThreshold", _AIS_HIGH_RISK_TDS))

    a_rows = [_ais_row(r) for r in rows_a]
    b_rows = [_ais_row(r) for r in rows_b]

    # duplicate keys inside each side: same PAN/TAN + section + quarter + amounts.
    def key_of(x: Dict[str, Any]) -> Tuple[str, str, str, float, float]:
        return (_tax_ident(x["pan"]) or _tax_ident(x["tan"]), x["section"] or "",
                x["quarter"] or "", round(x["tds"] or 0.0, 2), round(x["gross"] or x["tds"] or 0.0, 2))

    def dup_map(rows: List[Dict[str, Any]]) -> Dict[int, str]:
        seen: Dict[Tuple, int] = {}
        refs: Dict[int, str] = {}
        for i, x in enumerate(rows):
            k = key_of(x)
            if k[0] and k[1] and k[2] and k[3] > 0 and k in seen:
                refs[i] = f"{seen[k] + 1}"
            elif k[0] and k[1] and k[2] and k[3] > 0:
                seen[k] = i
        return refs

    a_dup = dup_map(a_rows)
    b_dup = dup_map(b_rows)

    # Greedy one-to-one: each 26AS row claims its best unused books row.
    # Indexed: partition B-side by PAN/TAN to avoid O(A×B) scoring.
    used_b: set = set()
    choices: List[Optional[Dict[str, Any]]] = [None] * len(a_rows)

    b_pan_tan_idx: Dict[str, List[int]] = defaultdict(list)
    for bi, b in enumerate(b_rows):
        key = _tax_ident(b["pan"]) or _tax_ident(b["tan"])
        if key:
            b_pan_tan_idx[key].append(bi)

    for ai, a in enumerate(a_rows):
        a_key = _tax_ident(a["pan"]) or _tax_ident(a["tan"])
        best, best_key, idx = None, (-1.0, float("inf")), -1

        candidates = b_pan_tan_idx.get(a_key, []) if a_key else list(range(len(b_rows)))
        for bi in candidates:
            if bi in used_b:
                continue
            b = b_rows[bi]
            score, key_exact, sim, _ = _ais_score(a, b, tds_tol)
            tds_close = (a["tds"] is not None and b["tds"] is not None
                         and abs(a["tds"] - b["tds"]) <= tds_tol)
            if score < gate or (not key_exact and not tds_close and sim < 0.5):
                continue
            tie = (score, -abs((a["tds"] or 0) - (b["tds"] or 0)))
            if tie > best_key:
                best_key, best, idx = tie, (b, score, key_exact, sim), bi
        if best is not None:
            used_b.add(idx)
            choices[ai] = best

    items: List[Dict[str, Any]] = []
    for ai, a in enumerate(a_rows):
        b, score, key_exact, sim = choices[ai] or (None, 0.0, False, 0.0)
        base_reasons = _ais_score(a, b, tds_tol)[3] if b else []
        tax = _ais_item_tax(a, "ais26")
        if ai in a_dup:
            items.append({
                "recordA": a["row"], "recordB": b["row"] if b else None,
                "matchStatus": "duplicate", "score": min(score / 100, 0.6),
                "reasons": [f"Potential duplicate 26AS entry — same key as entry #{a_dup[ai]}", *base_reasons],
                "matchedBy": "Duplicate", "tax": {**tax, "tdsA": a["tds"], "tdsB": b["tds"] if b else None,
                                                  "grossA": a["gross"], "grossB": b["gross"] if b else None},
            })
            continue
        if b is None:
            items.append({
                "recordA": a["row"], "recordB": None,
                "matchStatus": "unmatched", "score": 0.0,
                "reasons": ["No books entry found — 26AS TDS credit may not be booked in accounts"],
                "matchedBy": None, "tax": {**tax, "tdsA": a["tds"], "tdsB": None, "grossA": a["gross"], "grossB": None},
            })
            continue

        tds_diff = abs((a["tds"] or 0) - (b["tds"] or 0))
        income_diff = (a["gross"] is not None and b["gross"] is not None
                       and abs(a["gross"] - b["gross"]) > max(1.0, max(abs(a["gross"]), abs(b["gross"])) * 0.01))
        section_diff = bool(a["section"] and b["section"] and a["section"] != b["section"])
        band = _ais_band(score)
        reasons = [f"Score {round(score)}{' — ' + band if band else ''}", *base_reasons]
        if tds_diff > tds_tol:
            status = "amount_tolerance"
            reasons.append(f"TDS differs by ₹{round(tds_diff):,.0f}")
            matched_by = "Amount diff"
        elif income_diff:
            status = "income_mismatch"
            reasons.append(f"Gross differs by ₹{round(abs((a['gross'] or 0) - (b['gross'] or 0))):,.0f}")
            matched_by = "TDS matched"
        elif section_diff:
            status = "section_mismatch"
            reasons.append(f"Section differs: {a['section']} vs {b['section']}")
            matched_by = "PAN/TAN + amount"
        elif key_exact:
            status = "gstin_pan"
            matched_by = "PAN/TAN + TDS"
        elif sim >= 0.75:
            status = "amount"
            matched_by = "Name + TDS"
        else:
            status = "amount"
            matched_by = "Amount + name"
        items.append({
            "recordA": a["row"], "recordB": b["row"],
            "matchStatus": status, "score": score / 100,
            "reasons": reasons, "matchedBy": matched_by,
            "tax": {**tax, "tdsA": a["tds"], "tdsB": b["tds"], "grossA": a["gross"], "grossB": b["gross"]},
        })

    # Books rows that never matched → "TDS missing in 26AS".
    for bi, b in enumerate(b_rows):
        if bi in used_b:
            continue
        tax = _ais_item_tax(b, "books")
        if bi in b_dup:
            items.append({
                "recordA": None, "recordB": b["row"], "matchStatus": "duplicate",
                "score": 0.5, "reasons": [f"Potential duplicate books entry — same key as entry #{b_dup[bi]}"],
                "matchedBy": "Duplicate", "tax": {**tax, "tdsA": None, "tdsB": b["tds"], "grossA": None, "grossB": b["gross"]},
            })
            continue
        items.append({
            "recordA": None, "recordB": b["row"], "matchStatus": "unmatched", "score": 0.0,
            "reasons": ["Booked TDS not reflecting in 26AS — verify the deductor filed/deposited"],
            "matchedBy": None, "tax": {**tax, "tdsA": None, "tdsB": b["tds"], "grossA": None, "grossB": b["gross"]},
        })

    metrics = _ais_metrics(items, a_rows, b_rows, high_tds, tds_tol, gate)
    return {"items": items, "metrics": metrics, "warnings": []}


def _ais_metrics(items: List[Dict[str, Any]], a_rows: List[Dict[str, Any]], b_rows: List[Dict[str, Any]],
                 high_tds: float, tds_tol: float, gate: float) -> Dict[str, Any]:
    CLEAN = {"gstin_pan", "amount", "date_tolerance", "fuzzy_invoice", "vendor_similarity"}
    counts = {"matched": {"count": 0, "tds": 0.0, "gross": 0.0},
              "amountDiff": {"count": 0, "tds": 0.0, "variance": 0.0},
              "incomeMismatch": {"count": 0, "tds": 0.0, "grossDiff": 0.0},
              "sectionMismatch": {"count": 0, "tds": 0.0},
              "missingInBooks": {"count": 0, "tds": 0.0},   # 26AS-only
              "missingIn26AS": {"count": 0, "tds": 0.0},    # books-only
              "duplicates": {"count": 0, "tds": 0.0},
              "highRisk": {"count": 0, "tds": 0.0}}
    by_status: Dict[str, int] = {}
    section_sum: Dict[str, Dict[str, Any]] = {}
    ded_sum: Dict[str, Dict[str, Any]] = {}

    def sec(k: str) -> Dict[str, Any]:
        return section_sum.setdefault(k or "-", {"section": k or "-", "count": 0, "gross": 0.0, "tds": 0.0,
                                                 "matched": 0, "missingInBooks": 0, "missingIn26AS": 0,
                                                 "amountDiff": 0, "incomeMismatch": 0, "sectionMismatch": 0,
                                                 "duplicates": 0})

    def ded(k: str) -> Dict[str, Any]:
        return ded_sum.setdefault(k, {"deductor": k, "pan": None, "tan": None, "count": 0, "tds": 0.0, "gross": 0.0,
                                      "matched": 0, "missing": 0})

    pairs = 0
    for it in items:
        st = it["matchStatus"]
        by_status[st] = by_status.get(st, 0) + 1
        tax = it["tax"] or {}
        a_tds = tax.get("tdsA") or tax.get("tds") or 0.0
        b_tds = tax.get("tdsB") or tax.get("tds") or 0.0
        tds_val = max(a_tds or 0.0, b_tds or 0.0) if it.get("recordA") and it.get("recordB") else (a_tds or b_tds or 0.0)
        a_gross = tax.get("grossA") or 0.0
        b_gross = tax.get("grossB") or 0.0
        sc = tax.get("section")
        dk = tax.get("pan") or tax.get("tan") or (tax.get("name") or "-")

        is_pair = bool(it.get("recordA") and it.get("recordB"))
        is_duplicate = st == "duplicate"
        if st == "unmatched":
            if it.get("recordA") and not it.get("recordB"):
                counts["missingInBooks"]["count"] += 1
                counts["missingInBooks"]["tds"] += a_tds or 0.0
            elif it.get("recordB") and not it.get("recordA"):
                counts["missingIn26AS"]["count"] += 1
                counts["missingIn26AS"]["tds"] += b_tds or 0.0
            s = sec(sc); s["count"] += 1; s["gross"] += a_gross or b_gross or 0.0; s["tds"] += tds_val
            if it.get("recordA") and not it.get("recordB"):
                s["missingInBooks"] += 1
            else:
                s["missingIn26AS"] += 1
            d = ded(dk); d["count"] += 1; d["tds"] += tds_val; d["gross"] += a_gross or b_gross or 0.0; d["missing"] += 1
        else:
            pairs += 1
            if st == "duplicate":
                counts["duplicates"]["count"] += 1
                counts["duplicates"]["tds"] += tds_val
                s = sec(sc); s["count"] += 1; s["tds"] += tds_val; s["duplicates"] += 1
            elif st == "amount_tolerance":
                counts["amountDiff"]["count"] += 1
                counts["amountDiff"]["tds"] += tds_val
                counts["amountDiff"]["variance"] += abs((a_tds or 0.0) - (b_tds or 0.0))
                s = sec(sc); s["count"] += 1; s["tds"] += tds_val; s["amountDiff"] += 1
            elif st == "income_mismatch":
                counts["incomeMismatch"]["count"] += 1
                counts["incomeMismatch"]["tds"] += tds_val
                counts["incomeMismatch"]["grossDiff"] += abs((a_gross or 0.0) - (b_gross or 0.0))
                s = sec(sc); s["count"] += 1; s["tds"] += tds_val; s["incomeMismatch"] += 1
            elif st == "section_mismatch":
                counts["sectionMismatch"]["count"] += 1
                counts["sectionMismatch"]["tds"] += tds_val
                s = sec(sc); s["count"] += 1; s["tds"] += tds_val; s["sectionMismatch"] += 1
            elif st in CLEAN:
                counts["matched"]["count"] += 1
                counts["matched"]["tds"] += tds_val
                counts["matched"]["gross"] += (a_gross or b_gross or 0.0)
                s = sec(sc); s["count"] += 1; s["gross"] += a_gross or b_gross or 0.0; s["tds"] += tds_val; s["matched"] += 1
            else:
                pairs = pairs - 1 + 0  # unmatched handled above; unknown status ignored
            d = ded(dk); d["count"] += 1; d["tds"] += tds_val; d["gross"] += a_gross or b_gross or 0.0
            marker = st if st in ("amount_tolerance", "income_mismatch", "section_mismatch", "duplicate") else "matched"
            if st == "unmatched":
                d["missing"] += 1

        # high risk: sizeable unmatched (either side) or a sizeable mismatch/diff.
        if tds_val >= high_tds and it["matchStatus"] in ("unmatched", "income_mismatch", "section_mismatch",
                                                         "amount_tolerance", "duplicate"):
            counts["highRisk"]["count"] += 1
            counts["highRisk"]["tds"] += tds_val

    tds_26 = sum(x["tds"] or 0.0 for x in a_rows)
    tds_books = sum(x["tds"] or 0.0 for x in b_rows)
    total_a, total_b = len(a_rows), len(b_rows)
    match_rate = round(pairs / max(total_a, 1) * 100.0, 1)

    section_list = sorted(section_sum.values(), key=lambda s: s["tds"], reverse=True)
    ded_list = sorted(ded_sum.values(), key=lambda d: d["tds"], reverse=True)[:40]

    tax = {**counts, "tds26": tds_26, "tdsBooks": tds_books, "netDiff": round(tds_26 - tds_books, 2),
           "pairs": pairs, "matchRate": match_rate,
           "taxCreditLoss": round(counts["missingInBooks"]["tds"], 2),
           "thresholds": {"tdsTolerance": tds_tol, "matchGate": gate, "highRiskTds": high_tds}}
    metrics = {
        "total": len(items), "totalA": total_a, "totalB": total_b,
        "matched": pairs, "matchedCount": pairs,
        "unmatched": len(items) - pairs, "unmatchedCount": len(items) - pairs,
        "unmatchedA": total_a - pairs, "unmatchedB": total_b - pairs,
        "duplicates": counts["duplicates"]["count"],
        "byStatus": by_status, "byTier": {},
        "tax": tax,
        "sectionSummary": section_list,
        "deductorSummary": ded_list,
        "tolerances": {"amountToleranceAbs": tds_tol, "matchGate": gate, "highRiskTds": high_tds},
    }
    return metrics


def match(
    run_type: str,
    rows_a: List[Dict[str, Any]],
    rows_b: List[Dict[str, Any]],
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Run the deterministic matcher (tiered, or the tax-aware 26AS pass)."""
    if run_type == "ais_26as":
        return _ais_master(rows_a, rows_b, params)

    p = {**TOLERANCE_DEFAULTS, **(params or {})}
    tol_abs = float(p.get("amount_tolerance_abs", TOLERANCE_DEFAULTS["amount_tolerance_abs"]))
    tol_pct = float(p.get("amount_tolerance_pct", TOLERANCE_DEFAULTS["amount_tolerance_pct"]))
    date_tol = int(p.get("date_tolerance_days", TOLERANCE_DEFAULTS["date_tolerance_days"]))
    fuzzy_t = float(p.get("fuzzy_threshold", TOLERANCE_DEFAULTS["fuzzy_threshold"]))
    vendor_t = float(p.get("vendor_threshold", TOLERANCE_DEFAULTS["vendor_threshold"]))

    builder = _RUN_CANDIDATES.get(run_type)
    if builder is None:
        raise ValueError(f"Unsupported run type: {run_type}")

    cands = builder(rows_a, rows_b, tol_abs, tol_pct, date_tol, fuzzy_t, vendor_t)
    cands.sort(key=lambda c: (c[0], -c[1]))  # tier asc (highest pref first), then best score

    matched_a: set = set()
    matched_b: set = set()
    pairs: Dict[int, Tuple[int, int, int, str]] = {}  # a_idx → (b_idx, tier, score, reason)

    for tier, score, ai, bi, reason in cands:
        if ai in matched_a or bi in matched_b:
            continue
        if ai in pairs:
            continue
        matched_a.add(ai)
        matched_b.add(bi)
        pairs[ai] = (bi, tier, score, reason)

    items: List[Dict[str, Any]] = []
    for ai, a in enumerate(rows_a):
        if ai in pairs:
            bi, tier, score, reason = pairs[ai]
            items.append({
                "recordA": a,
                "recordB": rows_b[bi],
                "matchStatus": _status_for(run_type, tier),
                "score": score,
                "reasons": [reason],
                "matchedBy": TIER_STATUS[tier],
            })
        else:
            items.append({
                "recordA": a,
                "recordB": None,
                "matchStatus": "unmatched",
                "score": 0.0,
                "reasons": ["No matching record found on the counterpart side"],
                "matchedBy": None,
            })
    for bi, b in enumerate(rows_b):
        if bi in matched_b:
            continue
        items.append({
            "recordA": None,
            "recordB": b,
            "matchStatus": "unmatched",
            "score": 0.0,
            "reasons": ["Record present on counterpart side without a books match (ITC to verify)"],
            "matchedBy": None,
        })

    # metrics + duplicate detection
    status_tally: Dict[str, int] = {}
    for it in items:
        status_tally[it["matchStatus"]] = status_tally.get(it["matchStatus"], 0) + 1
    tiers_tally: Dict[str, int] = {}
    for ai, (_, tier, _, _) in pairs.items():
        tiers_tally[TIER_STATUS[tier]] = tiers_tally.get(TIER_STATUS[tier], 0) + 1

    seen: Dict[Tuple, int] = {}
    duplicates = 0
    for a in rows_a:
        key = (_field(a, "invoice"), _field(a, "amount"), _field(a, "gstin"))
        if key[0]:
            seen[key] = seen.get(key, 0) + 1
            if seen[key] > 1:
                duplicates += 1

    metrics: Dict[str, Any] = {
        "total": len(items),
        "totalA": len(rows_a),
        "totalB": len(rows_b),
        "matched": len(pairs),
        "matchedCount": len(pairs),
        "unmatched": len(items) - len(pairs),
        "unmatchedCount": len(items) - len(pairs),
        "unmatchedA": len(rows_a) - len(pairs),
        "unmatchedB": len(rows_b) - len(pairs),
        "duplicates": duplicates,
        "byStatus": status_tally,
        "byTier": tiers_tally,
        "tolerances": {"amountToleranceAbs": tol_abs, "amountTolerancePct": tol_pct, "dateToleranceDays": date_tol},
    }
    return {"items": items, "metrics": metrics, "warnings": []}