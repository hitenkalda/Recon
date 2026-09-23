"""TDS Compliance Checklist — deterministic engine module (no AI).

Reimplements the logic from the ReconAI TDS prototype (tds-checklist.html)
server-side so the authoritative calculations live in the engine:
per-expense-ledger deduction analysis (section rates + thresholds + 194C
auto-rate), deposit tracking against the TDS Payable ledger's Debit entries,
interest @ 1.5%/month on late/partial deposits, and a month-wise deduction-vs-
payment reconciliation. Everything here is pure function of the input rows.

Row convention matches the rest of the engine: each row is
{"index": rowIndex, "data": <original headers as keys>}.
"""
from __future__ import annotations

import calendar
import io
import math
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from .normalize import normalize_amount

# ── master data (sections) ──────────────────────────────────────────────────

# rateI/rateC: 194C applies the company (2%) vs individual/HUF (1%) split;
# every other section uses the same rate for both.
SECTIONS: Dict[str, Dict[str, Any]] = {
    "194I_land":  {"label": "194I(a)", "name": "Rent-Land/Bldg",     "rateI": 10.0, "rateC": 10.0, "threshold": 240000},
    "194I_plant": {"label": "194I(b)", "name": "Rent-Plant/Mach",    "rateI": 2.0,  "rateC": 2.0,  "threshold": 240000},
    "194J_prof":  {"label": "194J",    "name": "Professional Fees",  "rateI": 10.0, "rateC": 10.0, "threshold": 30000},
    "194J_tech":  {"label": "194J",    "name": "Technical Services", "rateI": 2.0,  "rateC": 2.0,  "threshold": 30000},
    "194C":       {"label": "194C",    "name": "Contractor",         "rateI": 1.0,  "rateC": 2.0,  "threshold": 30000, "alternateThreshold": 100000},
    "194H":       {"label": "194H",    "name": "Commission/Brokerage", "rateI": 5.0, "rateC": 5.0, "threshold": 15000},
    "194A":       {"label": "194A",    "name": "Interest",           "rateI": 10.0, "rateC": 10.0, "threshold": 40000},
    "194D":       {"label": "194D",    "name": "Insurance Comm.",    "rateI": 5.0,  "rateC": 5.0,  "threshold": 15000},
    "194Q":       {"label": "194Q",    "name": "Purchase of Goods",  "rateI": 0.1,  "rateC": 0.1,  "threshold": 5000000},
}

COMPANY_KEYWORDS = (
    "ltd", "limited", "pvt", "private", "llp", "llc", "inc", "corp", "corporation",
    "industries", "enterprise", "enterprises", "associates", "solutions", "services",
    "technologies", "trading", "consultancy", "consultants", "& co", "co.",
)

DEDUCTION_STATUSES = {
    "below_threshold": "BELOW THRESHOLD",
    "not_deducted": "NOT DEDUCTED",
    "short_deduction": "SHORT DEDUCTION",
    "excess_deduction": "EXCESS DEDUCTION",
    "compliant": "COMPLIANT",
}

DEPOSIT_STATUSES = (
    "DEPOSITED ON TIME",
    "LATE DEPOSIT",
    "PARTIALLY DEPOSITED",
    "NOT DEPOSITED",
)

MONTHS = {m[:3].lower(): i for i, m in enumerate(calendar.month_abbr) if m}
MONTH_LABELS = [calendar.month_abbr[i] for i in range(1, 13)]

_DATE_RE_DMY_MMM = re.compile(r"^(\d{1,2})[-\/]([A-Za-z]{3,})[-\/](\d{2,4})$")
_DATE_RE_DMY = re.compile(r"^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$")
# ISO from Excel/pandas ("2025-01-20", "2025-01-20 00:00:00", "2025-01-20T00:00:00").
_DATE_RE_ISO = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$")
_DR_CR_RE = re.compile(r"\s*(Dr|Cr)\s*$", re.I)
_SKIP_TOTAL_RE = re.compile(r"grand total|closing balance|opening balance", re.I)
_IS_DATE_LIKE_RE = re.compile(r"^\d{1,2}[-\/][A-Za-z]{2,}[-\/]\d{2,4}$")
_MONTH_IN_NARATION_RE = re.compile(r"\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[\s\-]*(\d{4})\b", re.I)


def is_company(name: Optional[str]) -> bool:
    if not name:
        return False
    n = str(name).lower()
    return any(k in n for k in COMPANY_KEYWORDS)


def get_rate(section_key: str, party: Optional[str]) -> float:
    m = SECTIONS.get(section_key)
    if not m:
        return 0.0
    if section_key == "194C":
        return m["rateC"] if is_company(party) else m["rateI"]
    return m["rateI"]


# ── amounts / dates ─────────────────────────────────────────────────────────

def parse_amount_cell(raw: object) -> Tuple[float, bool, bool]:
    """Tally amount cell → (magnitude, is_dr, is_cr). Handles 'Dr'/'Cr' suffixes and ₹/commas.

    Side detection matches the prototype's pAmt: the cell is a debit/credit entry
    only when the text contains the side word, not by numeric sign (Tally puts the
    side in the column, not necessarily in the sign).
    """
    if raw is None:
        return 0.0, False, False
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        try:
            return abs(float(raw)), False, False
        except (TypeError, ValueError):
            return 0.0, False, False
    text = re.sub(r"\s+", " ", str(raw).strip())
    if not text or text in {"-", "—", "–", "N/A", "NA"}:
        return 0.0, False, False
    is_dr = bool(re.search(r"\bDr\b", text))
    is_cr = bool(re.search(r"\bCr\b", text))
    cleaned = re.sub(r"\b(Dr|Cr)\.?\b", "", text)  # drop side words, keep magnitude
    val = normalize_amount(cleaned)
    if val is None:
        return 0.0, is_dr, is_cr
    return abs(val), is_dr, is_cr


def _century(y: int) -> int:
    return y + (2000 if y < 50 else 1900) if y < 100 else y


def parse_date_cell(raw: object) -> Optional[date]:
    """Parse a Tally date → date. Handles Excel serials, DD-Mon-YY, DD-MM-YYYY."""
    if raw is None or raw == "":
        return None
    if isinstance(raw, bool):
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    if isinstance(raw, (int, float)):
        n = float(raw)
        # Excel serial; avoid mistaking a bare year (1900..2100) for a serial.
        if n >= 1 and n <= 2958465 and not (1900 <= n <= 2100):
            try:
                return (datetime(1899, 12, 30) + timedelta(days=n)).date()
            except (ValueError, OverflowError):
                return None
        return None
    text = str(raw).strip()
    if not text:
        return None
    m0 = _DATE_RE_ISO.match(text)
    if m0:
        try:
            return date(int(m0.group(1)), int(m0.group(2)), int(m0.group(3)))
        except ValueError:
            return None
    m = _DATE_RE_DMY_MMM.match(text)
    if m:
        mon = MONTHS.get(m.group(2)[:3].lower())
        if mon:
            try:
                return date(_century(int(m.group(3))), mon, int(m.group(1)))
            except ValueError:
                return None
    m2 = _DATE_RE_DMY.match(text)
    if m2:
        try:
            return date(_century(int(m2.group(3))), int(m2.group(2)), int(m2.group(1)))
        except ValueError:
            return None
    return None


def month_key(d: Optional[date]) -> str:
    return f"{d.year}-{d.month:02d}" if d else "?"


def quarter_of(d: Optional[date]) -> str:
    if not d:
        return "—"
    return "Q1" if 4 <= d.month <= 6 else "Q2" if 7 <= d.month <= 9 else "Q3" if 10 <= d.month <= 12 else "Q4"


def due_date_for(d: Optional[date]) -> Optional[date]:
    """TDS due date: 7th of the following month; March deductions due 30 April."""
    if not d:
        return None
    if d.month == 3:
        return date(d.year, 4, 30)
    if d.month == 12:
        return date(d.year + 1, 1, 7)
    return date(d.year, d.month + 1, 7)


def interest_for(amt: float, due: Optional[date], deposited: Optional[date]) -> int:
    """Interest @ 1.5%/month, months rounded up over a 30.44-day month."""
    if not amt or not due or not deposited or deposited <= due:
        return 0
    months = math.ceil((deposited - due).days / 30.44)
    return int(round(amt * 0.015 * months))


# ── column detection / row parsing ──────────────────────────────────────────

def _header_tokens(h: str) -> str:
    return re.sub(r"_", " ", str(h).lower())


def detect_columns(
    headers: List[Any],
    tds_col_hint: Optional[str] = None,
    amount_col_hint: Optional[str] = None,
) -> Dict[str, int]:
    """Map logical TDS fields → column index among the normalized row keys."""
    cols: Dict[str, int] = {}
    for i, h in enumerate(headers):
        t = _header_tokens(h)
        if t == "":
            continue
        if "date" in t and "due" not in t and "expiry" not in t:
            cols.setdefault("date", i)
        elif "voucher" in t:
            cols.setdefault("voucher", i)
        elif t in ("debit", "dr") or "debit" in t:
            cols.setdefault("debit", i)
        elif t in ("credit", "cr") or "credit" in t:
            cols.setdefault("credit", i)
    # particulars / narration / tds / amount use contains matches.
    parts = ["particulars", "party name", "party", "ledger name", "name", "narration", "description", "remarks"]
    for i, h in enumerate(headers):
        t = _header_tokens(h)
        if t == "":
            continue
        if "particulars" in t or "party" in t:
            cols.setdefault("particulars", i)
        elif any(p in t for p in ("narration", "description", "remarks")) and "narration" not in cols:
            cols["narration"] = i
    # TDS column: explicit hint first, else recognises known labels.
    if tds_col_hint:
        for i, h in enumerate(headers):
            if tds_col_hint.lower() in _header_tokens(h):
                cols["tds"] = i
                break
    if "tds" not in cols:
        for i, h in enumerate(headers):
            t = _header_tokens(h)
            if any(k in t for k in ("tds on", "tds deducted", "tax deducted", "tds amount", "tds")):
                cols["tds"] = i
                break
    # Amount (expense) column: explicit hint → ledger-name tokens → default.
    if amount_col_hint:
        for i, h in enumerate(headers):
            if amount_col_hint.lower() in _header_tokens(h):
                cols.setdefault("amount", i)
                break
    return cols


def detect_amount_column(headers: List[Any], ledger_name: str = "", skip: Optional[set] = None) -> Optional[int]:
    """Fallback amount-column detector used when no explicit expense column is given."""
    skip = skip or {"date", "voucher", "particulars", "narration"}
    skips = ["gross total", "gross", "value", "cgst", "sgst", "igst", "cess", "tds", "tax",
             "credit", "debit", "net", "balance", "narration", "date", "voucher", "particulars"]
    for i, h in enumerate(headers):
        t = _header_tokens(h)
        if not t or t in skip:
            continue
        words = [w for w in ledger_name.lower().split() if len(w) > 2]
        if words and any(w in t for w in words):
            return i
    for i, h in enumerate(headers):
        t = _header_tokens(h)
        if not t or t in skip:
            continue
        if not any(s in t for s in skips):
            return i
    for i, h in enumerate(headers):
        t = _header_tokens(h)
        if any(s in t for s in ("gross total", "gross amount", "gross", "amount", "value")):
            return i
    return None


def parse_expense_ledger(ledger_name: str, rows: List[Dict[str, Any]], tds_col: Optional[str] = None, amount_col: Optional[str] = None) -> List[Dict[str, Any]]:
    """Parse one Tally columnar expense ledger → transaction list (prototype parseRows)."""
    parsed: List[Dict[str, Any]] = []
    last_party = ""

    for row in rows:
        data = (row.get("data") or {}) if isinstance(row, dict) else {}
        headers = [k for k in data.keys() if isinstance(k, str)]
        if not headers:
            continue
        cols = detect_columns(headers, tds_col, amount_col)
        amount_idx = cols.get("amount")
        if amount_idx is None:
            # Skip every already-identified logical column (by header token) so the
            # fallback can't grab e.g. the TDS column when the ledger-name matches it.
            skip = {_header_tokens(headers[idx]) for idx in cols.values() if idx is not None and idx < len(headers)}
            amount_idx = detect_amount_column(headers, ledger_name, skip=skip)
        has_dr_cr = cols.get("debit") is not None and cols.get("credit") is not None

        def cell(idx: Optional[int]) -> object:
            if idx is None or idx >= len(headers):
                return None
            return data.get(headers[idx])

        raw_p = str(cell(cols.get("particulars")) or "").strip()
        raw_n = str(cell(cols.get("narration")) or "").strip()
        raw_v = str(cell(cols.get("voucher")) or "").strip()

        if has_dr_cr:
            dr_val, _, _ = parse_amount_cell(cell(cols.get("debit")))
            cr_val, _, _ = parse_amount_cell(cell(cols.get("credit")))
            gross_val = dr_val if dr_val > 0 else cr_val
            is_dr = dr_val > 0
            tds_val = 0.0
        else:
            gross_val, is_dr, _ = parse_amount_cell(cell(amount_idx))
            tds_val, _, _ = parse_amount_cell(cell(cols.get("tds")))
        if gross_val == 0 and tds_val == 0:
            continue

        # Party fill-down (Tally writes the party only on the first narration row).
        nar = (raw_n or raw_p).lower()
        if raw_p and not _IS_DATE_LIKE_RE.match(raw_p) and "total" not in nar and "balance" not in nar:
            last_party = raw_p
        if _SKIP_TOTAL_RE.search(nar):
            continue

        txn_date = parse_date_cell(cell(cols.get("date")))
        if txn_date is None and _IS_DATE_LIKE_RE.match(raw_p):
            txn_date = parse_date_cell(raw_p)
        if txn_date is None:
            mm = _MONTH_IN_NARATION_RE.search(raw_n)
            if mm:
                mon = MONTHS.get(mm.group(1)[:3].lower())
                if mon:
                    try:
                        txn_date = date(int(mm.group(2)), mon, 1)
                    except ValueError:
                        txn_date = None

        parsed.append({
            "index": row.get("index") if isinstance(row, dict) else -1,
            "party": last_party or ledger_name or "Unknown",
            "narration": raw_n,
            "voucher": raw_v,
            "gross": gross_val,
            "tds": tds_val,
            "isDr": is_dr,
            "date": txn_date,
        })
    return parsed


def parse_payable_ledger(rows: List[Dict[str, Any]], amount_col: Optional[str] = None) -> Tuple[float, List[Dict[str, Any]]]:
    """TDS Payable ledger rows → (opening_balance, deposits). Debit entries are deposits."""
    data_rows: List[Dict[str, Any]] = []
    for row in rows:
        data = (row.get("data") or {}) if isinstance(row, dict) else {}
        if data and any(isinstance(k, str) and k for k in data):
            data_rows.append({"index": row.get("index"), "data": data})
    if not data_rows:
        return 0.0, []

    headers = [k for k in data_rows[0]["data"].keys() if isinstance(k, str)]

    # Opening balance = the "Opening Balance" row's credit (rightmost large value).
    opening_bal = 0.0
    for row in data_rows:
        text = " ".join(str(v) for v in (row["data"].get(k) for k in headers) if v is not None).lower()
        if "opening balance" in text or "opening bal" in text:
            for k in reversed(headers):
                val, _, _ = parse_amount_cell(row["data"].get(k))
                if val > 100:
                    opening_bal = val
                    break
            break

    cols = detect_columns(headers, None, amount_col)
    debit_idx = cols.get("debit")
    amount_idx = cols.get("amount")
    if debit_idx is None and amount_idx is None:
        # Single-sided register (Debit/Balance or bare Amount): fall back to a
        # plain amount column, skipping every already-identified logical column
        # so the running-balance / credit side can't be mistaken for a deposit.
        skip = {_header_tokens(headers[idx]) for idx in cols.values() if idx is not None and idx < len(headers)}
        amount_idx = detect_amount_column(headers, skip=skip)
    deposits: List[Dict[str, Any]] = []
    for row in data_rows:
        data = row["data"]
        def cell(idx: Optional[int]) -> object:
            if idx is None or idx >= len(headers):
                return None
            return data.get(headers[idx])
        raw_n = str(cell(cols.get("narration")) or "").strip()
        if _SKIP_TOTAL_RE.search(raw_n.lower()):
            continue
        txn_date = parse_date_cell(cell(cols.get("date")))
        if txn_date is None:
            continue
        if debit_idx is not None:
            dr_val, _, _ = parse_amount_cell(cell(debit_idx))
            if dr_val > 0:
                deposits.append({"date": txn_date, "gross": dr_val, "party": ""})
        elif cols.get("credit") is None:
            # No credit side → the amount column is the single-sided deposit.
            val, _, _ = parse_amount_cell(cell(amount_idx))
            if val > 0:
                deposits.append({"date": txn_date, "gross": val, "party": ""})
    deposits.sort(key=lambda d: d["date"])
    return opening_bal, deposits


# ── analysis ────────────────────────────────────────────────────────────────

def analyze(
    ledgers: List[Dict[str, Any]],
    deposits: List[Dict[str, Any]],
    opening_balance: float = 0.0,
    financial_year: Optional[Tuple[int, int]] = None,
) -> Dict[str, Any]:
    """Run the full checklist. ledgers: [{name, section, txns:[...]}] (parsed)."""
    has_dep = bool(deposits)
    dep_map: Dict[str, List[Dict[str, Any]]] = {}
    for d in deposits:
        k = month_key(d["date"])
        dep_map.setdefault(k, []).append({"date": d["date"], "amount": d["gross"], "used": 0.0})

    results: List[Dict[str, Any]] = []
    tot_gross = tot_req = tot_ded = 0.0
    c_below = c_miss = c_short = c_excess = c_ok = 0

    for ledger in ledgers:
        name = ledger.get("name") or "Ledger"
        sec_key = ledger.get("section") or ""
        master = SECTIONS.get(sec_key, {})
        thr = float(master.get("threshold", 30000))
        sec_label = master.get("label") or sec_key
        sec_name = master.get("name") or ""
        party_cumul: Dict[str, float] = {}

        for txn in ledger.get("txns") or []:
            pk = (txn.get("party") or "unknown").lower().strip()
            prev = party_cumul.get(pk, 0.0)
            cumul = prev + txn.get("gross", 0.0)
            party_cumul[pk] = cumul

            co = is_company(txn.get("party"))
            rate = get_rate(sec_key, txn.get("party")) / 100.0
            party_type = "Company" if sec_key == "194C" and co else "Individual/HUF" if sec_key == "194C" else ""

            applicable = False
            tds_req = 0.0
            remark = ""
            if cumul <= thr:
                remark = f"Below threshold ({cumul:,} / {thr:,})"
            elif prev < thr <= cumul:
                applicable = True
                tds_req = round(cumul * rate, 2)
                remark = f"Threshold crossed! TDS on full {cumul:,}"
            else:
                applicable = True
                tds_req = round(txn.get("gross", 0.0) * rate, 2)
                remark = f"Cumulative: {cumul:,}"

            tds_ded = txn.get("tds", 0.0)
            diff = tds_ded - tds_req
            if not applicable:
                d_stat, d_key = "BELOW THRESHOLD", "below_threshold"
                c_below += 1
            elif tds_ded == 0 and tds_req > 0:
                d_stat, d_key = "NOT DEDUCTED", "not_deducted"
                c_miss += 1
            elif diff < -1:
                d_stat, d_key = "SHORT DEDUCTION", "short_deduction"
                c_short += 1
            elif diff > 1:
                d_stat, d_key = "EXCESS DEDUCTION", "excess_deduction"
                c_excess += 1
            else:
                d_stat, d_key = "COMPLIANT", "compliant"
                c_ok += 1

            # Deposit tracking (FIFO within the transaction's month).
            due, dep_date, dep_amt, dep_stat, days_late, interest = None, None, 0.0, "NO DEPOSIT DATA", 0, 0
            if has_dep and applicable and tds_ded > 0:
                due = due_date_for(txn.get("date"))
                mk = month_key(txn.get("date"))
                month_deps = dep_map.get(mk, [])
                rem = tds_ded
                for dep in month_deps:
                    if rem <= 0:
                        break
                    use = min(dep["amount"] - dep["used"], rem)
                    if use > 0:
                        dep["used"] += use
                        rem -= use
                        dep_amt += use
                        if dep_date is None or dep["date"] > dep_date:
                            dep_date = dep["date"]
                if dep_amt == 0:
                    dep_stat = "NOT DEPOSITED"
                elif dep_amt < tds_ded - 1:
                    dep_stat = "PARTIALLY DEPOSITED"
                    interest = interest_for(dep_amt, due, dep_date)
                    if dep_date and due and dep_date > due:
                        days_late = math.ceil((dep_date - due).days)
                elif dep_date and due and dep_date > due:
                    dep_stat = "LATE DEPOSIT"
                    interest = interest_for(tds_ded, due, dep_date)
                    days_late = math.ceil((dep_date - due).days)
                else:
                    dep_stat = "DEPOSITED ON TIME"

            tot_gross += txn.get("gross", 0.0)
            tot_req += tds_req
            tot_ded += tds_ded

            results.append({
                "documentIndex": txn.get("index"),
                "ledger": name,
                "section": sec_label,
                "sectionKey": sec_key,
                "sectionName": sec_name,
                "party": txn.get("party") or "—",
                "partyType": party_type,
                "isCompany": co,
                "date": txn.get("date"),
                "narration": txn.get("narration"),
                "voucher": txn.get("voucher"),
                "gross": round(txn.get("gross", 0.0), 2),
                "cumulative": round(cumul, 2),
                "rate": round(rate * 100.0, 1),
                "tdsReq": round(tds_req, 2),
                "tdsDed": round(tds_ded, 2),
                "diff": round(diff, 2),
                "dedStatus": d_stat,
                "dedKey": d_key,
                "remark": remark,
                "quarter": quarter_of(txn.get("date")),
                "due": due,
                "depDate": dep_date,
                "depAmt": round(dep_amt, 2),
                "depStatus": dep_stat,
                "daysLate": days_late,
                "interest": interest,
            })

    results.sort(key=lambda r: (r["dedKey"], r["date"] or date.min, r["gross"]), reverse=True)

    tot_int = sum(r["interest"] for r in results)
    late_cnt = sum(1 for r in results if r["depStatus"] in ("LATE DEPOSIT", "PARTIALLY DEPOSITED"))
    not_dep_cnt = sum(1 for r in results if r["depStatus"] == "NOT DEPOSITED")

    section_summary = _section_summary(results, has_dep)
    month_recon, month_meta = _month_reconciliation(results, deposits, opening_balance)

    summary = {
        "totalGross": round(tot_gross, 2),
        "totalReq": round(tot_req, 2),
        "totalDed": round(tot_ded, 2),
        "shortAmount": round(max(0.0, tot_req - tot_ded), 2),
        "notDeducted": c_miss,
        "shortDeductions": c_short,
        "excessDeductions": c_excess,
        "compliant": c_ok,
        "belowThreshold": c_below,
        "notDeposited": not_dep_cnt,
        "lateDeposits": late_cnt,
        "interestLiability": tot_int,
        "hasDeposits": has_dep,
        "transactionCount": len(results),
        "openingBalance": round(opening_balance, 2),
        "totals": {"gross": round(tot_gross, 2), "req": round(tot_req, 2), "ded": round(tot_ded, 2),
                   "interest": tot_int, "closing": round(month_meta["finalBalance"], 2)},
        "fy": {"from": financial_year[0] if financial_year else None, "to": financial_year[1] if financial_year else None},
    }

    return {
        "results": results,
        "sectionSummary": section_summary,
        "monthRecon": month_recon,
        "monthReconMeta": month_meta,
        "summary": summary,
        "sections": SECTIONS,
    }


def _section_summary(results: List[Dict[str, Any]], has_dep: bool) -> List[Dict[str, Any]]:
    by: Dict[str, Dict[str, float]] = {}
    for r in results:
        k = f"{r['section']} — {r['sectionName']}"
        b = by.setdefault(k, {"gross": 0.0, "req": 0.0, "ded": 0.0, "int": 0.0, "cnt": 0, "issues": 0})
        b["gross"] += r["gross"]; b["req"] += r["tdsReq"]; b["ded"] += r["tdsDed"]
        b["int"] += r["interest"]; b["cnt"] += 1
        if r["dedKey"] in ("not_deducted", "short_deduction") or r["depStatus"] in ("NOT DEPOSITED", "LATE DEPOSIT", "PARTIALLY DEPOSITED"):
            b["issues"] += 1
    return [
        {"section": k, "count": int(b["cnt"]), "gross": round(b["gross"], 2), "req": round(b["req"], 2),
         "ded": round(b["ded"], 2), "short": round(max(0.0, b["req"] - b["ded"]), 2), "interest": round(b["int"], 2),
         "issues": int(b["issues"]), "hasDeposits": has_dep}
        for k, b in sorted(by.items())
    ]


def _month_reconciliation(results: List[Dict[str, Any]], deposits: List[Dict[str, Any]], opening_balance: float) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Month-wise deduction-vs-payment running statement (prototype renderMonthRecon)."""
    deducted: Dict[str, float] = {}
    for r in results:
        if not r.get("date") or not r.get("tdsDed"):
            continue
        k = month_key(r["date"])
        deducted[k] = deducted.get(k, 0.0) + r["tdsDed"]

    paid: Dict[str, float] = {}
    pay_by_month: Dict[str, List[Dict[str, Any]]] = {}
    for d in deposits:
        if not d.get("date") or not d.get("gross"):
            continue
        k = month_key(d["date"])
        paid[k] = paid.get(k, 0.0) + d["gross"]
        pay_by_month.setdefault(k, []).append({"date": d["date"], "amount": d["gross"]})

    all_months = sorted(set(list(deducted) + list(paid)))
    rows: List[Dict[str, Any]] = []
    running = opening_balance

    for mk in all_months:
        y, m = int(mk[:4]), int(mk[5:7])
        ded = deducted.get(mk, 0.0)
        pay = paid.get(mk, 0.0)
        opening_this = running
        total_liability = opening_this + ded
        closing = max(0.0, total_liability - pay)

        due_d = date(y, 4, 30) if m == 3 else (date(y + 1, 1, 7) if m == 12 else date(y, m + 1, 7))

        prev_mk = f"{y - 1}-12" if m == 1 else f"{y}-{(m - 1):02d}"
        prev_due = None
        if prev_mk in deducted:
            py, pm = int(prev_mk[:4]), int(prev_mk[5:7])
            prev_due = date(py, 4, 30) if pm == 3 else (date(py + 1, 1, 7) if pm == 12 else date(py, pm + 1, 7))

        pays = sorted(pay_by_month.get(mk, []), key=lambda p: p["date"])
        first_pay = pays[0]["date"] if pays else None
        last_pay = pays[-1]["date"] if pays else None

        status, days_late, interest = "", 0, 0
        if ded == 0 and opening_this == 0:
            status = "PAYMENT ONLY" if pay > 0 else "NIL"
        elif ded > 0 and pay == 0 and closing > 0:
            status = "PENDING PAYMENT"
        elif pay > 0 and first_pay and prev_due and first_pay > prev_due and deducted.get(prev_mk, 0) > 0:
            days_late = math.ceil((first_pay - prev_due).days)
            months = math.ceil(days_late / 30.44)
            interest = int(round(deducted.get(prev_mk, 0) * 0.015 * months))
            status = f"LATE — {days_late}d"
        elif closing > 0 and pay > 0:
            status = "PARTIALLY PAID"
            interest = int(round(closing * 0.015))
        elif pay > 0:
            status = "PAID"
        else:
            status = "PENDING"

        rows.append({
            "month": mk,
            "monthLabel": f"{MONTH_LABELS[m - 1]} {y}",
            "opening": round(opening_this, 2),
            "deducted": round(ded, 2),
            "liability": round(total_liability, 2),
            "dueDate": due_d,
            "firstPay": first_pay,
            "lastPay": last_pay,
            "paid": round(pay, 2),
            "closing": round(closing, 2),
            "daysLate": days_late,
            "interest": interest,
            "status": status,
        })
        running = closing

    total_ded = round(sum(deducted.values()), 2)
    total_paid = round(sum(paid.values()), 2)
    total_int = sum(r["interest"] for r in rows)
    meta = {
        "openingBalance": round(opening_balance, 2),
        "totalDeducted": total_ded,
        "totalPaid": total_paid,
        "finalBalance": round(running, 2),
        "totalInterest": int(total_int),
        "lateCount": sum(1 for r in rows if r["status"].startswith("LATE")),
        "paidCount": sum(1 for r in rows if r["status"] == "PAID"),
        "pendingCount": sum(1 for r in rows if r["status"] in ("PENDING", "PENDING PAYMENT")),
    }
    return rows, meta


# ── Excel export (2 sheets, mirroring the prototype) ────────────────────────

_FF_NUM = "#,##0.00"


def _safe(dt: Optional[date]) -> str:
    return dt.strftime("%d-%m-%Y") if isinstance(dt, date) else ""


# Fast Excel export (xlsxwriter): column-level widths/formats + streamed rows. This replaces
# the per-cell font/border pass that dominated the 100k-row checklist export (2.1M styled cells).
_EXPORT_HEADERS = ["Ledger", "Party", "Party Type", "Section", "Date", "Voucher", "Narration", "Gross",
                   "Cumulative", "Rate%", "TDS Required", "TDS Deducted", "Difference", "Deduction Status",
                   "Due Date", "Deposit Date", "Deposit Amount", "Days Late", "Interest", "Quarter", "Remark"]
_EXPORT_WIDTHS = [20, 28, 14, 8, 12, 10, 30, 12, 12, 6, 12, 12, 10, 18, 12, 12, 12, 10, 10, 6, 30]
_EXPORT_NUM_COLS = {7, 8, 10, 11, 12, 16}  # 0-based -> '#,##0.00' (Gross, Cum, TDS req/ded, Diff, Deposit)
_EXPORT_INT_COL = 18                        # 0-based -> '#,##0' (Interest)
_RECON_HEADERS = ["Month", "Opening Balance", "TDS Deducted", "Total Liability", "Due Date",
                  "First Payment Date", "Last Payment Date", "Total Paid", "Closing Balance",
                  "Days Late", "Interest", "Status"]
_RECON_WIDTHS = [14, 18, 16, 16, 14, 18, 18, 14, 16, 10, 12, 18]
_RECON_NUM_COLS = {1, 2, 3, 7, 8}           # 0-based -> '#,##0.00'


def build_workbook(analysis: Dict[str, Any], client_name: str = "Client") -> bytes:
    """Build the TDS Checklist + Payment Reconciliation Excel workbook.

    xlsxwriter path: widths/formats applied per column (not per cell) and rows streamed,
    so the 100k-row export runs in seconds instead of minutes. Returns finished .xlsx bytes
    with the same sheets, headers, number formats, column widths and frozen header row.
    """
    import xlsxwriter

    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"default_format_properties": {"font_name": "Calibri",
                                                                  "font_size": 10}})
    hdr = wb.add_format({"font_color": "#FFFFFF", "bold": True, "font_size": 10,
                         "bg_color": "1A2B4A", "align": "center", "valign": "vcenter",
                         "border": 1, "border_color": "D9D9D9"})
    nf = wb.add_format({"num_format": _FF_NUM})
    ni = wb.add_format({"num_format": "#,##0"})
    bold = wb.add_format({"bold": True})
    bold_num = wb.add_format({"bold": True, "num_format": _FF_NUM})

    def setup(ws, headers, widths, num_cols, int_cols):
        for i, w in enumerate(widths):
            if i in num_cols:
                ws.set_column(i, i, w, nf)
            elif i in int_cols:
                ws.set_column(i, i, w, ni)
            else:
                ws.set_column(i, i, w)
        for i, h in enumerate(headers):
            ws.write(0, i, h, hdr)
        ws.freeze_panes(1, 0)

    ws = wb.add_worksheet("TDS Checklist")
    setup(ws, _EXPORT_HEADERS, _EXPORT_WIDTHS, _EXPORT_NUM_COLS, {_EXPORT_INT_COL})
    for ridx, r in enumerate(analysis.get("results") or [], start=1):
        row = [
            r["ledger"], r["party"], r["partyType"], r["section"], _safe(r.get("date")), r["voucher"],
            r["narration"], r["gross"], r["cumulative"], r["rate"], r["tdsReq"], r["tdsDed"], r["diff"],
            r["dedStatus"], _safe(r.get("due")), _safe(r.get("depDate")), r["depAmt"], r["daysLate"],
            r["interest"], r["quarter"], r["remark"],
        ]
        # One bulk row write (xlsxwriter maps None -> blank) instead of 21
        # individual write() calls; avoids ~2.1M Python-level call frames.
        ws.write_row(ridx, 0, row)

    ws2 = wb.add_worksheet("Payment Reconciliation")
    setup(ws2, _RECON_HEADERS, _RECON_WIDTHS, _RECON_NUM_COLS, set())
    meta = analysis.get("monthReconMeta") or {}
    for ridx, r in enumerate(analysis.get("monthRecon") or [], start=1):
        row = [
            r["monthLabel"], r["opening"], r["deducted"], r["liability"], _safe(r.get("dueDate")),
            _safe(r.get("firstPay")), _safe(r.get("lastPay")), r["paid"], r["closing"],
            r["daysLate"], r["interest"], r["status"],
        ]
        for c, v in enumerate(row):
            ws2.write(ridx, c, v if v is not None else "")
    total = ["TOTAL", meta.get("openingBalance", 0), meta.get("totalDeducted", 0),
             (meta.get("openingBalance", 0) or 0) + (meta.get("totalDeducted", 0) or 0), "", "", "",
             meta.get("totalPaid", 0), meta.get("finalBalance", 0), "", meta.get("totalInterest", 0), ""]
    total_row = 1 + len(analysis.get("monthRecon") or [])
    for c, v in enumerate(total):
        fmt = bold if c not in _RECON_NUM_COLS else bold_num
        ws2.write(total_row, c, v if v is not None else "", fmt)

    wb.close()
    return buf.getvalue()


def workbook_bytes(analysis: Dict[str, Any], client_name: str = "Client") -> bytes:
    return build_workbook(analysis, client_name)


def run_checklist(
    ledgers: List[Dict[str, Any]],
    payable_rows: Optional[List[Dict[str, Any]]] = None,
    payable_amount_col: Optional[str] = None,
    financial_year: Optional[Tuple[int, int]] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Top-level entry: parses ledgers + optional payable, then runs analyze().

    ledgers: [{name, section, tdsCol?, amountCol?, rows: [{index, data}]}]
    """
    cfg = config or {}
    parsed_ledgers: List[Dict[str, Any]] = []
    for lg in ledgers or []:
        name = lg.get("name") or "Ledger"
        txns = parse_expense_ledger(name, lg.get("rows") or [], lg.get("tdsCol"), lg.get("amountCol"))
        parsed_ledgers.append({"name": name, "section": lg.get("section") or "", "txns": txns})

    opening_bal = 0.0
    deposits: List[Dict[str, Any]] = []
    if payable_rows:
        opening_bal, deposits = parse_payable_ledger(payable_rows, payable_amount_col)

    analysis = analyze(parsed_ledgers, deposits, opening_bal, financial_year)
    analysis["config"] = cfg
    if cfg.get("clientName"):
        analysis["clientName"] = cfg["clientName"]
    return analysis