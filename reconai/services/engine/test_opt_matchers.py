#!/usr/bin/env python3
"""Quick accuracy smoke test for optimized GST/Bank matchers."""
import sys, time, gc, bisect
sys.path.insert(0, '.')
from engine import match as M
from engine.normalize import amounts_close, normalize_invoice, similarity
from datetime import date as _date
from collections import defaultdict

# ─── Optimized GST matcher ────────────────────────────────────────────────────
def _candidates_gst_opt(a_rows, b_rows, tol_abs, tol_pct, date_tol, fuzzy_t, vendor_t):
    nb = len(b_rows)

    b_inv = [None] * nb
    b_gst = [None] * nb
    b_amt = [None] * nb
    b_date_ord = [0] * nb
    b_vendor = [None] * nb
    for bi in range(nb):
        b = b_rows[bi]
        b_inv[bi] = normalize_invoice(M._field(b, "invoice"))
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
    exact_amt = defaultdict(list)
    date_ord_idx = defaultdict(list)

    for bi in range(nb):
        inv = b_inv[bi]
        if inv:
            inv_idx[inv].append(bi)
        gst = b_gst[bi]
        if gst:
            gst_idx[gst].append(bi)
        amt = b_amt[bi]
        if amt is not None:
            exact_amt[round(amt)].append(bi)
        do = b_date_ord[bi]
        if do:
            date_ord_idx[do].append(bi)

    sorted_amts = sorted(
        ((b_amt[bi] if b_amt[bi] is not None else float("inf"), bi) for bi in range(nb)),
        key=lambda x: x[0],
    )
    sorted_vals = [x[0] for x in sorted_amts]

    seen = {}

    for ai, a in enumerate(a_rows):
        a_inv = normalize_invoice(M._field(a, "invoice"))
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

        # Tier 1: exact invoice + amount
        if a_inv and a_inv in inv_idx:
            for bi in inv_idx[a_inv]:
                if (ai, bi) in seen:
                    continue
                ba = b_amt[bi]
                if amounts_close(a_amt, ba, tol_abs, tol_pct):
                    seen[(ai, bi)] = (1, M._scaled_score(1.0, a_amt, ba), "Exact invoice + amount")

        # Tier 2: GSTIN/PAN + amount
        if a_gst and a_gst in gst_idx:
            for bi in gst_idx[a_gst]:
                if (ai, bi) in seen:
                    continue
                ba = b_amt[bi]
                if amounts_close(a_amt, ba, tol_abs, tol_pct):
                    seen[(ai, bi)] = (2, M._scaled_score(0.95, a_amt, ba), "GSTIN/PAN + amount")

        if a_amt is None:
            continue

        # Tier 3: identical amount — direct hash lookup
        for bi in exact_amt.get(round(a_amt), ()):
            if (ai, bi) in seen:
                continue
            seen[(ai, bi)] = (3, 0.90, "Identical amount")

        # Tier 4: amount + date within tolerance — scan date window
        if a_date_ord:
            for d_ord in range(a_date_ord - date_tol, a_date_ord + date_tol + 1):
                for bi in date_ord_idx.get(d_ord, ()):
                    if (ai, bi) in seen:
                        continue
                    if amounts_close(a_amt, b_amt[bi], tol_abs, tol_pct):
                        seen[(ai, bi)] = (4, 0.88, "Amount + date within tolerance")

        # Tiers 5-7: fallback amount-bisect, skipping already-seen pairs
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

            bb_inv = b_inv[bi]
            if a_inv and bb_inv and similarity(a_inv, bb_inv) >= fuzzy_t:
                seen[(ai, bi)] = (5, M._scaled_score(0.85, a_amt, ba), "Fuzzy invoice match")
                continue

            bv = b_vendor[bi]
            if a_vendor and bv and similarity(a_vendor.lower(), bv.lower()) >= vendor_t:
                seen[(ai, bi)] = (6, M._scaled_score(0.80, a_amt, ba), "Vendor similarity + amount")
                continue

            seen[(ai, bi)] = (7, 0.75, "Amount within tolerance")

    cands = [(t, s, ai, bi, r) for (ai, bi), (t, s, r) in seen.items()]
    cands.sort(key=lambda c: (c[0], -c[1], c[2], c[3]))
    return cands


# ─── Optimized Bank matcher ───────────────────────────────────────────────────
def _candidates_bank_opt(a_rows, b_rows, tol_abs, tol_pct, date_tol, fuzzy_t, vendor_t):
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

    exact_amt = defaultdict(list)
    date_ord_idx = defaultdict(list)

    for bi in range(nb):
        amt = b_amt[bi]
        if amt is not None:
            exact_amt[round(amt)].append(bi)
        do = b_date_ord[bi]
        if do:
            date_ord_idx[do].append(bi)

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

        # Tier 1: amount + reference/date — check exact amount first
        for bi in exact_amt.get(round(a_amt), ()):
            if (ai, bi) in seen:
                continue
            ba = b_amt[bi]
            same_ref = a_ref and b_ref[bi] and a_ref.upper() == b_ref[bi].upper()
            same_date = a_date_ord and b_date_ord[bi] and a_date_ord == b_date_ord[bi]
            if amounts_close(a_amt, ba, tol_abs, 0.0) and (same_ref or same_date):
                seen[(ai, bi)] = (1, 1.0, "Amount + reference/date")
                continue
            if amounts_close(a_amt, ba, tol_abs, tol_pct) and (same_ref or same_date):
                seen[(ai, bi)] = (1, M._scaled_score(1.0, a_amt, ba), "Amount + reference/date")

        # Tier 2: amount + date within tolerance — scan date window
        if a_date_ord:
            for d_ord in range(a_date_ord - date_tol, a_date_ord + date_tol + 1):
                for bi in date_ord_idx.get(d_ord, ()):
                    if (ai, bi) in seen:
                        continue
                    if amounts_close(a_amt, b_amt[bi], tol_abs, tol_pct):
                        seen[(ai, bi)] = (2, 0.95, "Amount + date within tolerance")

        # Tiers 3-5: fallback amount-bisect, skipping already-seen pairs
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
                seen[(ai, bi)] = (1, 1.0, "Amount + reference/date")
                continue

            if a_date_ord and b_date_ord[bi] and abs(a_date_ord - b_date_ord[bi]) <= date_tol:
                seen[(ai, bi)] = (2, 0.95, "Amount + date within tolerance")
                continue

            if a_ref and b_ref[bi] and similarity(a_ref.upper(), b_ref[bi].upper()) >= fuzzy_t:
                seen[(ai, bi)] = (3, 0.90, "Fuzzy narration/reference")
                continue

            bv = b_vendor[bi]
            if a_vendor and bv and similarity(a_vendor.lower(), bv.lower()) >= vendor_t:
                seen[(ai, bi)] = (4, 0.85, "Amount + counterparty similarity")
                continue

            seen[(ai, bi)] = (5, 0.80, "Amount within tolerance")

    cands = [(t, s, ai, bi, r) for (ai, bi), (t, s, r) in seen.items()]
    cands.sort(key=lambda c: (c[0], -c[1], c[2], c[3]))
    return cands


# ─── Accuracy smoke tests ─────────────────────────────────────────────────────
print("=== GST accuracy smoke test ===")
a_small = [
    {"index": 0, "data": {"invoice": "INV-101", "amount": 12000.0, "gstin": "27AAACS1232F1ZU", "date": "2025-09-15"}},
    {"index": 1, "data": {"invoice": "INV-999", "amount": 500.0, "gstin": "27AAACS1232F1ZU", "date": "2025-09-16"}},
]
b_small = [
    {"index": 0, "data": {"invoice": "INV-101", "amount": 12000.0, "gstin": "27AAACS1232F1ZU", "date": "2025-09-15"}},
    {"index": 1, "data": {"invoice": "INV-777", "amount": 5000.0, "gstin": "27AAACS1232F1ZU", "date": "2025-09-18"}},
]

# Monkey-patch to use optimized function
import engine.match as match_mod
orig_gst = match_mod._candidates_gst
orig_bank = match_mod._candidates_bank

match_mod._candidates_gst = _candidates_gst_opt
match_mod._candidates_bank = _candidates_bank_opt

res_opt = M.match("gst", a_small, b_small, {})
statuses = {i["matchStatus"] for i in res_opt["items"]}
print(f"Optimized GST: matched={res_opt['metrics']['matched']}, statuses={statuses}")
assert res_opt["metrics"]["matched"] == 1, f"Expected 1 match, got {res_opt['metrics']['matched']}"
assert "exact_invoice" in statuses, f"Expected exact_invoice, got {statuses}"
print("GST smoke test PASSED")

# Bank smoke test
a_bank = [{"index": 0, "data": {"amount": 25000.0, "date": "2025-03-01", "ref": "UTR123"}}]
b_bank = [{"index": 0, "data": {"amount": 24995.0, "date": "2025-03-02", "ref": "UTR999"}}]
res_bank = M.match("bank", a_bank, b_bank, {})
statuses_b = {i["matchStatus"] for i in res_bank["items"]}
print(f"Optimized Bank: matched={res_bank['metrics']['matched']}, statuses={statuses_b}")
assert res_bank["metrics"]["matched"] == 1
assert "date_tolerance" in statuses_b or "exact_invoice" in statuses_b
print("Bank smoke test PASSED")

# Restore original
match_mod._candidates_gst = orig_gst
match_mod._candidates_bank = orig_bank

# ─── Performance comparison on full 2000×2000 probe ───────────────────────────
from pathlib import Path
from engine import parse as P

DATASET = Path("C:/Users/DELL/Desktop/ReconAI/ReconAI_real_world_stress_dataset_v1")
def erows(name):
    raw = (DATASET / name).read_bytes()
    headers, body, _ = P.read_rows(raw, str(name))
    norm = P.normalize_rows(headers, body)
    return [{"index": r["rowIndex"], "data": r["data"]} for r in norm]

a = erows("gst_purchase_ledger_100k.csv")[:2000]
b = erows("gst_gstr2b_107k.csv")[:2000]

# Original
gc.collect()
t0 = time.time()
res_orig = M.match("gst", a, b, {})
dt_orig = time.time() - t0

# Optimized
match_mod._candidates_gst = _candidates_gst_opt
gc.collect()
t0 = time.time()
res_opt = M.match("gst", a, b, {})
dt_opt = time.time() - t0
match_mod._candidates_gst = orig_gst

print(f"\nGST 2000x2000: original={dt_orig:.2f}s, optimized={dt_opt:.2f}s, speedup={dt_orig/dt_opt:.1f}x")
print(f"  Original matches: {res_orig['metrics']['matched']}, Optimized: {res_opt['metrics']['matched']}")

# Bank
a2 = erows("bank_book_105k.csv")[:2000]
b2 = erows("bank_statement_106k.csv")[:2000]

gc.collect()
t0 = time.time()
res_orig2 = M.match("bank", a2, b2, {})
dt_orig2 = time.time() - t0

match_mod._candidates_bank = _candidates_bank_opt
gc.collect()
t0 = time.time()
res_opt2 = M.match("bank", a2, b2, {})
dt_opt2 = time.time() - t0
match_mod._candidates_bank = orig_bank

print(f"Bank 2000x2000: original={dt_orig2:.2f}s, optimized={dt_opt2:.2f}s, speedup={dt_orig2/dt_opt2:.1f}x")
print(f"  Original matches: {res_orig2['metrics']['matched']}, Optimized: {res_opt2['metrics']['matched']}")

# ─── Compare candidate sets for correctness ───────────────────────────────────
print("\n=== Candidate-set comparison ===")
# Re-run both and compare candidate tuples
match_mod._candidates_gst = _candidates_gst_opt
gc.collect()
cands_opt = match_mod._candidates_gst(a, b, 1.0, 2.0, 3, 0.85, 0.75)
match_mod._candidates_gst = orig_gst
gc.collect()
cands_orig = match_mod._candidates_gst(a, b, 1.0, 2.0, 3, 0.85, 0.75)

opt_pairs = {(c[2], c[3]) for c in cands_opt}
orig_pairs = {(c[2], c[3]) for c in cands_orig}
print(f"GST candidate pairs: original={len(orig_pairs)}, optimized={len(opt_pairs)}")
print(f"  Matching pairs: {len(orig_pairs & opt_pairs)}")
print(f"  Only in original: {len(orig_pairs - opt_pairs)}")
print(f"  Only in optimized: {len(opt_pairs - orig_pairs)}")

# Compare tier assignments for shared pairs
tier_diffs = 0
for pair in orig_pairs & opt_pairs:
    orig_tier = next(c[0] for c in cands_orig if c[2] == pair[0] and c[3] == pair[1])
    opt_tier = next(c[0] for c in cands_opt if c[2] == pair[0] and c[3] == pair[1])
    if orig_tier != opt_tier:
        tier_diffs += 1
print(f"  Tier mismatches on shared pairs: {tier_diffs}")

# Same for bank
match_mod._candidates_bank = _candidates_bank_opt
gc.collect()
cands_opt2 = match_mod._candidates_bank(a2, b2, 1.0, 2.0, 3, 0.85, 0.75)
match_mod._candidates_bank = orig_bank
gc.collect()
cands_orig2 = match_mod._candidates_bank(a2, b2, 1.0, 2.0, 3, 0.85, 0.75)

opt_pairs2 = {(c[2], c[3]) for c in cands_opt2}
orig_pairs2 = {(c[2], c[3]) for c in cands_orig2}
print(f"Bank candidate pairs: original={len(orig_pairs2)}, optimized={len(opt_pairs2)}")
print(f"  Matching pairs: {len(orig_pairs2 & opt_pairs2)}")
print(f"  Only in original: {len(orig_pairs2 - opt_pairs2)}")
print(f"  Only in optimized: {len(opt_pairs2 - orig_pairs2)}")

tier_diffs2 = 0
for pair in orig_pairs2 & opt_pairs2:
    orig_tier = next(c[0] for c in cands_orig2 if c[2] == pair[0] and c[3] == pair[1])
    opt_tier = next(c[0] for c in cands_opt2 if c[2] == pair[0] and c[3] == pair[1])
    if orig_tier != opt_tier:
        tier_diffs2 += 1
print(f"  Tier mismatches on shared pairs: {tier_diffs2}")

print("\nDone.")
