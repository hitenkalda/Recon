#!/usr/bin/env python3
"""Full-size stress benchmark on real 100k datasets.

Measures:
  - GST total runtime, rows, candidates, peak RAM, match/unmatched counts
  - Bank total runtime, rows, candidates, peak RAM, match/unmatched counts
  - Comparison against ground truth cases
"""
import sys, os, time, tracemalloc, json, gc
from pathlib import Path
from collections import Counter

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent))

from engine import parse as P
from engine import match as M
from engine import normalize as N

DATASET = Path(__file__).parent.parent.parent.parent / "ReconAI_real_world_stress_dataset_v1"
GROUND_TRUTH = DATASET / "ground_truth_stress.json"

# ── helpers ──────────────────────────────────────────────────────────────────

def load_csv(name):
    path = DATASET / name
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = list(P._read_csv(f, name))
    return rows


def engine_rows(name):
    """parse.read_rows + normalize_rows → [{index, data}]"""
    path = DATASET / name
    raw = path.read_bytes()
    headers, body, _ = P.read_rows(raw, name)
    norm = P.normalize_rows(headers, body)
    return [{"index": r["rowIndex"], "data": r["data"]} for r in norm]


def peak_mb():
    _, peak = tracemalloc.get_traced_memory()
    return peak / 1024 / 1024


def count_candidates(run_type, a_rows, b_rows):
    """Count candidate pairs generated (without greedy dedup)."""
    builder = M._RUN_CANDIDATES[run_type]
    tol_abs = M.TOLERANCE_DEFAULTS["amount_tolerance_abs"]
    tol_pct = M.TOLERANCE_DEFAULTS["amount_tolerance_pct"]
    date_tol = M.TOLERANCE_DEFAULTS["date_tolerance_days"]
    fuzzy_t = M.TOLERANCE_DEFAULTS["fuzzy_threshold"]
    vendor_t = M.TOLERANCE_DEFAULTS["vendor_threshold"]
    cands = builder(a_rows, b_rows, tol_abs, tol_pct, date_tol, fuzzy_t, vendor_t)
    return len(cands)


# ── main ─────────────────────────────────────────────────────────────────────

def run_gst():
    print("\n" + "=" * 70)
    print("GST FULL-SIZE MATCH  (gst_purchase_ledger_100k × gst_gstr2b_107k)")
    print("=" * 70)

    print("Loading datasets...", flush=True)
    t0 = time.time()
    a_rows = engine_rows("gst_purchase_ledger_100k.csv")
    b_rows = engine_rows("gst_gstr2b_107k.csv")
    load_dt = time.time() - t0
    print(f"  Loaded {len(a_rows)} A-rows, {len(b_rows)} B-rows in {load_dt:.1f}s  peak={peak_mb():.1f}MB", flush=True)
    del a_rows, b_rows
    gc.collect()
    tracemalloc.stop()

    # --- Candidate count ---
    print("\nCounting candidates...", flush=True)
    tracemalloc.start()
    t0 = time.time()
    a_rows = engine_rows("gst_purchase_ledger_100k.csv")
    b_rows = engine_rows("gst_gstr2b_107k.csv")
    n_cands = count_candidates("gst", a_rows, b_rows)
    cand_dt = time.time() - t0
    cand_peak = peak_mb()
    print(f"  Candidates: {n_cands:,} in {cand_dt:.1f}s  peak={cand_peak:.1f}MB", flush=True)
    tracemalloc.stop()

    # --- Full match ---
    print("\nRunning full GST match...", flush=True)
    tracemalloc.start()
    t0 = time.time()
    result = M.match("gst", a_rows, b_rows, {})
    match_dt = time.time() - t0
    match_peak = peak_mb()
    tracemalloc.stop()

    items = result["items"]
    matched = sum(1 for it in items if it.get("recordA") and it.get("recordB"))
    unmatched_a = sum(1 for it in items if it.get("recordA") and not it.get("recordB"))
    unmatched_b = sum(1 for it in items if not it.get("recordA") and it.get("recordB"))
    metrics = result.get("metrics", {})

    print(f"\n  Runtime:         {match_dt:.1f}s")
    print(f"  A rows:          {len(a_rows):,}")
    print(f"  B rows:          {len(b_rows):,}")
    print(f"  Cross-product:   {len(a_rows)*len(b_rows):,}")
    print(f"  Candidates:      {n_cands:,} ({n_cands/(len(a_rows)*len(b_rows))*100:.2f}%)")
    print(f"  Matched:         {matched:,}")
    print(f"  Unmatched A:     {unmatched_a:,}")
    print(f"  Unmatched B:     {unmatched_b:,}")
    print(f"  Peak RAM:        {match_peak:.1f} MB")
    print(f"  Metrics:         {json.dumps(metrics, indent=4)}", flush=True)

    # Tier breakdown
    tiers = Counter()
    for it in items:
        tb = it.get("matchedBy")
        if tb:
            tiers[tb] += 1
    print(f"  Tier breakdown:  {dict(tiers)}")

    return {
        "matcher": "gst",
        "a_rows": len(a_rows),
        "b_rows": len(b_rows),
        "cross_product": len(a_rows) * len(b_rows),
        "candidates": n_cands,
        "candidate_pct": round(n_cands / (len(a_rows) * len(b_rows)) * 100, 4),
        "runtime_seconds": round(match_dt, 2),
        "load_seconds": round(load_dt, 2),
        "candidate_count_seconds": round(cand_dt, 2),
        "peak_ram_mb": round(match_peak, 1),
        "matched": matched,
        "unmatched_a": unmatched_a,
        "unmatched_b": unmatched_b,
        "metrics": metrics,
        "tier_breakdown": dict(tiers),
    }


def run_bank():
    print("\n" + "=" * 70)
    print("BANK FULL-SIZE MATCH  (bank_book_105k × bank_statement_106k)")
    print("=" * 70)

    print("Loading datasets...", flush=True)
    t0 = time.time()
    a_rows = engine_rows("bank_book_105k.csv")
    b_rows = engine_rows("bank_statement_106k.csv")
    load_dt = time.time() - t0
    print(f"  Loaded {len(a_rows)} A-rows, {len(b_rows)} B-rows in {load_dt:.1f}s  peak={peak_mb():.1f}MB", flush=True)
    del a_rows, b_rows
    gc.collect()
    tracemalloc.stop()

    # --- Candidate count ---
    print("\nCounting candidates...", flush=True)
    tracemalloc.start()
    t0 = time.time()
    a_rows = engine_rows("bank_book_105k.csv")
    b_rows = engine_rows("bank_statement_106k.csv")
    n_cands = count_candidates("bank", a_rows, b_rows)
    cand_dt = time.time() - t0
    cand_peak = peak_mb()
    print(f"  Candidates: {n_cands:,} in {cand_dt:.1f}s  peak={cand_peak:.1f}MB", flush=True)
    tracemalloc.stop()

    # --- Full match ---
    print("\nRunning full Bank match...", flush=True)
    tracemalloc.start()
    t0 = time.time()
    result = M.match("bank", a_rows, b_rows, {})
    match_dt = time.time() - t0
    match_peak = peak_mb()
    tracemalloc.stop()

    items = result["items"]
    matched = sum(1 for it in items if it.get("recordA") and it.get("recordB"))
    unmatched_a = sum(1 for it in items if it.get("recordA") and not it.get("recordB"))
    unmatched_b = sum(1 for it in items if not it.get("recordA") and it.get("recordB"))
    metrics = result.get("metrics", {})

    print(f"\n  Runtime:         {match_dt:.1f}s")
    print(f"  A rows:          {len(a_rows):,}")
    print(f"  B rows:          {len(b_rows):,}")
    print(f"  Cross-product:   {len(a_rows)*len(b_rows):,}")
    print(f"  Candidates:      {n_cands:,} ({n_cands/(len(a_rows)*len(b_rows))*100:.2f}%)")
    print(f"  Matched:         {matched:,}")
    print(f"  Unmatched A:     {unmatched_a:,}")
    print(f"  Unmatched B:     {unmatched_b:,}")
    print(f"  Peak RAM:        {match_peak:.1f} MB")
    print(f"  Metrics:         {json.dumps(metrics, indent=4)}", flush=True)

    # Tier breakdown
    tiers = Counter()
    for it in items:
        tb = it.get("matchedBy")
        if tb:
            tiers[tb] += 1
    print(f"  Tier breakdown:  {dict(tiers)}")

    return {
        "matcher": "bank",
        "a_rows": len(a_rows),
        "b_rows": len(b_rows),
        "cross_product": len(a_rows) * len(b_rows),
        "candidates": n_cands,
        "candidate_pct": round(n_cands / (len(a_rows) * len(b_rows)) * 100, 4),
        "runtime_seconds": round(match_dt, 2),
        "load_seconds": round(load_dt, 2),
        "candidate_count_seconds": round(cand_dt, 2),
        "peak_ram_mb": round(match_peak, 1),
        "matched": matched,
        "unmatched_a": unmatched_a,
        "unmatched_b": unmatched_b,
        "metrics": metrics,
        "tier_breakdown": dict(tiers),
    }


def compare_ground_truth(gst_result, bank_result):
    print("\n" + "=" * 70)
    print("GROUND TRUTH COMPARISON")
    print("=" * 70)

    with open(GROUND_TRUTH, encoding="utf-8") as f:
        gt = json.load(f)

    # GST
    print("\n--- GST ---")
    gt_gst = gt.get("gst", {})
    gt_cases = gt_gst.get("cases", [])
    gt_matched = gt_gst.get("expected_matched", "N/A")
    print(f"  Expected matched (GT): {gt_matched}")
    print(f"  Actual matched:        {gst_result['matched']}")
    print(f"  GT case types: {list(gt_cases)}")

    # Check specific cases
    for case in gt_cases:
        case_data = gt_gst.get(case, {})
        if isinstance(case_data, dict):
            exp = case_data.get("expected_matched", case_data.get("count", "N/A"))
            actual = case_data.get("actual_matched", "N/A")
            print(f"  Case '{case}': expected={exp}, actual={actual}")

    # Bank
    print("\n--- BANK ---")
    gt_bank = gt.get("bank", {})
    gt_cases = gt_bank.get("cases", [])
    gt_matched = gt_bank.get("expected_matched", "N/A")
    print(f"  Expected matched (GT): {gt_matched}")
    print(f"  Actual matched:        {bank_result['matched']}")
    print(f"  GT case types: {list(gt_cases)}")

    for case in gt_cases:
        case_data = gt_bank.get(case, {})
        if isinstance(case_data, dict):
            exp = case_data.get("expected_matched", case_data.get("count", "N/A"))
            actual = case_data.get("actual_matched", "N/A")
            print(f"  Case '{case}': expected={exp}, actual={actual}")


def main():
    print(f"Dataset: {DATASET}")
    print(f"Ground truth: {GROUND_TRUTH}")
    print(f"Python: {sys.version}")
    print(f"RapidFuzz: available = {__import__('rapidfuzz').__version__ if 'rapidfuzz' in sys.modules or True else 'yes'}", flush=True)

    # Quick RapidFuzz check
    try:
        from rapidfuzz.distance import Levenshtein
        print("RapidFuzz: OK", flush=True)
    except ImportError:
        print("RapidFuzz: MISSING", flush=True)

    gst_result = run_gst()
    bank_result = run_bank()
    compare_ground_truth(gst_result, bank_result)

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"{'Matcher':<10} {'A rows':>8} {'B rows':>8} {'Candidates':>12} {'Cand%':>8} {'Runtime':>10} {'Matched':>10} {'Peak MB':>10}")
    print("-" * 80)
    for r in [gst_result, bank_result]:
        print(f"{r['matcher']:<10} {r['a_rows']:>8,} {r['b_rows']:>8,} {r['candidates']:>12,} {r['candidate_pct']:>7.2f}% {r['runtime_seconds']:>9.1f}s {r['matched']:>10,} {r['peak_ram_mb']:>9.1f}")

    total_time = gst_result['runtime_seconds'] + bank_result['runtime_seconds']
    print(f"\nTotal matcher runtime: {total_time:.1f}s ({total_time/60:.1f} min)")

    # Save results
    out_path = Path(__file__).parent / "benchmark_data" / "full_size_results.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"gst": gst_result, "bank": bank_result, "timestamp": time.isoformat()}, f, indent=2)
    print(f"Results saved to: {out_path}")


if __name__ == "__main__":
    main()
