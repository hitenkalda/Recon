#!/usr/bin/env python3
"""Single-pass full-size benchmark — builds candidates once, counts + matches in one pass.
No double computation. Aggressive gc between phases.
"""
import sys
import time
import gc
import json
import argparse
from pathlib import Path
from collections import Counter

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent))

from engine import parse as P
from engine import match as M
from engine.match import TIER_STATUS, _status_for
from engine.stream_match import match_streaming

DATASET = Path(__file__).parent.parent.parent.parent / "ReconAI_real_world_stress_dataset_v1"
GROUND_TRUTH = DATASET / "ground_truth_stress.json"
OUT_DIR = Path(__file__).parent / "benchmark_data"
OUT_DIR.mkdir(exist_ok=True)


def load_rows(name):
    path = DATASET / name
    with open(path, encoding="utf-8-sig", newline="") as f:
        raw = f.read()
    headers, body, _ = P.read_rows(raw.encode("utf-8-sig"), name)
    norm = P.normalize_rows(headers, body)
    return [{"index": r["rowIndex"], "data": r["data"]} for r in norm]


def run_matcher(run_type, a_csv, b_csv):
    label = "GST" if run_type == "gst" else "BANK"
    print(f"\n{'='*70}")
    print(f"{label} FULL-SIZE MATCH  ({a_csv} x {b_csv})")
    print(f"{'='*70}")

    # Phase 1: Load data
    print(f"Loading datasets...", flush=True)
    t0 = time.time()
    a_rows = load_rows(a_csv)
    b_rows = load_rows(b_csv)
    load_dt = time.time() - t0
    n_a, n_b = len(a_rows), len(b_rows)
    print(f"  Loaded {n_a:,} A-rows, {n_b:,} B-rows in {load_dt:.1f}s", flush=True)
    gc.collect()

    # Phase 2: Streaming candidate generation + greedy dedup (single pass)
    print(f"Streaming candidate generation + greedy dedup...", flush=True)
    t0 = time.time()

    tol = M.TOLERANCE_DEFAULTS
    tol_abs = tol["amount_tolerance_abs"]
    tol_pct = tol["amount_tolerance_pct"]
    date_tol = tol["date_tolerance_days"]
    fuzzy_t = tol["fuzzy_threshold"]
    vendor_t = tol["vendor_threshold"]

    total_candidates, matched_count, matched_a, matched_b, tier_counts, pairs = match_streaming(
        run_type, a_rows, b_rows,
        tol_abs, tol_pct, date_tol, fuzzy_t, vendor_t,
    )
    n_cands = total_candidates
    print(f"  Candidates generated: {n_cands:,}", flush=True)
    gc.collect()

    match_dt = time.time() - t0
    matched = len(pairs)
    unmatched_a = n_a - matched
    unmatched_b = n_b - matched

    # Build result items
    items = []
    for ai, a in enumerate(a_rows):
        if ai in pairs:
            bi, tier, score, reason = pairs[ai]
            items.append({
                "recordA": a,
                "recordB": b_rows[bi],
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
                "score": 0,
                "reasons": [],
                "matchedBy": "Unmatched",
            })
    for bj, b in enumerate(b_rows):
        if bj not in matched_b:
            items.append({
                "recordA": None,
                "recordB": b,
                "matchStatus": "unmatched",
                "score": 0,
                "reasons": [],
                "matchedBy": "Unmatched",
            })

    metrics = {
        "total_pairs_evaluated": n_cands,
        "match_rate": round(matched / min(n_a, n_b), 4) if min(n_a, n_b) > 0 else 0,
    }

    print(f"\n  Runtime:             {match_dt:.1f}s")
    print(f"  A rows:              {n_a:,}")
    print(f"  B rows:              {n_b:,}")
    print(f"  Cross-product:       {n_a*n_b:,}")
    print(f"  Candidates:          {n_cands:,} ({n_cands/(n_a*n_b)*100:.4f}%)")
    print(f"  Matched:             {matched:,}")
    print(f"  Unmatched A:         {unmatched_a:,}")
    print(f"  Unmatched B:         {unmatched_b:,}")
    print(f"  Metrics:             {json.dumps(metrics, indent=4)}", flush=True)

    tiers = Counter()
    for ai, (bi, tier, score, reason) in pairs.items():
        tiers[reason] += 1
    print(f"  Tier breakdown:      {dict(tiers)}")

    # Release everything
    del a_rows, b_rows, items, pairs
    gc.collect()

    return {
        "matcher": run_type,
        "a_csv": a_csv,
        "b_csv": b_csv,
        "a_rows": n_a,
        "b_rows": n_b,
        "candidates": n_cands,
        "candidate_pct": round(n_cands / (n_a * n_b) * 100, 6),
        "load_seconds": round(load_dt, 2),
        "match_seconds": round(match_dt, 2),
        "total_seconds": round(load_dt + match_dt, 2),
        "matched": matched,
        "unmatched_a": unmatched_a,
        "unmatched_b": unmatched_b,
        "metrics": metrics,
        "tier_breakdown": dict(tiers),
    }


def compare_ground_truth(results):
    print(f"\n{'='*70}")
    print("GROUND TRUTH COMPARISON")
    print(f"{'='*70}")
    with open(GROUND_TRUTH, encoding="utf-8") as f:
        gt = json.load(f)

    for run_type in ["gst", "bank"]:
        if run_type not in results:
            continue
        r = results[run_type]
        gt_key = gt.get(run_type, {})
        gt_matched = gt_key.get("expected_matched", "N/A")
        print(f"\n  {run_type.upper()}:")
        print(f"    Expected matched (GT): {gt_matched}")
        print(f"    Actual matched:        {r['matched']}")
        if isinstance(gt_matched, (int, float)):
            diff = r['matched'] - int(gt_matched)
            print(f"    Delta:                 {diff:+d}")
        for case in gt_key.get("cases", []):
            case_data = gt_key.get(case, {})
            if isinstance(case_data, dict):
                exp = case_data.get("expected_matched", case_data.get("count", "N/A"))
                print(f"    Case '{case}': expected={exp}")


def main():
    parser = argparse.ArgumentParser(description="Full-size stress benchmark (single-pass)")
    parser.add_argument("--matcher", choices=["gst", "bank"], help="Run single matcher")
    parser.add_argument("--all", action="store_true", help="Run both sequentially")
    args = parser.parse_args()

    print(f"Dataset: {DATASET}")
    print(f"Ground truth: {GROUND_TRUTH}")
    print(f"Python: {sys.version}", flush=True)

    try:
        import rapidfuzz
        print(f"RapidFuzz: {rapidfuzz.__version__}", flush=True)
    except ImportError:
        print("RapidFuzz: MISSING", flush=True)

    results = {}

    if args.matcher:
        a_csv, b_csv = {
            "gst": ("gst_purchase_ledger_100k.csv", "gst_gstr2b_107k.csv"),
            "bank": ("bank_book_105k.csv", "bank_statement_106k.csv"),
        }[args.matcher]
        results[args.matcher] = run_matcher(args.matcher, a_csv, b_csv)
    elif args.all:
        a_csv, b_csv = "gst_purchase_ledger_100k.csv", "gst_gstr2b_107k.csv"
        results["gst"] = run_matcher("gst", a_csv, b_csv)
        gc.collect()
        time.sleep(5)

        a_csv, b_csv = "bank_book_105k.csv", "bank_statement_106k.csv"
        results["bank"] = run_matcher("bank", a_csv, b_csv)
        gc.collect()
    else:
        parser.print_help()
        return

    # Summary
    print(f"\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}")
    print(f"{'Matcher':<10} {'A rows':>8} {'B rows':>8} {'Candidates':>12} {'Cand%':>10} "
          f"{'Load(s)':>8} {'Match(s)':>8} {'Total(s)':>8} {'Matched':>10}")
    print("-" * 100)
    for r in results.values():
        cross = r["a_rows"] * r["b_rows"]
        cand_pct = r["candidates"] / cross * 100 if cross else 0
        print(f"{r['matcher']:<10} {r['a_rows']:>8,} {r['b_rows']:>8,} {r['candidates']:>12,} "
              f"{cand_pct:>9.4f}% {r['load_seconds']:>8.1f} {r['match_seconds']:>8.1f} "
              f"{r['total_seconds']:>8.1f} {r['matched']:>10,}")

    total = sum(r["total_seconds"] for r in results.values())
    print(f"\nTotal matcher runtime: {total:.1f}s ({total/60:.1f} min)")

    compare_ground_truth(results)

    out_path = OUT_DIR / "full_size_results.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"results": results, "timestamp": time.isoformat()}, f, indent=2)
    print(f"\nResults saved to: {out_path}")


if __name__ == "__main__":
    main()
