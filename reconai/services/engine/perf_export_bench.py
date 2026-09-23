#!/usr/bin/env python3
"""Export-only benchmark: TDS 100k-row workbook — current implementation.

The previous openpyxl implementation (per-cell font/border over 21 cols x 100k
rows = 2.1M styled cells) measured 1471.8 s for just 20k rows (~7359 s est. for
the full 100k). build_workbook was replaced with an xlsxwriter path (column-level
formats, streamed row writes) — see engine/tds_checklist.py. This harness:

  - times the CURRENT module (TDS.build_workbook) end-to-end on the full 100k,
  - splits the wall time into row-write vs close/save phases,
  - reports rows/sec, peak RAM, output size,
  - writes the real workbook artifact to benchmark_data/tds_100k_export.xlsx,
  - re-opens the artifact and validates: 100k data rows, 21 columns, headers
    intact, and first / middle / last rows byte-for-byte equal to the source.

Recorded "before" numbers (from the original openpyxl runs) are preserved in the
results file so the report can show before/after without re-running the former
multi-hour export.

Ground truth is never modified. Reconciliation logic is NOT changed.
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes
import gc
import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

if sys.platform == "win32":
    import io as _io
    sys.stdout = _io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = _io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HERE = Path(__file__).parent
DEFAULTS = HERE.parent.parent.parent / "ReconAI_real_world_stress_dataset_v1"
DATASET = Path(os.environ.get("STRESS_DATASET_PATH", DEFAULTS))
OUT_DIR = Path(os.environ.get("STRESS_OUT", HERE / "benchmark_data"))

try:
    from engine import parse as P
    from engine import tds_checklist as TDS
except ModuleNotFoundError:
    sys.path.insert(0, str(HERE))
    from engine import parse as P
    from engine import tds_checklist as TDS

# 0-based column indices written to the sheet (from build_workbook's 1-based set).
NUM_COLS = (7, 8, 10, 11, 12, 16)   # Gross, Cumulative, TDS Required, TDS Deducted, Difference, Deposit Amount
NUM0_COL = 18                        # Interest
HEADERS = ["Ledger", "Party", "Party Type", "Section", "Date", "Voucher", "Narration", "Gross",
           "Cumulative", "Rate%", "TDS Required", "TDS Deducted", "Difference", "Deduction Status",
           "Due Date", "Deposit Date", "Deposit Amount", "Days Late", "Interest", "Quarter", "Remark"]
WIDTHS = [20, 28, 14, 8, 12, 10, 30, 12, 12, 6, 12, 12, 10, 18, 12, 12, 12, 10, 10, 6, 30]
ARTIFACT = OUT_DIR / "tds_100k_export.xlsx"

MEAS = {"mod": "tds_export_bench", "timestamp": datetime.now(timezone.utc).isoformat(),
        "dataset": str(DATASET), "cases": {}}


def _row_values(r):
    """Build the exact 21-value row tuple in build_workbook's field order."""
    return [r["ledger"], r["party"], r["partyType"], r["section"], TDS._safe(r.get("date")),
            r["voucher"], r["narration"], r["gross"], r["cumulative"], r["rate"], r["tdsReq"],
            r["tdsDed"], r["diff"], r["dedStatus"], TDS._safe(r.get("due")),
            TDS._safe(r.get("depDate")), r["depAmt"], r["daysLate"], r["interest"], r["quarter"],
            r["remark"]]


def load_analysis():
    """Parse the real stress TDS ledgers and run the real checklist -> full analysis."""
    def erows(name):
        raw = (DATASET / name).read_bytes()
        headers, body, _ = P.read_rows(raw, name)
        norm = P.normalize_rows(headers, body)
        return [{"index": r["rowIndex"], "data": r["data"]} for r in norm]

    exp = erows("tds_expense_ledger_100k.csv")
    pay = erows("tds_payable_15k_debit_balance.csv")
    by_sec = defaultdict(list)
    for r in exp:
        by_sec[r["data"].get("section") or "UNK"].append(r)
    ledgers = [{"name": f"Expenses - {sec}", "section": sec, "tdsCol": "TDS Deducted",
                "amountCol": "Gross Amount", "rows": rows} for sec, rows in by_sec.items()]
    t0 = time.time()
    analysis = TDS.run_checklist(ledgers, payable_rows=pay,
                                 financial_year=("2025-04-01", "2026-03-31"), config={})
    MEAS["tds_analysis_seconds"] = round(time.time() - t0, 2)
    MEAS["analysis_rows"] = len(analysis.get("results") or [])
    return analysis


def peak_working_set_mb():
    """OS-level peak working set (MB) for this process (Windows). None elsewhere.

    Cheaper and non-distorting vs tracemalloc, which added ~7x overhead to the
    2.1M cell writes and made the export look ~317s instead of ~43s.
    """
    if sys.platform != "win32":
        return None
    class _PMC(ctypes.Structure):
        _fields_ = [("cb", ctypes.wintypes.DWORD), ("PageFaultCount", ctypes.wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]
    pmc = _PMC()
    pmc.cb = ctypes.sizeof(pmc)
    h = ctypes.windll.kernel32.OpenProcess(0x0400 | 0x0010, False,
                                           ctypes.windll.kernel32.GetCurrentProcessId())
    ok = ctypes.windll.kernel32.K32GetProcessMemoryInfo(h, ctypes.byref(pmc), pmc.cb)
    ctypes.windll.kernel32.CloseHandle(h)
    return round(pmc.PeakWorkingSetSize / 1e6, 1) if ok else None


def bench_current(analysis):
    """Time the CURRENT TDS.build_workbook (xlsxwriter) on the FULL results.

    Row-write time is captured by narrowly wrapping xlsxwriter's write/write_blank
    on the worksheet class; close/save = total - write. Peak RAM is the OS peak
    working set (monotonic), read after the call. No tracemalloc in the timed path.
    """
    import xlsxwriter.worksheet as XWS
    results = analysis.get("results") or []
    n = len(results)

    acc = {"seconds": 0.0, "calls": 0}
    orig_write = XWS.Worksheet.write
    orig_blank = XWS.Worksheet.write_blank
    orig_row = XWS.Worksheet.write_row

    def _wrapped(fn):
        def inner(ws, *a, **k):
            s = time.time()
            try:
                return fn(ws, *a, **k)
            finally:
                acc["seconds"] += time.time() - s
                acc["calls"] += 1
        return inner

    XWS.Worksheet.write = _wrapped(orig_write)
    XWS.Worksheet.write_blank = _wrapped(orig_blank)
    XWS.Worksheet.write_row = _wrapped(orig_row)
    gc.collect()
    t0 = time.time()
    data = TDS.build_workbook(analysis, "Stress Client")
    total = time.time() - t0
    XWS.Worksheet.write = orig_write
    XWS.Worksheet.write_blank = orig_blank
    XWS.Worksheet.write_row = orig_row

    write_sec = acc["seconds"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    artifact = ARTIFACT
    artifact.write_bytes(data)

    return {"n": n, "total_seconds": round(total, 2),
            "rows_per_sec": round(n / total, 1) if total else None,
            "phases": {"row_write_seconds": round(write_sec, 2),
                       "close_save_seconds": round(max(total - write_sec, 0.0), 2)},
            "peak_mb": peak_working_set_mb(),
            "bytes": len(data),
            "artifact": str(artifact)}


def canon(v):
    """Normalize a cell value for comparison (int/float and None/'' collapse)."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return float(v)
    return str(v)


def validate(artifact: Path, want_rows, results):
    from openpyxl import load_workbook
    wb = load_workbook(artifact, read_only=True)
    errors = []
    got_sheets = wb.sheetnames
    if got_sheets != ["TDS Checklist", "Payment Reconciliation"]:
        errors.append(f"sheetnames={got_sheets}")
    ws = wb["TDS Checklist"]
    got_rows = ws.max_row
    got_cols = ws.max_column

    def read_row(sheet_row):
        return [canon(v) for v in next(ws.iter_rows(min_row=sheet_row, max_row=sheet_row,
                                                    values_only=True))]

    header = read_row(1)
    first = read_row(2)
    mid_i = want_rows // 2                      # 0-based data index in the middle
    mid = read_row(mid_i + 2)                   # data row i -> sheet row i+2 (header at 1)
    last = read_row(got_rows)

    exp_header = HEADERS
    exp_first = [canon(v) for v in _row_values(results[0])]
    exp_mid = [canon(v) for v in _row_values(results[mid_i])]
    exp_last = [canon(v) for v in _row_values(results[-1])]

    checks = {"rows": got_rows == want_rows + 1, "cols": got_cols == 21,
              "header_ok": header == exp_header,
              "row1_matches": first == exp_first,
              "row_mid_matches": mid == exp_mid,
              "row_last_matches": last == exp_last}
    if got_rows != want_rows + 1:
        errors.append(f"rows={got_rows} (want {want_rows} data + 1 header)")
    if got_cols != 21:
        errors.append(f"cols={got_cols}")
    for name, a, b in (("header", header, exp_header), ("row1", first, exp_first),
                       ("row_mid", mid, exp_mid), ("row_last", last, exp_last)):
        if a != b:
            for i, (x, y) in enumerate(zip(a, b)):
                if x != y:
                    errors.append(f"{name} col{i} differ: got={x!r} want={y!r}")
                    break
    wb.close()
    return {"valid": not errors, "errors": errors,
            "rows": got_rows, "data_rows": got_rows - 1, "cols": got_cols,
            "sheets": got_sheets, **checks}


def load_before_reference():
    """Pull the recorded pre-fix openpyxl numbers out of the previous results file."""
    prev = OUT_DIR / "export_perf_results.json"
    if not prev.exists():
        return None
    try:
        old = json.loads(prev.read_text(encoding="utf-8"))
    except Exception:
        return None
    out = {"tds_analysis_seconds": old.get("tds_analysis_seconds"),
           "analysis_rows": old.get("analysis_rows")}
    saved = old.get("before_openpyxl") or {}
    for name in ("current_openpyxl", "optimized_openpyxl_bulk", "optimized_xlsxwriter"):
        c = old.get("cases", {}).get(name) or saved.get(name)
        if not c:
            continue
        c2 = {kk: vv for kk, vv in c.items() if kk != "data"}
        c2.pop("validation", None)
        out[name] = c2
    return out


def main():
    print(f"Dataset: {DATASET}", flush=True)
    if not DATASET.exists():
        print("DATASET MISSING", flush=True)
        sys.exit(2)
    before = load_before_reference()
    if before is not None:
        MEAS["before_openpyxl"] = before
        b = before.get("current_openpyxl", {})
        print(f"Before (recorded openpyxl): {b.get('extrap_from_seconds')}s @ {b.get('n'):,} "
              f"rows -> est ~{b.get('seconds')}s for 100k", flush=True)

    analysis = load_analysis()
    want = MEAS["analysis_rows"]
    print(f"TDS analysis (core reconciliation): {MEAS['tds_analysis_seconds']}s for {want} rows", flush=True)

    res = bench_current(analysis)
    MEAS["cases"]["current_xlsxwriter_full"] = res
    print(f"[CURRENT build_workbook (xlsxwriter)] {res['n']:,} rows in {res['total_seconds']}s "
          f"({res['rows_per_sec']:,.0f} rows/s, peak {res['peak_mb']}MB, "
          f"{res['bytes'] / 1e6:.1f}MB) phases={res['phases']}", flush=True)

    v = validate(ARTIFACT, want, analysis["results"])
    MEAS["cases"]["current_xlsxwriter_full"]["validation"] = v
    print(f"[validate] {json.dumps(v)}", flush=True)
    if not v["valid"]:
        print("WORKBOOK VALIDATION FAILED — see errors above", flush=True)
        sys.exit(3)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    _artifact = ARTIFACT.relative_to(OUT_DIR) if ARTIFACT.is_relative_to(OUT_DIR) else ARTIFACT
    out = OUT_DIR / "export_perf_results.json"
    out.write_text(json.dumps(MEAS, indent=2, default=str), encoding="utf-8")
    print(f"\nresults: {out}", flush=True)
    if before is not None:
        b = before.get("current_openpyxl", {})
        speedup = round(b.get("seconds", b.get("extrap_from_seconds", 0)) / res["total_seconds"], 1)
    else:
        speedup = None
    print(json.dumps({
        "tds_analysis_s": MEAS["tds_analysis_seconds"],
        "before_openpyxl_100k_est_s": (before or {}).get("current_openpyxl", {}).get("seconds"),
        "after_xlsxwriter_100k_s": res["total_seconds"],
        "after_rows_per_sec": res["rows_per_sec"],
        "after_peak_mb": res["peak_mb"],
        "after_output_mb": round(res["bytes"] / 1e6, 1),
        "speedup_vs_openpyxl": speedup,
        "artifact": str(ARTIFACT),
        "validation": v,
    }, indent=2), flush=True)


if __name__ == "__main__":
    main()