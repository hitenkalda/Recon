#!/usr/bin/env python3
"""Accuracy verification + performance benchmark for Jaccard pre-filter + RapidFuzz.

Compares the optimized matchers against a self-contained pure-Python reference
implementation (identical logic, no RapidFuzz dependency).
"""
import sys, os, time, random, bisect
from collections import Counter, defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine import match as M
from engine import normalize as N


# ── Pure-Python reference Levenshtein (identical algorithm, no C extension) ──

def _py_levenshtein(a: str, b: str, max_dist=None):
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if la > 100 or lb > 100:
        common = sum(1 for x, y in zip(a, b) if x == y)
        result = max(la, lb) - common
        if max_dist is not None and result > max_dist:
            return max_dist + 1
        return result
    if not a:
        return min(lb, max_dist + 1) if max_dist is not None else lb
    if not b:
        return min(la, max_dist + 1) if max_dist is not None else la
    if max_dist is not None and la - lb > max_dist:
        return max_dist + 1
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i]
        row_min = i
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            val = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            cur.append(val)
            if val < row_min:
                row_min = val
        if max_dist is not None and row_min > max_dist:
            return max_dist + 1
        prev = cur
    result = prev[lb]
    if max_dist is not None and result > max_dist:
        return max_dist + 1
    return result


def _py_similarity(a: str, b: str, max_dist=None):
    if not a or not b:
        return 0.0
    d = _py_levenshtein(a, b, max_dist)
    if max_dist is not None and d > max_dist:
        return 0.0
    return 1.0 - (d / max(len(a), len(b)))


# ── Reference matcher implementations (pure Python levenshtein) ─────────────

def _candidates_gst_original(a_rows, b_rows, tol_abs, tol_pct, date_tol, fuzzy_t, vendor_t):
    """Original O(K) amount-bisect matcher using pure-Python Levenshtein."""
    from datetime import date as _date
    nb = len(b_rows)
    b_inv = [None] * nb
    b_gst = [None] * nb
    b_amt = [None] * nb
    b_date_ord = [0] * nb
    b_vendor = [None] * nb
    for bi in range(nb):
        b = b_rows[bi]
        b_inv[bi] = N.normalize_invoice(M._field(b, "invoice"))
        b_gst[bi] = M._field(b, "gstin") or M._field(b, "pan")
        b_amt[bi] = M._field(b, "amount")
        dt = M._field(b, "date")
        if dt:
            try:
                b_date_ord[bi] = _date.fromisoformat(dt).toordinal()
            except (ValueError, TypeError):
                b_date_ord[bi] = 0
        b_vendor[bi] = M._field(b, "vendor")

    inv_idx = defaultdict(list)
    gst_idx = defaultdict(list)
    for bi in range(nb):
        inv = b_inv[bi]
        if inv:
            inv_idx[inv].append(bi)
        gst = b_gst[bi]
        if gst:
            gst_idx[gst].append(bi)

    sorted_amts = sorted(
        ((b_amt[bi] if b_amt[bi] is not None else float("inf"), bi) for bi in range(nb)),
        key=lambda x: x[0],
    )
    sorted_vals = [x[0] for x in sorted_amts]
    seen = {}

    for ai, a in enumerate(a_rows):
        a_inv = N.normalize_invoice(M._field(a, "invoice"))
        a_gst = M._field(a, "gstin") or M._field(a, "pan")
        a_amt = M._field(a, "amount")
        a_date = M._field(a, "date")
        a_vendor = M._field(a, "vendor")
        a_date_ord = 0
        if a_date:
            try:
                a_date_ord = _date.fromisoformat(a_date).toordinal()
            except (ValueError, TypeError):
                a_date_ord = 0

        if a_inv and a_inv in inv_idx:
            for bi in inv_idx[a_inv]:
                if (ai, bi) in seen:
                    continue
                ba = b_amt[bi]
                if M.amounts_close(a_amt, ba, tol_abs, tol_pct):
                    seen[(ai, bi)] = (1, M._scaled_score(M.TIER_BASE_SCORE[1], a_amt, ba), "Exact invoice + amount")

        if a_gst and a_gst in gst_idx:
            for bi in gst_idx[a_gst]:
                if (ai, bi) in seen:
                    continue
                ba = b_amt[bi]
                if M.amounts_close(a_amt, ba, tol_abs, tol_pct):
                    seen[(ai, bi)] = (2, M._scaled_score(M.TIER_BASE_SCORE[2], a_amt, ba), "GSTIN/PAN + amount")

        if a_amt is None:
            continue

        lo = min(a_amt - tol_abs, a_amt * (1.0 - tol_pct / 100.0))
        hi = max(a_amt + tol_abs, a_amt * (1.0 + tol_pct / 100.0))
        left = bisect.bisect_left(sorted_vals, lo)
        right = bisect.bisect_right(sorted_vals, hi)

        for idx in range(left, right):
            bi = sorted_amts[idx][1]
            if (ai, bi) in seen:
                continue
            ba = b_amt[bi]
            if not M.amounts_close(a_amt, ba, tol_abs, tol_pct):
                continue
            if M.amounts_close(a_amt, ba, tol_abs, 0.0):
                seen[(ai, bi)] = (3, M.TIER_BASE_SCORE[3], "Identical amount")
                continue
            if a_date_ord and b_date_ord[bi] and abs(a_date_ord - b_date_ord[bi]) <= date_tol:
                seen[(ai, bi)] = (4, M.TIER_BASE_SCORE[4], "Amount + date within tolerance")
                continue
            bb_inv = b_inv[bi]
            if a_inv and bb_inv:
                _md = int((1 - fuzzy_t) * max(len(a_inv), len(bb_inv)))
                if _py_similarity(a_inv, bb_inv, _md) >= fuzzy_t:
                    seen[(ai, bi)] = (5, M._scaled_score(M.TIER_BASE_SCORE[5], a_amt, ba), "Fuzzy invoice match")
                    continue
            bv = b_vendor[bi]
            if a_vendor and bv:
                _av = a_vendor.lower()
                _bv = bv.lower()
                _md = int((1 - vendor_t) * max(len(_av), len(_bv)))
                if _py_similarity(_av, _bv, _md) >= vendor_t:
                    seen[(ai, bi)] = (6, M._scaled_score(M.TIER_BASE_SCORE[6], a_amt, ba), "Vendor similarity + amount")
                    continue
            seen[(ai, bi)] = (7, M.TIER_BASE_SCORE[7], "Amount within tolerance")

    cands = [(tier, score, ai, bi, reason) for (ai, bi), (tier, score, reason) in seen.items()]
    cands.sort(key=lambda c: (c[0], -c[1], c[2], c[3]))
    return cands


def _candidates_bank_original(a_rows, b_rows, tol_abs, tol_pct, date_tol, fuzzy_t, vendor_t):
    """Original O(K) amount-bisect matcher using pure-Python Levenshtein."""
    from datetime import date as _date
    nb = len(b_rows)
    b_amt = [None] * nb
    b_date_ord = [0] * nb
    b_ref = [None] * nb
    b_vendor = [None] * nb
    for bi in range(nb):
        b = b_rows[bi]
        b_amt[bi] = M._field(b, "amount")
        dt = M._field(b, "date")
        if dt:
            try:
                b_date_ord[bi] = _date.fromisoformat(dt).toordinal()
            except (ValueError, TypeError):
                b_date_ord[bi] = 0
        b_ref[bi] = M._field(b, "ref") or M._field(b, "description")
        b_vendor[bi] = M._field(b, "vendor") or M._field(b, "description")

    sorted_amts = sorted(
        ((b_amt[bi] if b_amt[bi] is not None else float("inf"), bi) for bi in range(nb)),
        key=lambda x: x[0],
    )
    sorted_vals = [x[0] for x in sorted_amts]
    seen = {}

    for ai, a in enumerate(a_rows):
        a_amt = M._field(a, "amount")
        a_date = M._field(a, "date")
        a_ref = M._field(a, "ref") or M._field(a, "description")
        a_vendor = M._field(a, "vendor") or M._field(a, "description")
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
        left = bisect.bisect_left(sorted_vals, lo)
        right = bisect.bisect_right(sorted_vals, hi)
        for idx in range(left, right):
            bi = sorted_amts[idx][1]
            if (ai, bi) in seen:
                continue
            ba = b_amt[bi]
            if not M.amounts_close(a_amt, ba, tol_abs, tol_pct):
                continue
            same_ref = a_ref and b_ref[bi] and a_ref.upper() == b_ref[bi].upper()
            same_date = a_date_ord and b_date_ord[bi] and a_date_ord == b_date_ord[bi]
            if M.amounts_close(a_amt, ba, tol_abs, 0.0) and (same_ref or same_date):
                seen[(ai, bi)] = (1, M.TIER_BASE_SCORE[1], "Amount + reference/date")
                continue
            if a_date_ord and b_date_ord[bi] and abs(a_date_ord - b_date_ord[bi]) <= date_tol:
                seen[(ai, bi)] = (2, M.TIER_BASE_SCORE[2], "Amount + date within tolerance")
                continue
            if a_ref and b_ref[bi]:
                _ar = a_ref.upper()
                _br = b_ref[bi].upper()
                _md = int((1 - fuzzy_t) * max(len(_ar), len(_br)))
                if _py_similarity(_ar, _br, _md) >= fuzzy_t:
                    seen[(ai, bi)] = (3, M.TIER_BASE_SCORE[3], "Fuzzy narration/reference")
                    continue
            bv = b_vendor[bi]
            if a_vendor and bv:
                _av = a_vendor.lower()
                _bv = bv.lower()
                _md = int((1 - vendor_t) * max(len(_av), len(_bv)))
                if _py_similarity(_av, _bv, _md) >= vendor_t:
                    seen[(ai, bi)] = (4, M.TIER_BASE_SCORE[4], "Amount + counterparty similarity")
                    continue
            seen[(ai, bi)] = (5, M.TIER_BASE_SCORE[5], "Amount within tolerance")

    cands = [(tier, score, ai, bi, reason) for (ai, bi), (tier, score, reason) in seen.items()]
    cands.sort(key=lambda c: (c[0], -c[1], c[2], c[3]))
    return cands


# ── Data generation ──────────────────────────────────────────────────────────

def gen_gst(n):
    vendors = ["Reliance Industries", "Tata Consultancy", "Infosys Ltd", "Wipro Enterprises", "HCL Technologies"]
    a_rows, b_rows = [], []
    for i in range(n):
        v = vendors[i % len(vendors)]
        inv = f"INV-{random.randint(100000, 999999)}"
        amt = round(random.uniform(5000, 500000), 2)
        gstin = f"27{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=10))}1Z{random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}"
        dt = f"2025-{random.randint(4, 12):02d}-{random.randint(1, 28):02d}"
        a_rows.append({"index": i, "data": {"invoice": inv, "amount": amt, "gstin": gstin, "date": dt, "vendor": v}})
        if i < n * 0.3:
            b_rows.append({"index": i, "data": {"invoice": inv, "amount": round(amt * random.uniform(0.98, 1.02), 2), "gstin": gstin, "date": dt, "vendor": v}})
        else:
            b_rows.append({"index": i, "data": {"invoice": f"INV-{random.randint(100000, 999999)}", "amount": round(random.uniform(5000, 500000), 2), "gstin": f"27{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=10))}1Z{random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')}", "date": dt, "vendor": vendors[random.randint(0, len(vendors) - 1)]}})
    return a_rows, b_rows


def gen_bank(n):
    narrations = ["Payment to vendor", "Salary transfer", "Electricity bill", "Office rent", "Client payment"]
    a_rows, b_rows = [], []
    for i in range(n):
        narr = narrations[i % len(narrations)]
        amt = round(random.uniform(500, 200000), 2)
        dt = f"2025-{random.randint(4, 12):02d}-{random.randint(1, 28):02d}"
        ref = f"UTR{random.randint(10000000, 99999999)}"
        a_rows.append({"index": i, "data": {"amount": amt, "date": dt, "ref": ref, "vendor": narr, "description": narr}})
        if i < n * 0.3:
            b_rows.append({"index": i, "data": {"amount": round(amt * random.uniform(0.98, 1.02), 2), "date": dt, "ref": ref, "vendor": narr, "description": narr}})
        else:
            b_rows.append({"index": i, "data": {"amount": round(random.uniform(500, 200000), 2), "date": dt, "ref": f"UTR{random.randint(10000000, 99999999)}", "vendor": narrations[random.randint(0, len(narrations) - 1)], "description": narrations[random.randint(0, len(narrations) - 1)]}})
    return a_rows, b_rows


if __name__ == "__main__":
    random.seed(42)

    print("=" * 60)
    print("Accuracy Verification (pure-Python ref vs optimized)")
    print("=" * 60)

    for size in [100, 200, 500, 1000]:
        a, b = gen_gst(size)
        orig = _candidates_gst_original(a, b, 1.0, 2.0, 3, 0.85, 0.75)
        opt = M._candidates_gst(a, b, 1.0, 2.0, 3, 0.85, 0.75)
        match = orig == opt
        print(f"GST  {size:4d}x{size:4d}: ref={len(orig):5d}, opt={len(opt):5d}, identical={match}")
        assert match, f"GST {size}x{size} mismatch!"

        a, b = gen_bank(size)
        orig = _candidates_bank_original(a, b, 1.0, 2.0, 3, 0.85, 0.75)
        opt = M._candidates_bank(a, b, 1.0, 2.0, 3, 0.85, 0.75)
        match = orig == opt
        print(f"Bank {size:4d}x{size:4d}: ref={len(orig):5d}, opt={len(opt):5d}, identical={match}")
        assert match, f"Bank {size}x{size} mismatch!"

    print("\n" + "=" * 60)
    print("Performance Benchmark (3 runs each, pure-Python ref vs RapidFuzz)")
    print("=" * 60)

    for size in [500, 1000, 2000]:
        # GST
        a, b = gen_gst(size)
        gst_ref_times, gst_opt_times = [], []
        for _ in range(3):
            t0 = time.perf_counter()
            _candidates_gst_original(a, b, 1.0, 2.0, 3, 0.85, 0.75)
            gst_ref_times.append(time.perf_counter() - t0)
            t0 = time.perf_counter()
            M._candidates_gst(a, b, 1.0, 2.0, 3, 0.85, 0.75)
            gst_opt_times.append(time.perf_counter() - t0)
        gst_ref_avg = sum(gst_ref_times) / len(gst_ref_times)
        gst_opt_avg = sum(gst_opt_times) / len(gst_opt_times)
        print(f"GST  {size:4d}x{size:4d}: ref={gst_ref_avg:.2f}s  opt={gst_opt_avg:.2f}s  speedup={gst_ref_avg/gst_opt_avg:.1f}x")

        # Bank
        a, b = gen_bank(size)
        bank_ref_times, bank_opt_times = [], []
        for _ in range(3):
            t0 = time.perf_counter()
            _candidates_bank_original(a, b, 1.0, 2.0, 3, 0.85, 0.75)
            bank_ref_times.append(time.perf_counter() - t0)
            t0 = time.perf_counter()
            M._candidates_bank(a, b, 1.0, 2.0, 3, 0.85, 0.75)
            bank_opt_times.append(time.perf_counter() - t0)
        bank_ref_avg = sum(bank_ref_times) / len(bank_ref_times)
        bank_opt_avg = sum(bank_opt_times) / len(bank_opt_times)
        print(f"Bank {size:4d}x{size:4d}: ref={bank_ref_avg:.2f}s  opt={bank_opt_avg:.2f}s  speedup={bank_ref_avg/bank_opt_avg:.1f}x")

    print("\n" + "=" * 60)
    print("ALL ACCURACY CHECKS PASSED")
    print("=" * 60)
