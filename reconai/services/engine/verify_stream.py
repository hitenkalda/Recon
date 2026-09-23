#!/usr/bin/env python3
"""Verify streaming matcher produces identical results to original."""
import sys
from pathlib import Path

if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent))

from engine import parse as P
from engine import match as M
from engine.stream_match import match_streaming

DATASET = Path(__file__).parent.parent.parent.parent / "ReconAI_real_world_stress_dataset_v1"

def load_rows(name):
    path = DATASET / name
    with open(path, encoding="utf-8-sig", newline="") as f:
        raw = f.read()
    headers, body, _ = P.read_rows(raw.encode("utf-8-sig"), name)
    norm = P.normalize_rows(headers, body)
    return [{"index": r["rowIndex"], "data": r["data"]} for r in norm]


def get_matches_orig(run_type, a_rows, b_rows):
    """Get set of (ai, bi) from original match()."""
    result = M.match(run_type, a_rows, b_rows, {})
    pairs = set()
    for it in result["items"]:
        ra, rb = it.get("recordA"), it.get("recordB")
        if ra and rb:
            ai = ra["index"]
            bi = rb["index"]
            pairs.add((ai, bi))
    return pairs


def get_matches_streaming(run_type, a_rows, b_rows):
    """Run streaming matcher and return (pair_set, matched_count, tier_counts)."""
    tol = M.TOLERANCE_DEFAULTS
    _, matched_count, matched_a, matched_b, tier_counts, pairs = match_streaming(
        run_type, a_rows, b_rows,
        tol["amount_tolerance_abs"],
        tol["amount_tolerance_pct"],
        tol["date_tolerance_days"],
        tol["fuzzy_threshold"],
        tol["vendor_threshold"],
    )
    result = set()
    for ai, (bi, tier, score, reason) in pairs.items():
        result.add((ai, bi))
    return result, matched_count, tier_counts


def main():
    sizes = [(100, 100), (200, 200), (500, 500), (1000, 1000)]

    for size in sizes:
        sa, sb = size
        print(f"\nGST {sa}x{sb}:", flush=True)
        a_rows = load_rows("gst_purchase_ledger_100k.csv")[:sa]
        b_rows = load_rows("gst_gstr2b_107k.csv")[:sb]
        orig = get_matches_orig("gst", a_rows, b_rows)
        stream, scount, stiers = get_matches_streaming("gst", a_rows, b_rows)
        same = orig == stream
        print(f"  orig={len(orig)} stream={scount} identical={same}", flush=True)
        if not same:
            diff = orig ^ stream
            print(f"  DIFF pairs: {len(diff)}", flush=True)
            for d in list(diff)[:5]:
                print(f"    {d}", flush=True)
        print(f"  Tiers: {stiers}", flush=True)

        print(f"BANK {sa}x{sb}:", flush=True)
        a_rows = load_rows("bank_book_105k.csv")[:sa]
        b_rows = load_rows("bank_statement_106k.csv")[:sb]
        orig = get_matches_orig("bank", a_rows, b_rows)
        stream, scount, stiers = get_matches_streaming("bank", a_rows, b_rows)
        same = orig == stream
        print(f"  orig={len(orig)} stream={scount} identical={same}", flush=True)
        if not same:
            diff = orig ^ stream
            print(f"  DIFF pairs: {len(diff)}", flush=True)
            for d in list(diff)[:5]:
                print(f"    {d}", flush=True)
        print(f"  Tiers: {stiers}", flush=True)

    print("\nDone.")


if __name__ == "__main__":
    main()
