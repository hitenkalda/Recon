"""Deterministic risk analysis engine for transactions, invoices, and expenses.

Phase 10 — Transaction Risk, Invoice Verification, and Expense Verification.

Every rule takes a row dict (or list of rows for cross-row rules) plus a config
dict for threshold overrides.  Each rule returns (triggered, score, reason).

Risk scoring:
  composite  = min(100, sum of triggered rule scores)
  level      = critical (>=75), high (>=50), medium (>=25), low (<25)
"""
from __future__ import annotations

import math
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

from .normalize import (
    normalize_amount,
    normalize_date,
    normalize_gstin,
    normalize_invoice,
    normalize_vendor,
)

# ── defaults ─────────────────────────────────────────────────────────────────

DEFAULTS: Dict[str, Any] = {
    # transaction rules
    "periodEndDays": 3,
    "roundNumbers": [100, 500, 1000, 5000, 10000, 25000, 50000, 100000,
                     200000, 500000, 1000000, 5000000, 10000000],
    "largeMultiplier": 5.0,
    "cashThreshold": 10000.0,
    "monthEndDays": 3,
    # invoice rules
    "taxTolerancePct": 1.0,
    "taxToleranceAbs": 10.0,
    # expense rules
    "highExpenseThreshold": 50000.0,
    "personalKeywords": [
        "medical", "hospital", "pharmacy", "personal", "travel", "holiday",
        "vacation", "tuition", "school", "college", "gym", "club",
        "entertainment", "movie", "restaurant", "bar", "spa", "salon",
        "clothing", "apparel", "shoes", "jewellery", "gift", "donation",
        "insurance premium", "credit card", "emi", "loan", "mortgage",
    ],
    "splitThresholdPct": 10.0,
    "splitTolerancePct": 1.0,
    # scoring weights
    "ruleWeights": {
        "periodEndJournal": 30,
        "backdatedEntry": 40,
        "roundNumber": 10,
        "missingNarration": 5,
        "largeOneTime": 35,
        "reversal": 25,
        "repeatedAmount": 15,
        "unusualAccount": 20,
        "highValueCash": 30,
        "negativeBalance": 25,
        "unusualMonthEnd": 20,
        "weekendTransaction": 10,
        "missingDocument": 10,
        "duplicateInvoice": 30,
        "invalidGstin": 40,
        "taxMismatch": 25,
        "invoiceOutOfPeriod": 20,
        "vendorMismatch": 15,
        "sequenceGap": 10,
        "incompleteFields": 10,
        "missingBill": 15,
        "duplicateBill": 25,
        "personalExpense": 20,
        "weekendExpense": 10,
        "highValueExpense": 15,
        "roundExpense": 10,
        "splitTransaction": 20,
    },
}

# ── helpers ──────────────────────────────────────────────────────────────────


def _field(row: Dict[str, Any], key: str) -> Any:
    """Extract a field from {index, data} row format."""
    return (row.get("data") or {}).get(key)


def _as_float(v: Any) -> Optional[float]:
    """Best-effort conversion to float."""
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _as_date(v: Any) -> Optional[date]:
    """Best-effort conversion to date."""
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    iso = normalize_date(v)
    if iso:
        try:
            return date.fromisoformat(iso)
        except (ValueError, TypeError):
            return None
    return None


def _is_round_number(amount: float, round_numbers: List[float]) -> bool:
    """Check if amount is exactly one of the canonical round numbers."""
    for rn in round_numbers:
        if abs(amount - rn) < 0.01:
            return True
    return False


def _is_weekend(d: Optional[date]) -> bool:
    """Saturday=5, Sunday=6."""
    if d is None:
        return False
    return d.weekday() >= 5


def _weight(config: Dict[str, Any], rule_name: str) -> float:
    """Get the score weight for a rule from config, falling back to DEFAULTS."""
    weights = config.get("ruleWeights") or DEFAULTS["ruleWeights"]
    return float(weights.get(rule_name, DEFAULTS["ruleWeights"].get(rule_name, 10)))


# ── Transaction Risk Rules ──────────────────────────────────────────────────


def rule_period_end_journal(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Manual journal posted within N days of period end."""
    dt = _as_date(_field(row, "date"))
    if dt is None:
        return False, 0.0, ""
    days = int(config.get("periodEndDays", DEFAULTS["periodEndDays"]))
    # Check last N days of every month
    import calendar
    last_day = calendar.monthrange(dt.year, dt.month)[1]
    days_to_end = last_day - dt.day
    if days_to_end <= days:
        return True, _weight(config, "periodEndJournal"), (
            f"Journal posted {days_to_end} day(s) before month-end ({dt})"
        )
    return False, 0.0, ""


def rule_backdated_entry(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Entry dated before previous period close."""
    dt = _as_date(_field(row, "date"))
    period_end = _as_date(_field(row, "periodEnd") or _field(row, "period_end"))
    if dt is None or period_end is None:
        return False, 0.0, ""
    if dt < period_end:
        diff = (period_end - dt).days
        return True, _weight(config, "backdatedEntry"), (
            f"Entry dated {diff} day(s) before period end ({period_end})"
        )
    return False, 0.0, ""


def rule_round_number(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Amount is a round number."""
    amount = normalize_amount(_field(row, "amount"))
    if amount is None:
        return False, 0.0, ""
    round_nums = config.get("roundNumbers", DEFAULTS["roundNumbers"])
    if _is_round_number(amount, round_nums):
        return True, _weight(config, "roundNumber"), f"Amount ₹{amount:,.2f} is a round number"
    return False, 0.0, ""


def rule_missing_narration(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """No narration/description."""
    narration = _field(row, "narration") or _field(row, "description") or _field(row, "particulars")
    if not narration or str(narration).strip() in {"", "N/A", "NA", "-"}:
        return True, _weight(config, "missingNarration"), "No narration or description provided"
    return False, 0.0, ""


def rule_large_one_time(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Amount exceeds threshold (default 5x median)."""
    amount = normalize_amount(_field(row, "amount"))
    if amount is None:
        return False, 0.0, ""
    threshold = config.get("largeOneTimeThreshold")
    if threshold is not None:
        thr = float(threshold)
    else:
        multiplier = float(config.get("largeMultiplier", DEFAULTS["largeMultiplier"]))
        median = _as_float(_field(row, "_medianAmount"))
        if median is None or median <= 0:
            return False, 0.0, ""
        thr = median * multiplier
    if abs(amount) >= thr:
        return True, _weight(config, "largeOneTime"), (
            f"Amount ₹{amount:,.2f} exceeds large threshold ₹{thr:,.2f}"
        )
    return False, 0.0, ""


def rule_reversal(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Reversal entry after period close."""
    dt = _as_date(_field(row, "date"))
    period_end = _as_date(_field(row, "periodEnd") or _field(row, "period_end"))
    is_rev = _field(row, "isReversal") or _field(row, "is_reversal")
    if is_rev and dt and period_end and dt > period_end:
        diff = (dt - period_end).days
        return True, _weight(config, "reversal"), (
            f"Reversal entry dated {diff} day(s) after period close"
        )
    return False, 0.0, ""


def rule_repeated_amount(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Same amount appears N+ times (requires _amountCounts precomputed)."""
    amount = normalize_amount(_field(row, "amount"))
    if amount is None:
        return False, 0.0, ""
    counts = _field(row, "_amountCounts")
    if counts is None:
        return False, 0.0, ""
    cnt = int(counts)
    threshold = int(config.get("repeatedAmountThreshold", 3))
    if cnt >= threshold:
        return True, _weight(config, "repeatedAmount"), (
            f"Amount ₹{amount:,.2f} appears {cnt} times (threshold {threshold})"
        )
    return False, 0.0, ""


def rule_unusual_account(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Unusual debit/credit account combination."""
    debit = normalize_vendor(_field(row, "debitAccount") or _field(row, "debit_account"))
    credit = normalize_vendor(_field(row, "creditAccount") or _field(row, "credit_account"))
    if not debit or not credit:
        return False, 0.0, ""
    unusual_pairs = config.get("unusualAccountPairs")
    if unusual_pairs:
        pair_key = f"{debit}|{credit}".lower()
        for up in unusual_pairs:
            if isinstance(up, dict):
                up_key = f"{up.get('debit', '')}|{up.get('credit', '')}".lower()
                if up_key == pair_key:
                    return True, _weight(config, "unusualAccount"), (
                        f"Unusual account pair: {debit} → {credit}"
                    )
    # Heuristic: if same account on both sides
    if debit.lower() == credit.lower():
        return True, _weight(config, "unusualAccount"), (
            f"Same account on both debit and credit: {debit}"
        )
    return False, 0.0, ""


def rule_high_value_cash(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Cash transaction above threshold."""
    amount = normalize_amount(_field(row, "amount"))
    if amount is None:
        return False, 0.0, ""
    account = str(_field(row, "debitAccount") or _field(row, "creditAccount") or
                  _field(row, "account") or "").lower()
    is_cash = "cash" in account
    if not is_cash:
        mode = str(_field(row, "paymentMode") or _field(row, "payment_mode") or "").lower()
        is_cash = "cash" in mode or mode in {"cash", "petty cash"}
    if not is_cash:
        return False, 0.0, ""
    threshold = float(config.get("cashThreshold", DEFAULTS["cashThreshold"]))
    if abs(amount) >= threshold:
        return True, _weight(config, "highValueCash"), (
            f"Cash transaction ₹{amount:,.2f} exceeds threshold ₹{threshold:,.2f}"
        )
    return False, 0.0, ""


def rule_negative_balance(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Running balance goes negative."""
    balance = _as_float(_field(row, "balance") or _field(row, "runningBalance"))
    if balance is not None and balance < 0:
        return True, _weight(config, "negativeBalance"), (
            f"Running balance is negative: ₹{balance:,.2f}"
        )
    return False, 0.0, ""


def rule_unusual_month_end(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Large movement in last N days of month."""
    dt = _as_date(_field(row, "date"))
    amount = normalize_amount(_field(row, "amount"))
    if dt is None or amount is None:
        return False, 0.0, ""
    import calendar
    last_day = calendar.monthrange(dt.year, dt.month)[1]
    month_end_days = int(config.get("monthEndDays", DEFAULTS["monthEndDays"]))
    if (last_day - dt.day) < month_end_days:
        threshold = _as_float(_field(row, "_medianAmount"))
        multiplier = float(config.get("largeMultiplier", DEFAULTS["largeMultiplier"]))
        if threshold and threshold > 0:
            if abs(amount) >= threshold * multiplier:
                return True, _weight(config, "unusualMonthEnd"), (
                    f"Large amount ₹{amount:,.2f} in last {month_end_days} days of month"
                )
    return False, 0.0, ""


def rule_weekend_transaction(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Transaction on weekend/holiday."""
    dt = _as_date(_field(row, "date"))
    if dt is None:
        return False, 0.0, ""
    if _is_weekend(dt):
        day_name = "Saturday" if dt.weekday() == 5 else "Sunday"
        return True, _weight(config, "weekendTransaction"), (
            f"Transaction on {day_name} ({dt})"
        )
    return False, 0.0, ""


def rule_missing_document(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """No supporting document reference."""
    doc = (_field(row, "document") or _field(row, "supportingDoc") or
           _field(row, "supporting_doc") or _field(row, "voucherRef") or
           _field(row, "voucher_ref"))
    if not doc or str(doc).strip() in {"", "N/A", "NA", "-"}:
        return True, _weight(config, "missingDocument"), "No supporting document reference"
    return False, 0.0, ""


# ── Invoice Verification Rules ──────────────────────────────────────────────


def rule_duplicate_invoice(rows: List[Dict[str, Any]], config: Dict[str, Any]) -> List[Tuple[bool, float, str]]:
    """Same invoice number + vendor appears multiple times.

    Returns one result per row in `rows`.
    """
    inv_idx: Dict[Tuple[str, str], List[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        inv = normalize_invoice(_field(r, "invoice"))
        vendor = normalize_vendor(_field(r, "vendor"))
        if inv:
            key = (inv, vendor or "")
            inv_idx[key].append(i)

    results: List[Optional[Tuple[bool, float, str]]] = [None] * len(rows)
    score = _weight(config, "duplicateInvoice")
    for key, indices in inv_idx.items():
        if len(indices) > 1:
            for idx in indices:
                results[idx] = (
                    True, score,
                    f"Invoice {key[0]} appears {len(indices)} times"
                )
    for i in range(len(rows)):
        if results[i] is None:
            results[i] = (False, 0.0, "")
    return results  # type: ignore[return-value]


def rule_invalid_gstin(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """GSTIN fails checksum validation."""
    gstin = _field(row, "gstin")
    if gstin is None or str(gstin).strip() in {"", "N/A", "NA", "-"}:
        return False, 0.0, ""
    normalized = normalize_gstin(gstin)
    if normalized is None:
        return True, _weight(config, "invalidGstin"), f"GSTIN '{gstin}' failed checksum validation"
    return False, 0.0, ""


def rule_tax_mismatch(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Calculated tax doesn't match stated tax."""
    amount = normalize_amount(_field(row, "amount"))
    stated_tax = normalize_amount(_field(row, "tax") or _field(row, "taxAmount") or
                                  _field(row, "tax_amount"))
    tax_rate = _as_float(_field(row, "taxRate") or _field(row, "tax_rate") or
                         _field(row, "gstRate"))
    if amount is None or stated_tax is None:
        return False, 0.0, ""
    if tax_rate is not None and tax_rate > 0:
        expected_tax = round(amount * tax_rate / 100.0, 2)
    else:
        # Try to infer rate from stated tax
        return False, 0.0, ""
    tol_pct = float(config.get("taxTolerancePct", DEFAULTS["taxTolerancePct"]))
    tol_abs = float(config.get("taxToleranceAbs", DEFAULTS["taxToleranceAbs"]))
    diff = abs(expected_tax - stated_tax)
    if diff <= tol_abs or (expected_tax > 0 and diff / abs(expected_tax) * 100 <= tol_pct):
        return False, 0.0, ""
    return True, _weight(config, "taxMismatch"), (
        f"Tax mismatch: expected ₹{expected_tax:,.2f}, stated ₹{stated_tax:,.2f}"
    )


def rule_invoice_out_of_period(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Invoice date outside engagement period."""
    dt = _as_date(_field(row, "date") or _field(row, "invoiceDate") or _field(row, "invoice_date"))
    period_start = _as_date(_field(row, "periodStart") or _field(row, "period_start"))
    period_end = _as_date(_field(row, "periodEnd") or _field(row, "period_end"))
    if dt is None:
        return False, 0.0, ""
    if period_start and dt < period_start:
        return True, _weight(config, "invoiceOutOfPeriod"), (
            f"Invoice date {dt} before period start {period_start}"
        )
    if period_end and dt > period_end:
        return True, _weight(config, "invoiceOutOfPeriod"), (
            f"Invoice date {dt} after period end {period_end}"
        )
    return False, 0.0, ""


def rule_vendor_mismatch(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Vendor name differs from ledger vendor."""
    inv_vendor = normalize_vendor(_field(row, "vendor"))
    ledger_vendor = normalize_vendor(_field(row, "ledgerVendor") or _field(row, "ledger_vendor"))
    if not inv_vendor or not ledger_vendor:
        return False, 0.0, ""
    from .normalize import similarity as _sim
    if _sim(inv_vendor.lower(), ledger_vendor.lower()) < 0.6:
        return True, _weight(config, "vendorMismatch"), (
            f"Vendor mismatch: invoice '{inv_vendor}' vs ledger '{ledger_vendor}'"
        )
    return False, 0.0, ""


def rule_sequence_gap(rows: List[Dict[str, Any]], config: Dict[str, Any]) -> List[Tuple[bool, float, str]]:
    """Invoice number sequence has gaps.

    Returns one result per row in `rows`.
    """
    results: List[Tuple[bool, float, str]] = []
    score = _weight(config, "sequenceGap")

    # Group by prefix, try to detect numeric sequences
    sequences: Dict[str, List[int]] = defaultdict(list)
    row_by_key: Dict[Tuple[str, int], int] = {}
    for i, r in enumerate(rows):
        inv = normalize_invoice(_field(r, "invoice"))
        if not inv:
            results.append((False, 0.0, ""))
            continue
        # Extract trailing numeric part
        m = re.search(r"(\d+)$", inv)
        if m:
            num = int(m.group(1))
            prefix = inv[:m.start()]
            sequences[prefix].append(num)
            row_by_key[(prefix, num)] = i
        else:
            results.append((False, 0.0, ""))

    gaps: Dict[Tuple[str, int], bool] = {}
    for prefix, nums in sequences.items():
        nums_sorted = sorted(set(nums))
        if len(nums_sorted) < 2:
            continue
        for j in range(1, len(nums_sorted)):
            gap = nums_sorted[j] - nums_sorted[j - 1]
            if gap > 1:
                # Mark both the gap start and gap end as flagged
                gaps[(prefix, nums_sorted[j - 1])] = True
                gaps[(prefix, nums_sorted[j])] = True

    # Rebuild results
    results = []
    for i, r in enumerate(rows):
        inv = normalize_invoice(_field(r, "invoice"))
        if not inv:
            results.append((False, 0.0, ""))
            continue
        m = re.search(r"(\d+)$", inv)
        if m:
            prefix = inv[:m.start()]
            num = int(m.group(1))
            if (prefix, num) in gaps:
                results.append((True, score, f"Invoice number sequence gap detected around '{inv}'"))
            else:
                results.append((False, 0.0, ""))
        else:
            results.append((False, 0.0, ""))

    return results


def rule_incomplete_fields(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Missing mandatory fields."""
    mandatory = config.get("mandatoryInvoiceFields") or [
        "invoice", "vendor", "amount", "date", "gstin",
    ]
    missing = []
    for f in mandatory:
        val = _field(row, f)
        if val is None or str(val).strip() in {"", "N/A", "NA", "-"}:
            missing.append(f)
    if missing:
        return True, _weight(config, "incompleteFields"), (
            f"Missing fields: {', '.join(missing)}"
        )
    return False, 0.0, ""


# ── Expense Verification Rules ──────────────────────────────────────────────


def rule_missing_bill(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Expense without supporting document."""
    doc = (_field(row, "document") or _field(row, "bill") or _field(row, "receipt") or
           _field(row, "supportingDoc") or _field(row, "supporting_doc"))
    if not doc or str(doc).strip() in {"", "N/A", "NA", "-"}:
        return True, _weight(config, "missingBill"), "No supporting bill or receipt"
    return False, 0.0, ""


def rule_duplicate_bill(rows: List[Dict[str, Any]], config: Dict[str, Any]) -> List[Tuple[bool, float, str]]:
    """Same bill uploaded multiple times.

    Returns one result per row in `rows`.
    """
    bill_idx: Dict[Tuple[str, str, float], List[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        doc = str(_field(r, "document") or _field(r, "bill") or _field(r, "receipt") or "").strip()
        vendor = str(normalize_vendor(_field(r, "vendor")) or "").strip()
        amount = normalize_amount(_field(r, "amount"))
        if doc and doc not in {"N/A", "NA", "-"}:
            amt_key = round(amount, 2) if amount is not None else 0.0
            bill_idx[(doc, vendor, amt_key)].append(i)

    results: List[Optional[Tuple[bool, float, str]]] = [None] * len(rows)
    score = _weight(config, "duplicateBill")
    for key, indices in bill_idx.items():
        if len(indices) > 1:
            for idx in indices:
                results[idx] = (
                    True, score,
                    f"Bill '{key[0]}' appears {len(indices)} times"
                )
    for i in range(len(rows)):
        if results[i] is None:
            results[i] = (False, 0.0, "")
    return results  # type: ignore[return-value]


def rule_personal_expense(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Looks like personal expense (keywords in description/narration)."""
    text = str(
        _field(row, "narration") or _field(row, "description") or
        _field(row, "particulars") or _field(row, "expenseHead") or ""
    ).lower()
    if not text:
        return False, 0.0, ""
    keywords = config.get("personalKeywords", DEFAULTS["personalKeywords"])
    for kw in keywords:
        if kw.lower() in text:
            return True, _weight(config, "personalExpense"), (
                f"Expense description contains keyword '{kw}'"
            )
    return False, 0.0, ""


def rule_weekend_expense(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Expense claimed on weekend."""
    dt = _as_date(_field(row, "date") or _field(row, "expenseDate"))
    if dt is None:
        return False, 0.0, ""
    if _is_weekend(dt):
        day_name = "Saturday" if dt.weekday() == 5 else "Sunday"
        return True, _weight(config, "weekendExpense"), (
            f"Expense claimed on {day_name} ({dt})"
        )
    return False, 0.0, ""


def rule_high_value_expense(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Expense above threshold."""
    amount = normalize_amount(_field(row, "amount"))
    if amount is None:
        return False, 0.0, ""
    threshold = float(config.get("highExpenseThreshold", DEFAULTS["highExpenseThreshold"]))
    if abs(amount) >= threshold:
        return True, _weight(config, "highValueExpense"), (
            f"Expense ₹{amount:,.2f} exceeds threshold ₹{threshold:,.2f}"
        )
    return False, 0.0, ""


def rule_round_expense(row: Dict[str, Any], config: Dict[str, Any]) -> Tuple[bool, float, str]:
    """Suspiciously round amount."""
    amount = normalize_amount(_field(row, "amount"))
    if amount is None:
        return False, 0.0, ""
    round_nums = config.get("roundNumbers", DEFAULTS["roundNumbers"])
    if _is_round_number(amount, round_nums):
        return True, _weight(config, "roundExpense"), (
            f"Expense amount ₹{amount:,.2f} is a round number"
        )
    return False, 0.0, ""


def rule_split_transaction(rows: List[Dict[str, Any]], config: Dict[str, Any]) -> List[Tuple[bool, float, str]]:
    """Multiple small amounts that add up to a round number.

    Returns one result per row in `rows`.
    """
    results: List[Optional[Tuple[bool, float, str]]] = [None] * len(rows)
    score = _weight(config, "splitTransaction")
    threshold_pct = float(config.get("splitThresholdPct", DEFAULTS["splitThresholdPct"]))
    split_tol_pct = float(config.get("splitTolerancePct", DEFAULTS["splitTolerancePct"]))
    round_nums = config.get("roundNumbers", DEFAULTS["roundNumbers"])

    # Group by vendor + date proximity (same day)
    vendor_date_groups: Dict[Tuple[str, str], List[int]] = defaultdict(list)
    for i, r in enumerate(rows):
        vendor = normalize_vendor(_field(r, "vendor")) or "_"
        dt = _as_date(_field(row=r, key="date") if False else _field(r, "date"))
        date_key = dt.isoformat() if dt else "_"
        vendor_date_groups[(vendor, date_key)].append(i)

    flagged_indices: set = set()
    for (vendor, date_key), indices in vendor_date_groups.items():
        if len(indices) < 2:
            continue
        amounts = []
        for idx in indices:
            amt = normalize_amount(_field(rows[idx], "amount"))
            if amt is not None and amt > 0:
                amounts.append((idx, amt))
        if len(amounts) < 2:
            continue
        # Check if any subset sums to a round number
        total = sum(a for _, a in amounts)
        for rn in round_nums:
            if rn <= 0:
                continue
            diff_pct = abs(total - rn) / rn * 100 if rn > 0 else float("inf")
            if diff_pct <= split_tol_pct:
                for idx, _ in amounts:
                    flagged_indices.add(idx)
                break

    for i in range(len(rows)):
        if i in flagged_indices:
            amt = normalize_amount(_field(rows[i], "amount"))
            results[i] = (
                True, score,
                f"Potential split transaction: ₹{amt:,.2f} part of a group summing to ~round amount"
            )
        else:
            results[i] = (False, 0.0, "")
    return results  # type: ignore[return-value]


# ── Transaction rule registry ────────────────────────────────────────────────

_TRANSACTION_RULES: List[Callable[..., Tuple[bool, float, str]]] = [
    rule_period_end_journal,
    rule_backdated_entry,
    rule_round_number,
    rule_missing_narration,
    rule_large_one_time,
    rule_reversal,
    rule_repeated_amount,
    rule_unusual_account,
    rule_high_value_cash,
    rule_negative_balance,
    rule_unusual_month_end,
    rule_weekend_transaction,
    rule_missing_document,
]

# Cross-row transaction rules
_TRANSACTION_CROSS_RULES: List[str] = [
    "repeatedAmount",
]


# ── Main orchestrators ──────────────────────────────────────────────────────


def analyze_transactions(rows: List[Dict[str, Any]], config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Run all transaction risk rules on a list of rows.

    Each row is {"index": int, "data": dict}.

    Returns:
        {
          "items": [
            {
              "row": {...},
              "riskScore": float,  # 0-100
              "riskLevel": str,    # critical / high / medium / low
              "triggeredRules": [{"rule": str, "score": float, "reason": str}],
            }
          ],
          "metrics": {
            "total": int,
            "highRisk": int,
            "mediumRisk": int,
            "lowRisk": int,
            "criticalRisk": int,
            "ruleCounts": {ruleName: int},
          },
          "rules": [str],
        }
    """
    cfg = {**DEFAULTS, **(config or {})}
    rule_names = [r.__name__.replace("rule_", "") for r in _TRANSACTION_RULES]

    # Precompute amount counts for repeated_amount rule
    amount_counts: Dict[float, int] = defaultdict(int)
    amounts = []
    for r in rows:
        amt = normalize_amount(_field(r, "amount"))
        if amt is not None:
            amount_counts[round(amt, 2)] += 1
            amounts.append(round(amt, 2))

    # Median amount for large_one_time
    median_amount = 0.0
    if amounts:
        sorted_amts = sorted(amounts)
        mid = len(sorted_amts) // 2
        if len(sorted_amts) % 2 == 0:
            median_amount = (sorted_amts[mid - 1] + sorted_amts[mid]) / 2.0
        else:
            median_amount = sorted_amts[mid]

    items: List[Dict[str, Any]] = []
    rule_counts: Dict[str, int] = {name: 0 for name in rule_names}

    for r in rows:
        # Inject precomputed helpers into row data for rule access
        r_data = r.get("data") or {}
        r_data["_amountCounts"] = amount_counts.get(
            round(normalize_amount(_field(r, "amount")) or 0, 2), 0
        )
        r_data["_medianAmount"] = median_amount

        triggered: List[Dict[str, str]] = []
        composite = 0.0

        for rule_fn in _TRANSACTION_RULES:
            rule_name = rule_fn.__name__.replace("rule_", "")
            try:
                fired, score, reason = rule_fn(r, cfg)
            except Exception:
                continue
            if fired:
                triggered.append({"rule": rule_name, "score": score, "reason": reason})
                composite += score
                rule_counts[rule_name] = rule_counts.get(rule_name, 0) + 1

        composite = min(100.0, composite)
        if composite >= 75:
            level = "critical"
        elif composite >= 50:
            level = "high"
        elif composite >= 25:
            level = "medium"
        else:
            level = "low"

        items.append({
            "row": r,
            "riskScore": round(composite, 2),
            "riskLevel": level,
            "triggeredRules": triggered,
        })

    # Clean injected fields
    for r in rows:
        d = r.get("data") or {}
        d.pop("_amountCounts", None)
        d.pop("_medianAmount", None)

    risk_levels = defaultdict(int)
    for it in items:
        risk_levels[it["riskLevel"]] += 1

    metrics = {
        "total": len(items),
        "criticalRisk": risk_levels.get("critical", 0),
        "highRisk": risk_levels.get("high", 0),
        "mediumRisk": risk_levels.get("medium", 0),
        "lowRisk": risk_levels.get("low", 0),
        "ruleCounts": {k: v for k, v in rule_counts.items() if v > 0},
    }
    return {"items": items, "metrics": metrics, "rules": rule_names}


def analyze_invoices(rows: List[Dict[str, Any]], config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Run all invoice verification rules.

    Each row is {"index": int, "data": dict}.

    Returns:
        {
          "items": [...],
          "metrics": { total, flagged, duplicates, invalidGstin, taxMismatches, ... },
          "rules": [str],
        }
    """
    cfg = {**DEFAULTS, **(config or {})}

    # Cross-row rules
    dup_results = rule_duplicate_invoice(rows, cfg)
    seq_results = rule_sequence_gap(rows, cfg)

    single_rules = [
        rule_invalid_gstin,
        rule_tax_mismatch,
        rule_invoice_out_of_period,
        rule_vendor_mismatch,
        rule_incomplete_fields,
    ]
    single_names = [r.__name__.replace("rule_", "") for r in single_rules]
    cross_names = ["duplicateInvoice", "sequenceGap"]
    all_rule_names = single_names + cross_names

    items: List[Dict[str, Any]] = []
    rule_counts: Dict[str, int] = {name: 0 for name in all_rule_names}
    flagged_count = 0
    metrics_extra: Dict[str, int] = {}

    for i, r in enumerate(rows):
        triggered: List[Dict[str, str]] = []
        composite = 0.0

        # Cross-row rules
        for rule_name, result in [("duplicateInvoice", dup_results[i]),
                                   ("sequenceGap", seq_results[i])]:
            fired, score, reason = result
            if fired:
                triggered.append({"rule": rule_name, "score": score, "reason": reason})
                composite += score
                rule_counts[rule_name] = rule_counts.get(rule_name, 0) + 1
                metrics_extra[rule_name] = metrics_extra.get(rule_name, 0) + 1

        # Single-row rules
        for rule_fn in single_rules:
            rule_name = rule_fn.__name__.replace("rule_", "")
            try:
                fired, score, reason = rule_fn(r, cfg)
            except Exception:
                continue
            if fired:
                triggered.append({"rule": rule_name, "score": score, "reason": reason})
                composite += score
                rule_counts[rule_name] = rule_counts.get(rule_name, 0) + 1
                metrics_extra[rule_name] = metrics_extra.get(rule_name, 0) + 1

        composite = min(100.0, composite)
        if composite >= 75:
            level = "critical"
        elif composite >= 50:
            level = "high"
        elif composite >= 25:
            level = "medium"
        else:
            level = "low"

        if triggered:
            flagged_count += 1

        items.append({
            "row": r,
            "riskScore": round(composite, 2),
            "riskLevel": level,
            "triggeredRules": triggered,
        })

    metrics = {
        "total": len(items),
        "flagged": flagged_count,
        "ruleCounts": {k: v for k, v in rule_counts.items() if v > 0},
        **{k: v for k, v in metrics_extra.items()},
    }
    return {"items": items, "metrics": metrics, "rules": all_rule_names}


def analyze_expenses(rows: List[Dict[str, Any]], config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Run all expense verification rules.

    Each row is {"index": int, "data": dict}.

    Returns:
        {
          "items": [...],
          "metrics": { total, flagged, missingBills, duplicates, personalExpenses, ... },
          "rules": [str],
        }
    """
    cfg = {**DEFAULTS, **(config or {})}

    # Cross-row rules
    dup_bill_results = rule_duplicate_bill(rows, cfg)
    split_results = rule_split_transaction(rows, cfg)

    single_rules = [
        rule_missing_bill,
        rule_personal_expense,
        rule_weekend_expense,
        rule_high_value_expense,
        rule_round_expense,
    ]
    single_names = [r.__name__.replace("rule_", "") for r in single_rules]
    cross_names = ["duplicateBill", "splitTransaction"]
    all_rule_names = single_names + cross_names

    items: List[Dict[str, Any]] = []
    rule_counts: Dict[str, int] = {name: 0 for name in all_rule_names}
    flagged_count = 0
    metrics_extra: Dict[str, int] = {}

    for i, r in enumerate(rows):
        triggered: List[Dict[str, str]] = []
        composite = 0.0

        # Cross-row rules
        for rule_name, result in [("duplicateBill", dup_bill_results[i]),
                                   ("splitTransaction", split_results[i])]:
            fired, score, reason = result
            if fired:
                triggered.append({"rule": rule_name, "score": score, "reason": reason})
                composite += score
                rule_counts[rule_name] = rule_counts.get(rule_name, 0) + 1
                metrics_extra[rule_name] = metrics_extra.get(rule_name, 0) + 1

        # Single-row rules
        for rule_fn in single_rules:
            rule_name = rule_fn.__name__.replace("rule_", "")
            try:
                fired, score, reason = rule_fn(r, cfg)
            except Exception:
                continue
            if fired:
                triggered.append({"rule": rule_name, "score": score, "reason": reason})
                composite += score
                rule_counts[rule_name] = rule_counts.get(rule_name, 0) + 1
                metrics_extra[rule_name] = metrics_extra.get(rule_name, 0) + 1

        composite = min(100.0, composite)
        if composite >= 75:
            level = "critical"
        elif composite >= 50:
            level = "high"
        elif composite >= 25:
            level = "medium"
        else:
            level = "low"

        if triggered:
            flagged_count += 1

        items.append({
            "row": r,
            "riskScore": round(composite, 2),
            "riskLevel": level,
            "triggeredRules": triggered,
        })

    metrics = {
        "total": len(items),
        "flagged": flagged_count,
        "ruleCounts": {k: v for k, v in rule_counts.items() if v > 0},
        **{k: v for k, v in metrics_extra.items()},
    }
    return {"items": items, "metrics": metrics, "rules": all_rule_names}
