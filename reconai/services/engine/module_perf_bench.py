#!/usr/bin/env python3
"""Full-module performance benchmark against the 100k-row stress dataset.

Measures each major module independently:
  - Parsing (all CSVs)
  - GST reconciliation  (O(A×B) matcher, probed at 2000×2000)
  - Bank reconciliation  (O(A×B) matcher, probed at 2000×2000)
  - AIS/26AS reconciliation (O(A×B) matcher, probed at 1000×1000)
  - TDS checklist        (full 100k expense + 15k payable)
  - TB variance          (full 10k × 10k)
  - Audit analytics      (full 152k rows)

For each module reports: total wall time, rows processed, rows/sec, peak RAM (MB),
and which sub-stage is disproportionately slow. Extrapolates full-size cost for
quadratic matchers from probe results.

Outputs JSON to benchmark_data/module_perf_results.json.
"""
from __future__ import annotations

import gc
import json
import os
import sys
import time
import ctypes
import ctypes.wintypes
from collections import defaultdict
from pathlib import Path
from datetime import datetime, timezone

if sys.platform == "win32":
    import io as _io
    sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HERE = Path(__file__).parent
DATASET = Path(os.environ.get("STRESS_DATASET_PATH", HERE.parent.parent.parent / "ReconAI_real_world_stress_dataset_v1"))
OUT_DIR = Path(os.environ.get("STRESS_OUT", HERE / "benchmark_data"))
OUT_DIR.mkdir(parents=True, exist_ok=True)

try:
    from engine import parse as P
    from engine import match as M
    from engine import tb_variance as TB
    from engine import tds_checklist as TDS
    from engine import risk_analysis as RA
except ModuleNotFoundError:
    sys.path.insert(0, str(HERE))
    from engine import parse as P
    from engine import match as M
    from engine import tb_variance as TB
    from engine import tds_checklist as TDS
    from engine import risk_analysis as RA

OUT_FILE = OUT_DIR / "module_perf_results.json"

# ── helpers ──────────────────────────────────────────────────────────────────

def peak_mb() -> float | None:
    """Windows peak working-set size in MB. None on other platforms."""
    if sys.platform != "win32":
        return None
    class _PMC(ctypes.Structure):
        _fields_ = [("cb", ctypes.wintypes.DWORD),
                    ("PageFaultCount", ctypes.wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t),
                    ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t),
                    ("PeakPagefileUsage", ctypes.c_size_t)]
    pmc = _PMC()
    pmc.cb = ctypes.sizeof(pmc)
    h = ctypes.windll.kernel32.OpenProcess(0x0400 | 0x0010, False,
                                           ctypes.windll.kernel32.GetCurrentProcessId())
    ok = ctypes.windll.kernel32.K32GetProcessMemoryInfo(h, ctypes.byref(pmc), pmc.cb)
    ctypes.windll.kernel32.CloseHandle(h)
    return round(pmc.PeakWorkingSetSize / 1e6, 1) if ok else None


def load_rows(name: str) -> list[dict]:
    """read_rows + normalize_rows → [{index, data}] (cached by name)."""
    path = DATASET / name
    raw = path.read_bytes()
    headers, body, _ = P.read_rows(raw, str(name))
    norm = P.normalize_rows(headers, body)
    return [{"index": r["rowIndex"], "data": r["data"]} for r in norm]


_CACHE: dict = {}


def cached_rows(name: str) -> list[dict]:
    if name not in _CACHE:
        _CACHE[name] = load_rows(name)
    return _CACHE[name]


def probe_scale(run_type: str, a_rows: list, b_rows: list, max_n: int) -> list[tuple]:
    """Run match on [100, 500, 1000, 2000] (up to max_n) and return [(n, seconds)]."""
    sizes = [100, 500, 1000, 2000]
    sizes = [s for s in sizes if s <= max_n and s <= len(a_rows) and s <= len(b_rows)]
    curve = []
    for n in sizes:
        gc.collect()
        t0 = time.time()
        M.match(run_type, a_rows[:n], b_rows[:n], {})
        dt = time.time() - t0
        curve.append((n, dt))
        print(f"  {run_type} probe {n}×{n}: {dt:.2f}s", flush=True)
    return curve


def fit_eta(curve: list, full_a: int, full_b: int) -> dict | None:
    """Estimate full-size time from O(n²) fit using the best (most optimistic) constant."""
    if not curve:
        return None
    best_c = None
    for n, t in curve:
        c = t / (n * n)
        if best_c is None or c < best_c:
            best_c = c
    eta = best_c * full_a * full_b
    return {"eq": f"t≈{best_c:.3e}·(A·B)", "eta_seconds": round(eta, 1),
            "eta_minutes": round(eta / 60, 1), "points": [[n, round(t, 3)] for n, t in curve]}


def pct_of(total: float, part: float) -> str:
    return f"{part/total*100:.0f}%" if total > 0 else "—"


# ── module measurements ──────────────────────────────────────────────────────

results: dict = {
    "benchmark": "ReconAI Module Performance Benchmark",
    "dataset": str(DATASET),
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "modules": {},
}


def record(module: str, data: dict) -> None:
    results["modules"][module] = data


# ── 1. PARSING ───────────────────────────────────────────────────────────────

def bench_parsing():
    print("\n[1/7] PARSING", flush=True)
    files = [
        ("gst_purchase_ledger_100k.csv", 100000),
        ("gst_gstr2b_107k.csv", 105012),
        ("bank_book_105k.csv", 105000),
        ("bank_statement_106k.csv", 106000),
        ("ais_26as_portal_50k.csv", 50500),
        ("ais_books_tds_50k.csv", 50000),
        ("tds_expense_ledger_100k.csv", 100000),
        ("tds_payable_15k_debit_balance.csv", 15000),
        ("variance_prior_tb_10k.csv", 10200),
        ("variance_current_tb_10k.csv", 10200),
        ("audit_ledger_152k.csv", 152000),
    ]
    stages: dict[str, float] = {}
    total_rows = 0
    t_start = time.time()
    for name, _ in files:
        gc.collect()
        t0 = time.time()
        rows = cached_rows(name)
        dt = time.time() - t0
        stages[name] = round(dt, 2)
        total_rows += len(rows)
        print(f"  {name}: {len(rows):,} rows in {dt:.2f}s", flush=True)
    total = time.time() - t_start
    record("parsing", {
        "total_rows": total_rows,
        "total_seconds": round(total, 2),
        "rows_per_sec": round(total_rows / total, 1) if total else 0,
        "stages": stages,
        "peak_mb": peak_mb(),
    })


# ── 2. GST RECONCILIATION ────────────────────────────────────────────────────

def bench_gst():
    print("\n[2/7] GST RECONCILIATION", flush=True)
    a = cached_rows("gst_purchase_ledger_100k.csv")
    b = cached_rows("gst_gstr2b_107k.csv")
    full_a, full_b = len(a), len(b)
    probe = probe_scale("gst", a, b, 2000)
    fit = fit_eta(probe, full_a, full_b)
    # Run a single full probe at max size for accuracy measurement
    gc.collect()
    max_n = probe[-1][0] if probe else 2000
    t0 = time.time()
    M.match("gst", a[:max_n], b[:max_n], {})
    probe_dt = time.time() - t0
    record("gst", {
        "rows_a": full_a, "rows_b": full_b, "total_rows": full_a + full_b,
        "probe_size": max_n,
        "probe_seconds": round(probe_dt, 2),
        "probe_rows_per_sec": round(max_n * max_n / probe_dt, 0) if probe_dt else 0,
        "scaling_curve": [[n, round(t, 3)] for n, t in probe],
        "eta_full": fit,
        "peak_mb": peak_mb(),
        "note": "O(A×B) quadratic matcher — full 100k×107k estimated from probe fit",
    })


# ── 3. BANK RECONCILIATION ───────────────────────────────────────────────────

def bench_bank():
    print("\n[3/7] BANK RECONCILIATION", flush=True)
    a = cached_rows("bank_book_105k.csv")
    b = cached_rows("bank_statement_106k.csv")
    full_a, full_b = len(a), len(b)
    probe = probe_scale("bank", a, b, 2000)
    fit = fit_eta(probe, full_a, full_b)
    gc.collect()
    max_n = probe[-1][0] if probe else 2000
    t0 = time.time()
    M.match("bank", a[:max_n], b[:max_n], {})
    probe_dt = time.time() - t0
    record("bank", {
        "rows_a": full_a, "rows_b": full_b, "total_rows": full_a + full_b,
        "probe_size": max_n,
        "probe_seconds": round(probe_dt, 2),
        "probe_rows_per_sec": round(max_n * max_n / probe_dt, 0) if probe_dt else 0,
        "scaling_curve": [[n, round(t, 3)] for n, t in probe],
        "eta_full": fit,
        "peak_mb": peak_mb(),
        "note": "O(A×B) quadratic matcher — full 105k×106k estimated from probe fit",
    })


# ── 4. AIS/26AS RECONCILIATION ───────────────────────────────────────────────

def bench_ais():
    print("\n[4/7] AIS/26AS RECONCILIATION", flush=True)
    a = cached_rows("ais_26as_portal_50k.csv")
    b = cached_rows("ais_books_tds_50k.csv")
    full_a, full_b = len(a), len(b)
    # AIS has fuzzy name scoring → slower per-pair; use smaller probes
    probe = probe_scale("ais_26as", a, b, 1000)
    fit = fit_eta(probe, full_a, full_b)
    gc.collect()
    max_n = probe[-1][0] if probe else 1000
    t0 = time.time()
    M.match("ais_26as", a[:max_n], b[:max_n], {})
    probe_dt = time.time() - t0
    record("ais_26as", {
        "rows_a": full_a, "rows_b": full_b, "total_rows": full_a + full_b,
        "probe_size": max_n,
        "probe_seconds": round(probe_dt, 2),
        "probe_rows_per_sec": round(max_n * max_n / probe_dt, 0) if probe_dt else 0,
        "scaling_curve": [[n, round(t, 3)] for n, t in probe],
        "eta_full": fit,
        "peak_mb": peak_mb(),
        "note": "O(A×B) with fuzzy name scoring — full 50k×50k estimated from probe fit",
    })


# ── 5. TDS CHECKLIST ─────────────────────────────────────────────────────────

def bench_tds():
    print("\n[5/7] TDS CHECKLIST", flush=True)
    exp = cached_rows("tds_expense_ledger_100k.csv")
    pay = cached_rows("tds_payable_15k_debit_balance.csv")
    by_sec: dict = defaultdict(list)
    for r in exp:
        by_sec[r["data"].get("section") or "UNK"].append(r)
    ledgers = [{"name": f"Expenses - {sec}", "section": sec, "tdsCol": "TDS Deducted",
                "amountCol": "Gross Amount", "rows": rows}
               for sec, rows in by_sec.items()]
    n_ledgers = len(ledgers)
    total_rows = len(exp) + len(pay)

    # Parse payable
    gc.collect()
    t0 = time.time()
    opening, deposits = TDS.parse_payable_ledger(pay)
    parse_pay_dt = time.time() - t0

    # Parse expense ledgers
    gc.collect()
    t0 = time.time()
    parsed_ledgers = []
    for lg in ledgers:
        txns = TDS.parse_expense_ledger(lg["name"], lg["rows"], lg["tdsCol"], lg["amountCol"])
        parsed_ledgers.append({"name": lg["name"], "section": lg["section"], "txns": txns})
    parse_exp_dt = time.time() - t0

    # Run checklist
    gc.collect()
    t0 = time.time()
    analysis = TDS.run_checklist(parsed_ledgers, payable_rows=pay,
                                  financial_year=("2025-04-01", "2026-03-31"), config={})
    run_dt = time.time() - t0

    # Export
    gc.collect()
    t0 = time.time()
    wb = TDS.workbook_bytes(analysis, "Stress Client")
    export_dt = time.time() - t0

    n_results = len(analysis.get("results") or [])
    record("tds", {
        "expense_rows": len(exp), "payable_rows": len(pay), "total_rows": total_rows,
        "n_ledgers": n_ledgers,
        "stages": {
            "parse_payable": {"seconds": round(parse_pay_dt, 2), "rows": len(pay)},
            "parse_expense": {"seconds": round(parse_exp_dt, 2), "rows": len(exp), "ledgers": n_ledgers},
            "run_checklist": {"seconds": round(run_dt, 2), "results": n_results},
            "export_xlsx":   {"seconds": round(export_dt, 2), "bytes": len(wb)},
        },
        "total_seconds": round(parse_pay_dt + parse_exp_dt + run_dt + export_dt, 2),
        "rows_per_sec": round(total_rows / (parse_pay_dt + parse_exp_dt + run_dt + export_dt), 1),
        "peak_mb": peak_mb(),
    })
    print(f"  TDS: {total_rows:,} rows, {n_ledgers} ledgers, {n_results} results in "
          f"{parse_pay_dt+parse_exp_dt+run_dt+export_dt:.1f}s", flush=True)


# ── 6. TB VARIANCE ───────────────────────────────────────────────────────────

def bench_tb():
    print("\n[6/7] TB VARIANCE", flush=True)
    prior = cached_rows("variance_prior_tb_10k.csv")
    curr = cached_rows("variance_current_tb_10k.csv")
    total_rows = len(prior) + len(curr)

    gc.collect()
    t0 = time.time()
    analysis = TB.analyze_tb(prior, curr, {"clientName": "Stress Client"})
    run_dt = time.time() - t0

    gc.collect()
    t0 = time.time()
    wb = TB.workbook_bytes(analysis, "Stress Client")
    export_dt = time.time() - t0

    n_results = len(analysis.get("results") or [])
    record("tb_variance", {
        "prior_rows": len(prior), "current_rows": len(curr), "total_rows": total_rows,
        "stages": {
            "analyze": {"seconds": round(run_dt, 2), "results": n_results},
            "export_xlsx": {"seconds": round(export_dt, 2), "bytes": len(wb)},
        },
        "total_seconds": round(run_dt + export_dt, 2),
        "rows_per_sec": round(total_rows / (run_dt + export_dt), 1),
        "peak_mb": peak_mb(),
    })
    print(f"  TB: {total_rows:,} rows, {n_results} results in {run_dt+export_dt:.1f}s", flush=True)


# ── 7. AUDIT ANALYTICS ───────────────────────────────────────────────────────

def bench_audit():
    print("\n[7/7] AUDIT ANALYTICS", flush=True)
    rows = cached_rows("audit_ledger_152k.csv")
    total_rows = len(rows)

    # analyze_transactions is the main entry for audit ledger rows
    gc.collect()
    t0 = time.time()
    analysis = RA.analyze_transactions(rows, config={})
    run_dt = time.time() - t0

    n_items = len(analysis.get("items") or [])
    metrics = analysis.get("metrics") or {}
    record("audit_analytics", {
        "rows": total_rows,
        "stages": {
            "analyze_transactions": {"seconds": round(run_dt, 2), "risk_items": n_items},
        },
        "total_seconds": round(run_dt, 2),
        "rows_per_sec": round(total_rows / run_dt, 1) if run_dt else 0,
        "metrics": {k: v for k, v in metrics.items() if isinstance(v, (int, float, str, list))},
        "peak_mb": peak_mb(),
    })
    print(f"  Audit: {total_rows:,} rows, {n_items} risk items in {run_dt:.1f}s", flush=True)


# ── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print(f"Dataset: {DATASET}", flush=True)
    if not DATASET.exists():
        print("DATASET MISSING", flush=True)
        sys.exit(2)

    bench_parsing()
    bench_gst()
    bench_bank()
    bench_ais()
    bench_tds()
    bench_tb()
    bench_audit()

    results["total_seconds"] = round(sum(
        m.get("total_seconds", 0) for m in results["modules"].values()
    ), 2)
    results["total_rows"] = sum(
        m.get("total_rows", 0) for m in results["modules"].values()
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
    print(f"\nresults: {OUT_FILE}", flush=True)

    # Print summary table
    print("\n" + "=" * 80)
    print(f"{'Module':<22} {'Rows':>10} {'Time(s)':>10} {'Rows/s':>10} {'PeakMB':>8}  {'Bottleneck'}")
    print("-" * 80)
    for name, m in results["modules"].items():
        ts = m.get("total_seconds", 0)
        tr = m.get("total_rows", 0)
        rps = m.get("rows_per_sec", 0)
        pm = m.get("peak_mb", "—")
        bottleneck = identify_bottleneck(m, name)
        print(f"{name:<22} {tr:>10,} {ts:>10.2f} {rps:>10,.0f} {str(pm):>8}  {bottleneck}")
    print("=" * 80)


def identify_bottleneck(mod_data: dict, name: str) -> str:
    """Return the single slowest stage as a human label."""
    stages = mod_data.get("stages")
    if not stages:
        return "N/A"
    worst = max(stages.items(), key=lambda kv: kv[1].get("seconds", 0))
    secs = worst[1].get("seconds", 0)
    total = mod_data.get("total_seconds", 1)
    pct = secs / total * 100 if total else 0
    label = f"{worst[0]} ({pct:.0f}%)"
    if pct >= 60:
        return f"⚠ {label}"
    return label


if __name__ == "__main__":
    main()
