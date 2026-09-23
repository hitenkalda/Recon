"""File parsing, column-type detection, mapping suggestion and document classification.

All parsing is deterministic. The engine classifies a document and suggests a
column → logical-field mapping so the API can persist normalized records.
"""
from __future__ import annotations

import io
import re
from typing import Any, Dict, List, Optional, Tuple

from .normalize import (
    normalize_amount,
    normalize_date,
    normalize_gstin,
    normalize_invoice,
    normalize_pan,
    normalize_tan,
    normalize_text,
    normalize_vendor,
)

# ── file reading ────────────────────────────────────────────────────────────

_PDF_TEXT_TABLE_SEP = re.compile(r"\s{2,}|\t")
_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp")

# Set for every document that actually went through an OCR pass in read_rows;
# /v1/process reads it to note "OCR applied" on the response. Reflects only the
# most recent read_rows call (it resets there), so a later text file isn't
# mislabelled.
ocr_applied: bool = False

_OCR_ENGINE = None  # lazy RapidOCR singleton


def _get_ocr():
    """Lazily import + construct the RapidOCR engine (PP-OCRv4, ONNX, CPU)."""
    global _OCR_ENGINE
    if _OCR_ENGINE is None:
        from rapidocr_onnxruntime import RapidOCR  # noqa: PLC0415 — heavy import
        _OCR_ENGINE = RapidOCR()
    return _OCR_ENGINE


def _ocr_image(raw: bytes) -> List[str]:
    """OCR a raster image (PNG/JPEG/…) → text lines, top→bottom.

    Detection boxes are grouped into lines by y-centre (tolerant of small
    vertical jitter), then sorted left→right inside each line and joined with
    2+ spaces so the caller's table splitter recovers columns the same way it
    does from a text-layer PDF.
    """
    import numpy as np
    try:
        import cv2
        arr = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        arr = None
    if arr is None:
        raise ValueError("Could not decode image for OCR")

    result, _elapse = _get_ocr()(arr)
    boxes: List[Dict[str, Any]] = []
    if result:
        for item in result:
            if not isinstance(item, (list, tuple)):
                continue
            text, pts = "", None
            for candidate in item:
                if isinstance(candidate, str):
                    text = candidate
                elif (isinstance(candidate, (list, tuple)) and len(candidate) == 4
                      and candidate and len(candidate[0]) == 2):
                    pts = candidate
            if not text or pts is None:
                continue
            xs = [float(p[0]) for p in pts]
            ys = [float(p[1]) for p in pts]
            boxes.append({
                "x": min(xs), "y": sum(ys) / len(ys), "h": max(ys) - min(ys),
                "text": str(text).strip(),
            })
    boxes = [b for b in boxes if b["text"]]
    if not boxes:
        return []
    boxes.sort(key=lambda b: (b["y"], b["x"]))

    lines: List[List[Dict[str, Any]]] = []
    for b in boxes:
        for line in lines:
            ref = line[0]
            tol = max(8.0, ref["h"] * 0.6)
            if abs(b["y"] - ref["y"]) <= tol:
                line.append(b)
                break
        else:
            lines.append([b])

    out: List[str] = []
    for line in lines:
        line.sort(key=lambda b: b["x"])
        out.append("  ".join(b["text"] for b in line))
    return out


def _read_image(raw: bytes, filename: str) -> Tuple[Optional[List[str]], List[List[str]], int]:
    """OCR a standalone scanned image → (headers, rows, 1). Mirrors _read_pdf's
    structure: split OCR lines by the table separator, treat a first row with
    ≥2 letter-cells as the header, else synthesize Column1..N."""
    global ocr_applied
    ocr_applied = True
    all_rows: List[List[str]] = []
    for line in _ocr_image(raw):
        cells = [c.strip() for c in _PDF_TEXT_TABLE_SEP.split(line) if c.strip()]
        if cells:
            all_rows.append(cells)
    if not all_rows:
        return None, [], 1
    headers = None
    if len(all_rows) >= 2:
        first = all_rows[0]
        if sum(1 for c in first if re.search(r"[A-Za-z]", c)) >= 2:
            headers = [c or f"Column{i + 1}" for i, c in enumerate(first)]
            all_rows = all_rows[1:]
    if headers is None:
        width = max(len(r) for r in all_rows)
        headers = [f"Column{i + 1}" for i in range(width)]
    return headers, all_rows, 1


def _read_excel(raw: bytes, filename: str) -> Tuple[Optional[List[str]], List[List[Any]], int]:
    """Return (headers, rows, sheet_count) from an xlsx/xls workbook."""
    import pandas as pd

    data = io.BytesIO(raw)
    sheets = pd.read_excel(data, sheet_name=None, header=None, dtype=object)
    pages = len(sheets)

    # use the first non-empty sheet for extraction (MVP)
    frame = None
    for sheet_df in sheets.values():
        if sheet_df is not None and len(sheet_df) > 0:
            frame = sheet_df
            break
    if frame is None:
        return None, [], pages or 1

    raw_arr = frame.fillna("").to_numpy()
    if len(raw_arr) == 0:
        return None, [], pages or 1

    header_row = _find_header_row(raw_arr)
    if header_row is None:
        # no plausible header — synthesize column names C0..Cn
        width = raw_arr.shape[1]
        headers = [f"Column{i + 1}" for i in range(width)]
        body = [_clean_row(row) for row in raw_arr]
        return headers, body, pages or 1

    headers = [_clean_cell(raw_arr[header_row][i]) for i in range(raw_arr.shape[1])]
    headers = [h or f"Column{i + 1}" for i, h in enumerate(headers)]
    body = [_clean_row(raw_arr[r]) for r in range(header_row + 1, len(raw_arr))]
    return headers, body, pages or 1


def _find_header_row(arr: Any) -> Optional[int]:
    """Pick the row that looks most like a header (mix of text labels)."""
    best, best_score = None, -1
    for i in range(min(len(arr), 10)):
        cells = [str(x).strip() for x in arr[i]]
        non_empty = [c for c in cells if c]
        if not non_empty:
            continue
        score = sum(1 for c in non_empty if re.search(r"[A-Za-z]", c))
        # headers rarely start with a parseable amount/date
        if non_empty and re.search(r"^[\-₹(]?\d{1,3}(,\d{3})*\.?\d*$", non_empty[0]):
            score -= 4
        if score > best_score:
            best, best_score = i, score
    return best if best_score >= 0 else None


def _clean_cell(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer() and abs(v) < 1e15:
        return str(int(v))
    s = str(v).strip()
    return s


def _clean_row(row: Any) -> List[str]:
    return [_clean_cell(x) for x in row]


def _read_csv(raw: bytes, filename: str) -> Tuple[List[str], List[List[str]], int]:
    import csv

    text = raw.decode("utf-8-sig", errors="replace")
    if "," not in text[:2000] and "\t" in text[:2000]:
        dialect = csv.excel_tab
    else:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect=dialect)
    rows = [r for r in reader if any(cell.strip() for cell in r)]
    if not rows:
        return [], [], 1
    header_end = rows[0]
    # skip a possible title/spacer line(s) where first row has a single long cell
    if len(header_end) == 1 and len(rows) > 1:
        header_end = rows[1]
        rows = rows[1:]
    headers = [h.strip() or f"Column{i + 1}" for i, h in enumerate(header_end)]
    body = rows[1:]
    return headers, body, 1


def _read_pdf(raw: bytes, filename: str) -> Tuple[Optional[List[str]], List[List[str]], int]:
    """Extract tabular rows from a PDF via PyMuPDF table finder, else text lines.

    When neither produces rows (scanned / image-only PDF with no text layer),
    rasterize each page and OCR it — the fast path for text PDFs is untouched.
    """
    global ocr_applied
    import fitz  # PyMuPDF

    doc = fitz.open(stream=raw, filetype="pdf")
    pages = doc.page_count
    all_rows: List[List[str]] = []
    for page in doc:
        try:
            tabs = page.find_tables()
            for t in tabs.tables:
                for row in t.extract():
                    all_rows.append([_clean_cell(c) for c in row])
        except Exception:
            pass
    if not all_rows:
        for page in doc:
            for line in page.get_text("text").splitlines():
                cells = [c.strip() for c in _PDF_TEXT_TABLE_SEP.split(line) if c.strip()]
                if cells:
                    all_rows.append(cells)
    who_ocr = False
    if not all_rows:
        # Image-only / scanned PDF: rasterize pages and OCR them.
        for page in doc:
            try:
                pix = page.get_pixmap(dpi=200)
                png = pix.tobytes("png")
            except Exception:
                continue
            for line in _ocr_image(png):
                cells = [c.strip() for c in _PDF_TEXT_TABLE_SEP.split(line) if c.strip()]
                if cells:
                    all_rows.append(cells)
        if all_rows:
            who_ocr = True
    doc.close()
    if not all_rows:
        return None, [], pages
    if who_ocr:
        ocr_applied = True
    headers = None
    if len(all_rows) >= 2:
        # assume first row is a header if it contains letters and the body does too
        first = all_rows[0]
        if sum(1 for c in first if re.search(r"[A-Za-z]", c)) >= 2:
            headers = [c or f"Column{i + 1}" for i, c in enumerate(first)]
            all_rows = all_rows[1:]
    if headers is None:
        width = max(len(r) for r in all_rows)
        headers = [f"Column{i + 1}" for i in range(width)]
    return headers, all_rows, pages


def read_rows(raw: bytes, filename: str) -> Tuple[Optional[List[str]], List[List[str]], int]:
    global ocr_applied
    ocr_applied = False  # per-document flag consumed by /v1/process
    lower = filename.lower()
    if lower.endswith((".xlsx", ".xlsm", ".xls")):
        return _read_excel(raw, lower)
    if lower.endswith(".csv"):
        return _read_csv(raw, lower)
    if lower.endswith(".pdf"):
        return _read_pdf(raw, lower)
    if lower.endswith(_IMAGE_EXTS):
        return _read_image(raw, lower)
    if lower.endswith((".txt", ".log", ".out")):
        try:
            dec = raw.decode("utf-8-sig", errors="ignore")
            if "^" in dec[:20000] and ("PART" in dec[:20000].upper() or "TAN OF DEDUCTOR" in dec[:20000].upper()):
                return _read_traces_txt(raw)
        except Exception:
            pass
    # sniff
    if raw[:2] == b"PK":
        return _read_excel(raw, lower + ".xlsx")
    if raw[:4] in (b"%PDF", b"\x25\x50\x44\x46"):
        return _read_pdf(raw, lower + ".pdf")
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return _read_image(raw, lower + ".png")
    if raw[:2] == b"\xff\xd8":
        return _read_image(raw, lower + ".jpg")
    try:
        dec = raw.decode("utf-8-sig", errors="strict")
        if "," in dec[:2000] or "\t" in dec[:2000]:
            return _read_csv(raw, lower + ".csv")
    except UnicodeDecodeError:
        pass
    raise ValueError(f"Unsupported file type: {filename}")


def _read_traces_txt(raw: bytes) -> Tuple[List[str], List[List[str]], int]:
    """Parse a TRACES 26AS credit-lines .txt ('^'-delimited, PART-I/II/III blocks).

    Produces rows under canonical headers so the mapping suggestion recovers
    name/TAN/gross/TDS/section/quarter. Section is derived from the PART block
    (I → TDS, II → TCS, III → Advance Tax); quarter comes from file header lines.
    """
    text = raw.decode("utf-8-sig", errors="replace")
    lines = text.splitlines()

    # Synthetic headers that _HEADER_HINTS maps to the right canonical roles.
    SYN_HEADERS = ["Deductor Name", "TAN of Deductor", "Gross Amount", "TDS Amount", "Section", "Quarter"]

    part_ctx = ""
    quarter = "Q4"
    idx = {"name": -1, "tan": -1, "gross": -1, "tds": -1, "sr": -1}
    seen_headers = False
    rows_out: List[List[str]] = []

    for line in lines:
        l = line.strip()
        if not l:
            continue
        qm = re.search(r"\bQ([1-4])\b", l)
        if qm:
            quarter = "Q" + qm.group(1)
        if l.startswith("^") and re.search(r"PART[\s\-]*(I|II|III|IV|A|B|C)", l, re.I):
            part_ctx = l
            seen_headers = False  # each PART block restarts its own table
            continue
        if "^" not in l:
            continue

        cols = [c.replace("\t", "").strip() for c in l.split("^")]
        if len(cols) < 4:
            continue

        joined = " ".join(cols).lower()
        if not seen_headers and (
            ("name of deductor" in joined or "name of deductee" in joined)
            and ("amount" in joined or "tds" in joined or "tan" in joined)
        ):
            # Locate column indices from the actual header line.
            def find(tokens):
                for i, c in enumerate(cols):
                    cl = c.lower()
                    if any(tk in cl for tk in tokens):
                        return i
                return -1
            idx = {
                "name": find(["name of deductor", "name of deductee", "name"]),
                "tan": find(["tan of deductor", "tan of deductee", "tan"]),
                "gross": find(["total amount paid", "amount paid", "amount credited", "amount"]),
                "tds": find(["total tax deducted", "tax deducted", "tds deducted", "tds"]),
                "sr": find(["sr. no", "sr no", "s.no", "sno"]),
            }
            seen_headers = True
            continue
        if not seen_headers:
            continue

        # Data-row sanity: Sr No must be numeric when the column exists.
        if idx["sr"] >= 0:
            sr = cols[idx["sr"]] if idx["sr"] < len(cols) else ""
            if not sr or not sr.replace(",", "").isdigit():
                continue
        name = cols[idx["name"]] if 0 <= idx["name"] < len(cols) else ""
        if not name or "total" in name.lower() or "grand total" in joined:
            continue

        def cell(i: int) -> str:
            return cols[i] if 0 <= i < len(cols) else ""

        section = "TDS (Part-I)"
        if re.search(r"PART[\s\-]*II\b", part_ctx, re.I):
            section = "TCS (Part-II)"
        elif re.search(r"PART[\s\-]*III\b", part_ctx, re.I):
            section = "Advance Tax (Part-III)"
        elif re.search(r"PART[\s\-]*IV\b", part_ctx, re.I):
            section = "Other (Part-IV)"

        rows_out.append([
            name,
            cell(idx["tan"]),
            cell(idx["gross"]),
            cell(idx["tds"]),
            section,
            quarter,
        ])

    if not rows_out:
        return None, [], 1
    return SYN_HEADERS, rows_out, 1

# ── column type detection ───────────────────────────────────────────────────

_HEADER_HINTS: List[Tuple[str, str, List[str]]] = [
    ("gstin", "gstin", ["gstin", "gst"]),
    ("pan", "pan", ["pan"]),
    ("date", "date", ["date", "dt", "dated"]),
    ("invoice", "invoice", ["invoice", "inv no", "#", "number", "no."]),
    # TAX roles — kept ahead of amount/vendor so a "TDS Amount" / "Gross Amount"
    # header maps to gross/tds, not the generic amount. The phrase-specific name
    # keys leave bare "Supplier Name" to the vendor role (GST/bank unchanged).
    ("name", "name", ["name of deductor", "name of deductee", "assessee", "deductor name", "party name"]),
    ("tan", "tan", ["tan of deductor", "tan of deductee", "tan no", "tan number", "tan"]),
    ("gross", "gross", ["total amount paid", "amount paid", "amount credited", "gross amount", "gross", "information value"]),
    ("tds", "tds", ["total tax deducted", "tax deducted", "tds deducted", "tds amount", "total tds", "tds"]),
    ("section", "section", ["section", "nature of payment"]),
    ("quarter", "quarter", ["quarter", "qtr"]),
    ("fy", "fy", ["financial year", "assessment year", "fy"]),
    ("amount", "amount", ["amount", "taxable", "value", "total", "amt", "igst", "cgst", "sgst", "cess"]),
    ("vendor", "vendor", ["supplier", "vendor", "party", "counterparty", "trade", "trader", "gstin of", "name"]),
    ("description", "description", ["description", "narration", "particular", "details", "remarks", "notes", "purpose"]),
    ("ref", "ref", ["reference", "cheque", "utr", "transaction id", "txn", "batch", "voucher", "chq"]),
]

def _amount_looks_like(v: str) -> bool:
    return re.match(r"^\s*[-₹(]?\d{1,3}(,\d{3})*\.?\d{0,2}\s*[)]?$", v) is not None


def _invoice_looks_like(v: str) -> bool:
    s = v.strip().upper()
    return bool(re.match(r"^[A-Z0-9\-\/ ]{3,}$", s)) and bool(re.search(r"[0-9]", s))


_VALUE_RULES: List[Tuple[str, object]] = [  # (type, matcher)
    ("gstin", normalize_gstin),
    ("pan", normalize_pan),
    ("date", normalize_date),
    ("amount", _amount_looks_like),
    ("invoice", _invoice_looks_like),
]


def detect_column_type(name: str, values: List[str]) -> str:
    """Infer a column's logical type from its header hints and a value sample."""
    name_l = name.lower().strip()
    for hint_type, key, keys in _HEADER_HINTS:
        if any(k in name_l for k in keys):
            score = sum(1 for k in keys if k in name_l)
            if score > 0:
                return hint_type
    sample = [v for v in values if v and v not in {"-", "—", "0"}][:60]
    if not sample:
        return "text"
    tally: Dict[str, int] = {}
    for cell in sample:
        for col_type, fn in _VALUE_RULES:
            try:
                if fn(cell):
                    tally[col_type] = tally.get(col_type, 0) + 1
                    break
            except Exception:
                continue
        else:
            tally["text"] = tally.get("text", 0) + 1
    if not tally:
        return "text"
    picked = max(tally, key=lambda k: (tally[k], -(["text"].index(k) if k == "text" else 99)))
    return picked


def build_mapping_suggestion(headers: List[str]) -> Dict[str, str]:
    """Suggest logical-key → header-name mapping from detected types."""
    suggestion: Dict[str, str] = {}
    for header in headers:
        t = detect_column_type(header, [])
        if t in suggestion.values() or t in {"text"}:
            continue
        if t not in suggestion:
            suggestion[t] = header
    return suggestion


_LOGICAL_TO_ROLE = {
    "date": "date",
    "invoice": "invoice",
    "gstin": "gstin",
    "pan": "pan",
    "amount": "amount",
    "vendor": "vendor",
    "description": "description",
    "ref": "ref",
    # 26AS/AIS tax roles
    "name": "name",
    "tan": "tan",
    "gross": "gross",
    "tds": "tds",
    "section": "section",
    "quarter": "quarter",
    "fy": "fy",
}

# Canonical keys that normalize_rows stores back into each row's data dict.
_CANONICAL_STORE = {
    "amount", "gross", "tds", "gstin", "pan", "tan",
    "invoice", "vendor", "name", "date", "section", "quarter", "fy",
}

# Fallback role → header token scan when the mapping suggestion missed a tax
# column (e.g. a pre-populated mapping that only carried amount/pan/vendor).
_TAX_ROLE_TOKENS: List[Tuple[str, List[str]]] = [
    ("name", ["name of deductor", "name of deductee", "deductor name", "party name"]),
    ("tan", ["tan of deductor", "tan of deductee", "tan no", "tan"]),
    ("gross", ["total amount paid", "amount paid", "amount credited", "gross amount", "gross"]),
    ("tds", ["total tax deducted", "tax deducted", "tds deducted", "tds amount", "total tds", "tds"]),
    ("section", ["section", "nature of payment"]),
    ("quarter", ["quarter", "qtr"]),
    ("fy", ["financial year", "assessment year", "fy"]),
]

# ── document classification ─────────────────────────────────────────────────

_CATEGORY_KEYWORDS: List[Tuple[str, List[str]]] = [
    ("trial_balance", ["trial balance", "trial-balance", "opening balance", "closing balance", "particulars", "debit balance", "credit balance", "ledger name", "account name"]),
    ("ais_26as", ["ais", "annual information statement", "26as", "26 as", "tds credit", "form 26as"]),
    ("tds_receivable", ["tds receivable", "tax deducted at source", "tcs receivable", "tan no", "tan number", "amount of tds"]),
    ("gstr_2b", ["gstr-2b", "gstr 2b", "itc", "inward supply", "2b"]),
    ("gstr_1", ["gstr-1", "gstr 1", "outward supply", "b2b", "sales register"]),
    ("gstr_3b", ["gstr-3b", "gstr 3b", "monthly return"]),
    ("bank_statement", ["bank statement", "account statement", "transaction", "credit", "debit", "balance", "branch"]),
    ("purchase_invoice", ["purchase register", "supplier invoice", "vendor invoice", "purchase ledger", "purchase book"]),
    ("sales_invoice", ["sales register", "sales ledger", "sales book", "customer invoice"]),
    ("expense_voucher", ["expense", "voucher", "reimbursement", "petty cash"]),
]


def classify_document(headers: List[str], rows: List[List[str]], category_hint: Optional[str] = None) -> Dict[str, Any]:
    """Return {category, confidence, reason}. A hint wins unless evidence contradicts."""
    if category_hint:
        return {"category": category_hint, "confidence": 0.9, "reason": "user-specified category"}

    text = " ".join(headers).lower() + " " + " ".join(" ".join(r[:8]) for r in rows[:25]).lower()
    best, best_score = "other", 0
    for cat, keys in _CATEGORY_KEYWORDS:
        score = sum(text.count(k) for k in keys)
        if score > best_score:
            best, best_score = cat, score
    confidence = 0.85 if best_score > 0 else 0.4
    reason = f"matched {best_score} keyword hits against {best!r}" if best_score else "no strong signal"
    return {"category": best, "confidence": confidence, "reason": reason}

# ── row normalization ───────────────────────────────────────────────────────

def normalize_rows(
    headers: List[str],
    body: List[List[str]],
    mapping: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """Turn raw rows into {rowIndex, data, confidence, status, warnings} records.

    The detected mapping is resolved to concrete header indexes, each logical
    field is normalized, and the canonical keys (amount, date, invoice, gstin,
    pan, vendor, description, ref) are written into data so the reconcile step
    and the API consumer can rely on them.
    """
    resolved = mapping or build_mapping_suggestion(headers)
    index_of = {name: i for i, name in enumerate(headers) if name}
    roles = {field: name for field, name in resolved.items() if name in index_of}

    out: List[Dict[str, Any]] = []
    for r, row in enumerate(body):
        data: Dict[str, Any] = {}
        warnings: List[str] = []
        status = "valid"
        for i, cell in enumerate(row):
            if i < len(headers):
                data[headers[i]] = cell if cell != "" else None

        for logical in ("amount", "date", "invoice", "gstin", "pan", "vendor", "description", "ref",
                        "gross", "tds", "tan", "section", "quarter", "name", "fy"):
            col = roles.get(logical)
            if not col:
                continue
            raw_val = data.get(col)
            norm = _normalize_field(logical, raw_val)
            if logical in _CANONICAL_STORE:
                data[logical] = norm
            elif norm is not None:
                data[logical] = norm

        # Safety net: a mapping that ignored a tax column still leaves the
        # canonical gross/tds/tan/section/quarter/name in the row.
        for role, tokens in _TAX_ROLE_TOKENS:
            if role in data and data.get(role) is not None:
                continue
            col = _find_column_for_tokens(headers, tokens)
            if col and col in data:
                data[role] = _normalize_field(role, data.get(col))

        # classification warnings: amount present but non-numeric, etc.
        if "amount" in data and data["amount"] is None:
            status = "warning"
            warnings.append("Could not parse amount for this row")
        out.append({
            "rowIndex": r,
            "data": data,
            "confidence": 1.0 if status == "valid" else 0.8,
            "status": status,
            "warnings": warnings,
        })
    return out


def _find_column_for_tokens(headers: List[str], tokens: List[str]) -> Optional[str]:
    """First header whose lowercased name contains one of the token phrases."""
    for header in headers:
        hl = header.lower()
        if any(tk in hl for tk in tokens):
            return header
    return None


def _normalize_field(logical: str, raw_val: Any) -> Any:
    if raw_val is None:
        return None
    if logical in {"amount", "gross", "tds"}:
        return normalize_amount(raw_val)
    if logical == "date":
        return normalize_date(raw_val)
    if logical == "invoice":
        return normalize_invoice(raw_val)
    if logical == "gstin":
        return normalize_gstin(raw_val)
    if logical == "pan":
        return normalize_pan(raw_val)
    if logical == "tan":
        return normalize_tan(raw_val)
    if logical in {"vendor", "name", "description", "ref"}:
        return normalize_vendor(raw_val)
    if logical in {"section", "quarter", "fy"}:
        return normalize_text(raw_val).upper() if normalize_text(raw_val) else None
    return normalize_text(raw_val)