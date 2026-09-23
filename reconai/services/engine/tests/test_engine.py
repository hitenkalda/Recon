"""Engine correctness tests — normalization, parsing, matching, classification."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import match as M
from engine import normalize as N
from engine import parse as P


def test_normalize_amount():
    assert N.normalize_amount("₹1,23,456.78") == 123456.78
    assert N.normalize_amount("1,23,456.78") == 123456.78
    assert N.normalize_amount("(1,234.50)") == -1234.50
    assert N.normalize_amount("123456") == 123456.0
    assert N.normalize_amount(4500.5) == 4500.5
    assert N.normalize_amount("-") is None
    assert N.normalize_amount(None) is None


def test_normalize_gstin():
    assert N.normalize_gstin("27AAACS1232F1ZU") == "27AAACS1232F1ZU"
    assert N.normalize_gstin("27AAACS1232F1ZU | ACME TRADERS") == "27AAACS1232F1ZU"
    assert N.normalize_gstin("27AAACS1232F1Z5") is None  # bad check digit / entity


def test_normalize_date():
    assert N.normalize_date("31/03/2025") == "2025-03-31"
    assert N.normalize_date("2025-03-31") == "2025-03-31"
    assert N.normalize_date("31-Mar-2025") == "2025-03-31"
    assert N.normalize_date("") is None


def test_detect_column_type():
    assert P.detect_column_type("GSTIN of Supplier", ["27AAACS1232F1ZU"]) == "gstin"
    assert P.detect_column_type("Invoice Date", ["31-03-2025"]) == "date"
    assert P.detect_column_type("Taxable Value", ["1,23,456.00"]) == "amount"
    assert P.detect_column_type("PAN", ["AAACS1232F"]) == "pan"
    assert P.detect_column_type("Client Name", ["Delta Traders"]) == "vendor"


def test_classify_document():
    r = P.classify_document(["Invoice Number", "GSTIN", "Taxable Value", "Date"], [])
    assert r["category"] == "other"  # no strong keyword
    r2 = P.classify_document(["GSTIN", "ITC Available", "Supply Type"], [])
    assert r2["category"] == "gstr_2b"


def test_normalize_rows_mapping():
    headers = ["Supplier GSTIN", "Invoice No", "Invoice Date", "Taxable Value"]
    body = [["27AAACS1232F1ZU", "INV-101", "15-09-2025", "₹12,000.00"]]
    mapping = {"gstin": "Supplier GSTIN", "invoice": "Invoice No", "date": "Invoice Date", "amount": "Taxable Value"}
    rows = P.normalize_rows(headers, body, mapping=mapping)
    d = rows[0]["data"]
    assert d["gstin"] == "27AAACS1232F1ZU"
    assert d["invoice"] == "INV-101"
    assert d["amount"] == 12000.0
    assert d["date"] == "2025-09-15"


def _rows(*items):
    return [{"index": i, "data": dict(d)} for i, d in enumerate(items)]


def test_match_exact_and_unmatched():
    a = _rows({"invoice": "INV-101", "amount": 12000.0, "gstin": "27AAACS1232F1ZU", "date": "2025-09-15"},
              {"invoice": "INV-999", "amount": 500.0, "gstin": "27AAACS1232F1ZU", "date": "2025-09-16"})
    b = _rows({"invoice": "INV-101", "amount": 12000.0, "gstin": "27AAACS1232F1ZU", "date": "2025-09-15"},
              {"invoice": "INV-777", "amount": 5000.0, "gstin": "27AAACS1232F1ZU", "date": "2025-09-18"})
    res = M.match("gst", a, b)
    by_status = {}
    for it in res["items"]:
        by_status.setdefault(it["matchStatus"], []).append(it)
    assert len(by_status.get("exact_invoice", [])) == 1
    assert len(by_status.get("unmatched", [])) == 2
    assert res["metrics"]["matched"] == 1
    assert res["metrics"]["totalA"] == 2 and res["metrics"]["totalB"] == 2


def test_match_gstin_amount():
    # same GSTIN + amount within tolerance → gstin_pan tier
    a = _rows({"invoice": "A1", "amount": 1000.0, "gstin": "27AAACS1232F1ZU"})
    b = _rows({"invoice": "B1", "amount": 1010.0, "gstin": "27AAACS1232F1ZU"})  # ₹10 diff on ₹1000 = 1%
    res = M.match("gst", a, b)
    assert any(it["matchStatus"] == "gstin_pan" for it in res["items"])


def test_match_bank_amount_date_tolerance():
    a = _rows({"amount": 25000.0, "date": "2025-03-01", "ref": "UTR123"})
    b = _rows({"amount": 24995.0, "date": "2025-03-02", "ref": "UTR999"})
    res = M.match("bank", a, b)
    assert any(it["matchStatus"] in ("exact_invoice", "date_tolerance") for it in res["items"])


# ── OCR: scanned images + image-only PDFs ───────────────────────────────────

def test_read_rows_ocr_png_round_trip():
    pytest.importorskip("rapidocr_onnxruntime")  # OCR is an optional dependency
    import fitz  # PyMuPDF renders the fixture

    doc = fitz.open()
    page = doc.new_page(width=720, height=200)
    page.insert_text((50, 55), "Date", fontname="helv", fontsize=16)
    page.insert_text((230, 55), "Description", fontname="helv", fontsize=16)
    page.insert_text((510, 55), "Amount", fontname="helv", fontsize=16)
    for i, (d, desc, amt) in enumerate([
        ("01-04-2025", "ACME CONTRACTOR", "15000"),
        ("05-04-2025", "DELTA TRADERS", "5000"),
    ]):
        y = 95 + i * 40
        page.insert_text((50, y), d, fontname="helv", fontsize=14)
        page.insert_text((230, y), desc, fontname="helv", fontsize=14)
        page.insert_text((510, y), amt, fontname="helv", fontsize=14)
    png = page.get_pixmap(dpi=220).tobytes("png")
    doc.close()

    headers, rows, pages = P.read_rows(png, "scanned.png")
    assert pages == 1
    assert headers == ["Date", "Description", "Amount"]
    assert len(rows) == 2
    assert P.ocr_applied is True  # /v1/process reads this to flag OCR-built records


def test_read_rows_ocr_prefers_text_layer_pdf():
    # A text-layer PDF must NOT flip the OCR flag (fast path preserved).
    import fitz
    doc = fitz.open()
    page = doc.new_page(width=400, height=200)
    page.insert_text((50, 50), "INV-101  12,000  15-09-2025", fontname="helv", fontsize=14)
    pdf = doc.tobytes()
    doc.close()

    headers, rows, _ = P.read_rows(pdf, "text.pdf")
    assert len(rows) >= 1
    assert P.ocr_applied is False