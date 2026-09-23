"""Indian-format field normalization used by both /v1/process and /v1/reconcile.

The engine is the ONLY component that computes authoritative financial values,
so all parsing, cleaning and numeric conversion lives here (deterministic — no AI).
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Optional

from dateutil import parser as dateutil_parser
from rapidfuzz.distance import Levenshtein

# ── scalar normalizers ──────────────────────────────────────────────────────

_AMOUNT_RE = re.compile(r"[^\d.\-()\s]+")
_LEDGER_NEG_RE = re.compile(r"\(([\d.,]+)\)")


def normalize_amount(value: object) -> Optional[float]:
    """Parse a rupee amount → float. Handles '₹1,23,456.78', '(1,234)', '─', ledger signs."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    text = str(value).strip()
    if not text or text in {"-", "—", "–", "N/A", "NA", ""}:
        return None
    neg = False
    # Indian GAAP ledger convention: (1,234.56) is negative
    m = _LEDGER_NEG_RE.search(text)
    if m:
        text = text.replace("(", "").replace(")", "")
        neg = True
    # drop trailing CR/DR indicators
    if re.search(r"\b(DR|Cr|Dr)\.?$", text):
        neg = True
    text = _AMOUNT_RE.sub("", text)
    if text.startswith("-"):
        neg = True
        text = text[1:]
    if not text or text == ".":
        return None
    try:
        val = float(text)
    except ValueError:
        return None
    return -val if neg else val


def amount_to_int_paise(value: object) -> Optional[int]:
    """Convert an amount to integer paise (used for variance calc in the API flow)."""
    amt = normalize_amount(value)
    if amt is None:
        return None
    return int(round(amt * 100))


_DATE_PATTERNS = (
    re.compile(r"^\d{2}-\d{2}-\d{4}$"),
    re.compile(r"^\d{2}/\d{2}/\d{4}$"),
    re.compile(r"^\d{4}-\d{2}-\d{2}$"),
    re.compile(r"^\d{2}\.\d{2}\.\d{4}$"),
    re.compile(r"^\d{2}-\d{2}-\d{2,4}$"),
)


def normalize_date(value: object) -> Optional[str]:
    """Parse a date to ISO 'YYYY-MM-DD'. Accepts dd/mm/yyyy, yyyy-mm-dd, '31-Mar-2025', excel datetimes."""
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()[:10]
    if isinstance(value, (int, float)) and value > 20000:  # Excel serial date
        try:
            ex = datetime(1899, 12, 30) + timedelta(days=float(value))
            return ex.date().isoformat()
        except Exception:
            return None
    text = str(value).strip('" \' ')
    if not text:
        return None
    try:
        dt = dateutil_parser.parse(text, dayfirst=True, fuzzy=False)
        return dt.date().isoformat()
    except (ValueError, OverflowError):
        return None


# GSTIN = 2-digit state + 10-char PAN + 1 entity (1-9,A-Z) + 'Z' + 1 check digit (15 total).
_GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
_PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
# TAN = 4 alpha + 5 digits + 1 alpha (e.g. 'CALM00123A') — unlike PAN it is 4+5+1.
_TAN_RE = re.compile(r"^[A-Z]{4}[0-9]{5}[A-Z]$")

_GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _gstin_check_digit(gstin: str) -> str:
    """Mod-36 Luhn-like check digit used by GSTN (mirrors shared/lib/indian.ts)."""
    total = 0
    for i in range(14):
        idx = _GSTIN_CHARS.index(gstin[i])
        factor = 1 if i % 2 == 0 else 2
        total += (idx * factor) // 36 + (idx * factor) % 36
    return _GSTIN_CHARS[(36 - (total % 36)) % 36]


def normalize_gstin(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip().upper().replace(" ", "")
    # trim a trailing legal-name fragment: '27AAACS1232F1ZU | ACME' or '27AAACS1232F1ZU, ACME'
    text = re.split(r"[|,;]", text)[0].strip()
    if not _GSTIN_RE.match(text):
        return None
    return text if _gstin_check_digit(text) == text[14] else None


def normalize_pan(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip().upper().replace(" ", "")
    return text if _PAN_RE.match(text) else None


def normalize_tan(value: object) -> Optional[str]:
    """Normalize a TAN (deductor account number) — 4 alpha + 5 digits + 1 alpha."""
    if value is None:
        return None
    text = str(value).strip().upper().replace(" ", "")
    return text if _TAN_RE.match(text) else None


def normalize_invoice(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip().upper()
    if not text or text in {"N/A", "NA", "-", "--", "—"}:
        return None
    return re.sub(r"\s+", "", text)


def normalize_vendor(value: object) -> Optional[str]:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value).strip())
    if not text or text in {"N/A", "NA", "-"}:
        return None
    return text


def normalize_text(value: object) -> Optional[str]:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value).strip())
    return text or None


# ── similarity / tolerance helpers ─────────────────────────────────────────

def levenshtein(a: str, b: str, max_dist: Optional[int] = None) -> int:
    """Levenshtein distance via RapidFuzz (C-optimized).

    With *max_dist* the distance is bounded: if the true distance exceeds
    *max_dist*, returns ``max_dist + 1`` without computing the full matrix.
    For strings longer than 100 characters falls back to prefix closeness
    to avoid O(n*m) DP on very long text.
    """
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if la > 100 or lb > 100:  # fall back to prefix closeness for very long text
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
    d = Levenshtein.distance(a, b, score_cutoff=max_dist)
    if max_dist is not None and d > max_dist:
        return max_dist + 1
    return d


def similarity(a: str, b: str, max_dist: Optional[int] = None) -> float:
    """Normalized similarity in [0,1] (1.0 = identical).
    When *max_dist* is given, returns 0.0 immediately if the distance
    would exceed it — callers should pre-compute *max_dist* from their
    threshold so that non-matching pairs never pay the full DP cost.
    """
    if not a or not b:
        return 0.0
    d = levenshtein(a, b, max_dist)
    if max_dist is not None and d > max_dist:
        return 0.0
    return 1.0 - (d / max(len(a), len(b)))


def date_diff_days(d1: str, d2: str) -> Optional[int]:
    """|difference| in days between two ISO date strings."""
    try:
        a = date.fromisoformat(d1)
        b = date.fromisoformat(d2)
    except (ValueError, TypeError):
        return None
    return abs((a - b).days)


def amounts_close(a: Optional[float], b: Optional[float], tol_abs: float, tol_pct: float) -> bool:
    if a is None or b is None:
        return False
    diff = abs(a - b)
    if diff <= tol_abs:
        return True
    return diff <= (max(abs(a), abs(b)) * tol_pct / 100.0)