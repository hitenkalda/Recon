"""Trial Balance / P&L Variance analysis — deterministic (no AI).

Reimplements the Trial-Balance variance logic from the ReconAI prototype
(SML_TB Variance Tool) inside the engine so the authoritative calculations
live server-side. The engine consumes normalized rows (each carrying the
original TB column headers as data keys) for the PRIOR period and CURRENT
period, dedups ledgers by name, and classifies every ledger into:

  new_ledger         present in current, absent in prior, non-zero closing
  no_movement        present in current with nil/zero closing
  dropped            present in prior, absent in current
  within_threshold   P&L ledger, |Δ%|  < quickThreshold (default 10)
  quick_review       P&L ledger, quickThreshold ≤ |Δ%| < detailedThreshold
  detailed_review    P&L ledger, |Δ%| ≥ detailedThreshold (or prior nil → new)

plus a separate opening-balance reconciliation (|current opening − prior
closing|) used to flag OB mismatches. All thresholds are configurable but the
defaults match the legacy tool exactly.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from .normalize import normalize_amount

# ── categories ─────────────────────────────────────────────────────────────

CATEGORY_NEW_LEDGER = "new_ledger"
CATEGORY_NO_MOVEMENT = "no_movement"
CATEGORY_DROPPED = "dropped"
CATEGORY_WITHIN = "within_threshold"
CATEGORY_QUICK = "quick_review"
CATEGORY_DETAILED = "detailed_review"

SUB_CATEGORIES = (CATEGORY_WITHIN, CATEGORY_QUICK, CATEGORY_DETAILED)

# P&L filter keywords (default) — case-insensitive contains match, same list
# as the legacy "keyword mode". Matching any keyword keeps the ledger in scope.
DEFAULT_PL_KEYWORDS = (
    "sales", "purchase", "income", "expense", "expenditure", "revenue",
    "profit", "loss", "depreciation", "interest", "salary", "wages", "freight",
    "commission", "rent", "tax", "turnover", "cost of", "direct", "indirect",
    "finance charge", "bank charge", "insurance", "repairs", "maintenance",
)

DEFAULT_QUICK_THRESHOLD = 10.0      # |Δ%| below this → within threshold
DEFAULT_DETAILED_THRESHOLD = 20.0   # |Δ%| at/above this → detailed review
DEFAULT_OB_TOLERANCE = 0.5          # |opening − prior closing| to flag a mismatch

# ── TB column detection ────────────────────────────────────────────────────

def _header_tokens(name: str) -> str:
    return " ".join(name.lower().replace("_", " ").split())


def detect_tb_columns(row: Dict[str, Any]) -> Dict[str, str]:
    """Map logical TB fields → the actual data keys present in a parsed row.

    Returns {particulars, opening, debit, credit, closing, amount} where each
    value is a header key, or '' when the column is absent. "amount" is the
    closing column alias used by ledger exports that only carry a balance.
    """
    keys = [k for k in row.keys() if isinstance(k, str)]
    cols: Dict[str, str] = {
        "particulars": "", "opening": "", "debit": "", "credit": "", "closing": "",
    }
    seen: set = set()
    for k in keys:
        t = _header_tokens(k)
        if not t or t in seen:
            continue
        if cols["particulars"] == "" and any(x in t for x in ("particular", "ledger", "account head", "account name", "name")):
            cols["particulars"] = k
            seen.add(t)
        elif "opening" in t:
            cols["opening"] = k
            seen.add(t)
        elif t in ("debit", "dr") or "debit" in t:
            if not cols["debit"]:
                cols["debit"] = k
                seen.add(t)
        elif t in ("credit", "cr") or "credit" in t:
            if cols["credit"] == "":
                cols["credit"] = k
                seen.add(t)

    # closing balance: prefer an explicit "closing" header, else a bare
    # "balance" column that is not the opening column.
    for k in keys:
        t = _header_tokens(k)
        if "closing" in t:
            cols["closing"] = k
            break
    if cols["closing"] == "":
        for k in keys:
            t = _header_tokens(k)
            if "balance" in t and "opening" not in t:
                cols["closing"] = k
                break
    return cols


def _ledger_key(name: str) -> str:
    return " ".join(str(name).lower().replace("_", " ").split())


def _is_scope(name: str, keywords: Tuple[str, ...], all_ledgers: bool) -> bool:
    if all_ledgers:
        return True
    n = str(name).lower()
    return any(k in n for k in keywords)


# ── per-row extraction ─────────────────────────────────────────────────────

def _extract_row(row: Dict[str, Any], idx: int, cols: Dict[str, str]) -> Dict[str, Any]:
    def amt(key: str) -> Optional[float]:
        return normalize_amount(row.get(key)) if key else None

    return {
        "key": _ledger_key(row.get(cols["particulars"]) or ""),
        "particulars": str(row.get(cols["particulars"]) or ""),
        "opening": amt(cols["opening"]),
        "debit": amt(cols["debit"]),
        "credit": amt(cols["credit"]),
        "closing": amt(cols["closing"]),
        "index": idx,
    }


def _is_zero(v: Optional[float]) -> bool:
    return v is None or abs(v) < 1e-9


# ── analysis ───────────────────────────────────────────────────────────────

def analyze_tb(
    rowsA: List[Dict[str, Any]],
    rowsB: List[Dict[str, Any]],
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Compare a prior-period TB (rowsA) with the current TB (rowsB).

    rowsA/rowsB follow the engine ReconRow shape [{index, data}]. config keys:
      plKeywords (list[str]|str), plAllLedgers (bool), quickThreshold (float),
      detailedThreshold (float), obTolerance (float).
    """
    cfg = config or {}
    kw = cfg.get("plKeywords") or list(DEFAULT_PL_KEYWORDS)
    if isinstance(kw, str):
        kw = [k for k in kw.replace(",", "\n").splitlines() if k.strip()]
    keywords = tuple(k.strip().lower() for k in kw if k and k.strip())
    all_ledgers = bool(cfg.get("plAllLedgers", False))
    quick = float(cfg.get("quickThreshold", DEFAULT_QUICK_THRESHOLD))
    detailed = float(cfg.get("detailedThreshold", DEFAULT_DETAILED_THRESHOLD))
    ob_tol = float(cfg.get("obTolerance", DEFAULT_OB_TOLERANCE))

    prior_rows = [_extract_row(r.get("data") or {}, r.get("index") or 0, detect_tb_columns(r.get("data") or {})) for r in rowsA]
    curr_rows = [_extract_row(r.get("data") or {}, r.get("index") or 0, detect_tb_columns(r.get("data") or {})) for r in rowsB]
    prior_rows = [r for r in prior_rows if r["key"]]
    curr_rows = [r for r in curr_rows if r["key"]]

    if not curr_rows:
        raise ValueError("No trial-balance rows with a particulars column were found in the current TB")

    prior_by_key: Dict[str, Dict[str, Any]] = {r["key"]: r for r in prior_rows}
    # keep the most recently seeded ledger for the match when a name repeats
    curr_map: Dict[str, Dict[str, Any]] = {}
    for r in curr_rows:
        curr_map[r["key"]] = r

    results: List[Dict[str, Any]] = []
    ob_recon: List[Dict[str, Any]] = []

    # Opening-balance reconciliation crosses the per-ledger classification,
    # so precompute prior-closing by key once.
    prior_closing_of = {k: r["closing"] for k, r in prior_by_key.items()}

    # ── whole-TB passes ────────────────────────────────────────────────
    for key, cur in curr_map.items():
        prior = prior_by_key.get(key)
        ob = None
        if cur["opening"] is not None and key in prior_closing_of and prior_closing_of[key] is not None:
            ob = round(abs(cur["opening"] - prior_closing_of[key]), 2)  # type: ignore[arg-type]
            ob_recon.append({
                "particulars": cur["particulars"],
                "opening": cur["opening"],
                "priorClosing": prior_closing_of[key],
                "mismatch": ob if ob > ob_tol else None,
            })

        if prior is None:
            # New ledger — current closing non-zero; otherwise a no-movement row.
            if not _is_zero(cur["closing"]):
                results.append(_result(cur, CATEGORY_NEW_LEDGER, ob))
            else:
                results.append(_result(cur, CATEGORY_NO_MOVEMENT, ob))
            continue

        if _is_zero(cur["closing"]):
            results.append(_result(cur, CATEGORY_NO_MOVEMENT, ob))
            continue

        # present in both, non-zero current closing → P&L scope check
        pnl = _is_scope(cur["particulars"], keywords, all_ledgers)
        if pnl:
            category, var_pct = _classify(
                prior["closing"], cur["closing"], cur["particulars"].lower(), quick, detailed
            )
            res = _result(cur, category, ob,
                          prior_closing=prior["closing"],
                          var_pct=var_pct,
                          prior_index=prior["index"])
            results.append(res)

    # Ledgers present in prior but absent in current → dropped.
    for key, prior in prior_by_key.items():
        if key not in curr_map:
            results.append(_dropped_result(prior))

    results.sort(key=lambda r: (r["category"], abs(r.get("variance") or 0)), reverse=True)

    summary = _summarize(results, ob_recon, len(prior_rows), len(curr_rows))
    return {"results": results, "obReconciliation": ob_recon, "summary": summary, "config": cfg}


def _classify(
    prior_closing: Optional[float],
    current_closing: float,
    particulars_lower: str,
    quick: float,
    detailed: float,
) -> Tuple[str, Optional[float]]:
    """Variance classification per the legacy thresholds.

    |Δ%| = (current − prior) / |prior| × 100. When prior is nil/zero the change
    is (correctly) unbounded → Detailed Review. Width of the quick band uses
    the thresholds from the tool: Quick 10–20%, Detailed >20%.
    """
    if _is_zero(prior_closing):
        return CATEGORY_DETAILED, None
    var_pct = (current_closing - prior_closing) / abs(prior_closing) * 100.0  # type: ignore[operator]
    abs_pct = abs(var_pct)
    if abs_pct < quick:
        return CATEGORY_WITHIN, round(var_pct, 2)
    if abs_pct < detailed:
        return CATEGORY_QUICK, round(var_pct, 2)
    return CATEGORY_DETAILED, round(var_pct, 2)


def _result(
    cur: Dict[str, Any],
    category: str,
    ob: Optional[float],
    prior_closing: Optional[float] = None,
    var_pct: Optional[float] = None,
    prior_index: Optional[int] = None,
) -> Dict[str, Any]:
    return {
        "particulars": cur["particulars"],
        "category": category,
        "priorClosing": prior_closing,
        "currentClosing": cur["closing"],
        "variance": round(cur["closing"] - prior_closing, 2) if prior_closing is not None else None,
        "varPct": var_pct,
        "obMismatch": ob,
        "priorIndex": prior_index,
        "currentIndex": cur["index"],
    }


def _dropped_result(prior: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "particulars": prior["particulars"],
        "category": CATEGORY_DROPPED,
        "priorClosing": prior["closing"],
        "currentClosing": None,
        "variance": None,
        "varPct": None,
        "obMismatch": None,
        "priorIndex": prior["index"],
        "currentIndex": None,
    }


# ── Excel export ────────────────────────────────────────────────────────────

_FF = "+0.0\"%\" ;-0.0\"%\" ;0.0\"%\""  # signed percent display (35.5 → "35.5%")
_FF_NUM = "#,##0.00"                     # amount, en-IN grouping (comma lakh style)


def build_workbook(analysis: Dict[str, Any], client_name: str = "Client") -> Any:
    """Render an analysis result into the 7-sheet styled workbook (openpyxl).

    Sheets mirror the legacy export exactly:
      1. Full P&L Analysis      2. Detailed Review (>20%)   3. Quick Review (10-20%)
      4. Within Threshold (<10%) 5. New Ledgers             6. No Movement
      7. OB Reconciliation
    """
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    header_fill = PatternFill("solid", fgColor="1A2B4A")
    header_font = Font(color="FFFFFF", bold=True, size=10, name="Calibri")
    body_font = Font(size=10, name="Calibri")
    thin = Side(style="thin", color="D9D9D9")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    results = analysis.get("results") or []
    ob_recon = analysis.get("obReconciliation") or []
    summary = analysis.get("summary") or {}
    by = {c: [r for r in results if r["category"] == c] for c in (
        CATEGORY_WITHIN, CATEGORY_QUICK, CATEGORY_DETAILED, CATEGORY_NEW_LEDGER, CATEGORY_NO_MOVEMENT)}

    def sheet_title(ws: Any, col_widths: List[float]) -> None:
        for i, w in enumerate(col_widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w
        ws.freeze_panes = "A2"

    def write_ledger_rows(ws: Any, rows: List[Dict[str, Any]], with_ob: bool = False) -> None:
        headers = ["Particulars", "Prior Closing", "Current Closing", "Variance", "Variance %"]
        if with_ob:
            headers += ["OB Mismatch"]
        ws.append(headers)
        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.border = border
            cell.alignment = Alignment(horizontal="center", vertical="center")
        for r in rows:
            ws.append([
                r["particulars"],
                r["priorClosing"],
                r["currentClosing"],
                r["variance"],
                r["varPct"],
                r.get("obMismatch") if with_ob else None,
            ])
            last = ws.max_row
            for c in range(1, ws.max_column + 1):
                cell = ws.cell(row=last, column=c)
                cell.font = body_font
                cell.border = border
            for c in (2, 3, 4, 5, 6):
                num = ws.cell(row=last, column=c)
                num.number_format = _FF if c == 5 else _FF_NUM
            ws.cell(row=last, column=5).number_format = _FF

    wb = Workbook()
    ws = wb.active
    ws.title = "1. Full P&L Analysis"
    ws.append(["Particulars", "Prior Closing", "Current Closing", "Variance", "Variance %", "Status"])
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.border = border
    for r in by[CATEGORY_WITHIN] + by[CATEGORY_QUICK] + by[CATEGORY_DETAILED]:
        status = {CATEGORY_WITHIN: "Within Threshold", CATEGORY_QUICK: "Quick Review", CATEGORY_DETAILED: "Detailed Review"}[r["category"]]
        ws.append([r["particulars"], r["priorClosing"], r["currentClosing"], r["variance"], r["varPct"], status])
        last = ws.max_row
        for c in range(1, 7):
            cell = ws.cell(row=last, column=c)
            cell.font = body_font
            cell.border = border
            if c in (2, 3, 4, 5):
                ws.cell(row=last, column=c).number_format = _FF if c == 5 else _FF_NUM
    sheet_title(ws, [40, 16, 16, 16, 14, 20])

    detail_sheets = [
        ("2. Detailed Review (>20%)", by[CATEGORY_DETAILED]),
        ("3. Quick Review (10-20%)", by[CATEGORY_QUICK]),
        ("4. Within Threshold (<10%)", by[CATEGORY_WITHIN]),
        ("5. New Ledgers", by[CATEGORY_NEW_LEDGER]),
        ("6. No Movement", by[CATEGORY_NO_MOVEMENT]),
    ]
    for title, rows in detail_sheets:
        s = wb.create_sheet(title)
        write_ledger_rows(s, rows, with_ob=True)
        sheet_title(s, [40, 16, 16, 16, 14, 14])

    # 7. OB Reconciliation
    ob = wb.create_sheet("7. OB Reconciliation")
    ob.append(["Particulars", "Prior Closing", "Current Opening", "Mismatch"])
    for cell in ob[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.border = border
    for r in ob_recon:
        ob.append([r["particulars"], r["priorClosing"], r["opening"], r.get("mismatch")])
    for rr in ob.iter_rows(min_row=2):
        for cell in rr:
            cell.font = body_font
            cell.border = border
            if cell.column > 1:
                cell.number_format = _FF_NUM
    sheet_title(ob, [40, 16, 16, 14])

    meta = wb.create_sheet("Summary")
    meta.append(["Client", client_name])
    meta.append(["Generated", __import__("datetime").date.today().strftime("%d-%m-%Y")])
    meta.append([])
    labels = [
        ("New Ledgers", summary.get("newLedgers", 0)),
        ("No Movement", summary.get("noMovement", 0)),
        ("Dropped", summary.get("dropped", 0)),
        ("Within Threshold (<10%)", summary.get("withinThreshold", 0)),
        ("Quick Review (10-20%)", summary.get("quickReview", 0)),
        ("Detailed Review (>20%)", summary.get("detailedReview", 0)),
        ("OB Mismatches", summary.get("obMismatches", 0)),
        ("Total Ledgers (Current TB)", summary.get("totalCurrent", 0)),
    ]
    meta.append(["Metric", "Count"])
    for cell in meta[3]:
        cell.fill = header_fill
        cell.font = header_font
    for label, val in labels:
        meta.append([label, val])
    meta.column_dimensions["A"].width = 32
    meta.column_dimensions["B"].width = 16
    return wb


def workbook_bytes(analysis: Dict[str, Any], client_name: str = "Client") -> bytes:
    """Serialize the workbook to bytes (caller base64s it over HTTP)."""
    import io

    buf = io.BytesIO()
    build_workbook(analysis, client_name).save(buf)
    return buf.getvalue()


def _summarize(
    results: List[Dict[str, Any]],
    ob_recon: List[Dict[str, Any]],
    total_prior: int,
    total_current: int,
) -> Dict[str, Any]:
    counts = {c: 0 for c in (
        CATEGORY_NEW_LEDGER, CATEGORY_NO_MOVEMENT, CATEGORY_DROPPED,
        CATEGORY_WITHIN, CATEGORY_QUICK, CATEGORY_DETAILED,
    )}
    for r in results:
        counts[r["category"]] = counts.get(r["category"], 0) + 1
    ob_mismatches = sum(1 for o in ob_recon if o.get("mismatch") is not None)
    total_variance_abs = sum(abs(r["variance"] or 0) for r in results if r["category"] in SUB_CATEGORIES)
    return {
        "totalPrior": total_prior,
        "totalCurrent": total_current,
        "newLedgers": counts[CATEGORY_NEW_LEDGER],
        "noMovement": counts[CATEGORY_NO_MOVEMENT],
        "dropped": counts[CATEGORY_DROPPED],
        "withinThreshold": counts[CATEGORY_WITHIN],
        "quickReview": counts[CATEGORY_QUICK],
        "detailedReview": counts[CATEGORY_DETAILED],
        "obMismatches": ob_mismatches,
        "totalVarianceAbs": round(total_variance_abs, 2),
    }