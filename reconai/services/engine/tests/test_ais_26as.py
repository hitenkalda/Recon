"""Deterministic tests for the 26AS/AIS reconciliation engine module.

Covers: TRACES parse, row normalisation (canonical keys), matching sequence
(PAN → TAN → section → FY/quarter → gross → TDS), classification into
amount-difference / income-mismatch / section-mismatch / duplicate, the
metrics.tax payload, and the 8-sheet export workbook.
"""
import pytest
from engine import match as match_mod
from engine import parse as parse_mod
from engine import tax_workbook as tw


# ── helpers ─────────────────────────────────────────────────────────────────

def rows(*dicts):
    """ReconRow-style fixtures: [{index, data}] keyed by canonical engine keys."""
    return [{"index": i, "data": d} for i, d in enumerate(dicts)]


def make_26as(**kw):
    """A canonical 26AS-side row (side A): keys as normalize_rows stores them."""
    base = {
        "name": "Acme Corp",
        "pan": "AAACA1234B",
        "tan": "CALM00123A",
        "section": "194J",
        "quarter": "Q1",
        "fy": "2025-26",
        "gross": 100000,
        "tds": 1000,
    }
    base.update(kw)
    return base


def make_books(**kw):
    """A canonical books-side row (side B)."""
    base = {
        "name": "Acme Corp",
        "pan": "AAACA1234B",
        "tan": "CALM00123A",
        "section": "194J",
        "quarter": "Q1",
        "fy": "2025-26",
        "gross": 100000,
        "tds": 1000,
    }
    base.update(kw)
    return base


def tax_metrics(result):
    tax = result.get("metrics", {}).get("tax")
    assert tax is not None, "metrics.tax must be present"
    return tax


# ── parse: TRACES .txt ──────────────────────────────────────────────────────

def test_read_traces_txt_parses_credit_lines():
    raw = (
        "^PART-I - Details of Tax Deducted at Source\n"
        "^Q1 FY 2025-26\n"
        "^Sr No^Name of Deductor^TAN of Deductor^Total Amount Paid^Total Tax Deducted^\n"
        "^1^Acme Corp^CALM00123A^1,00,000^10,000^\n"
        "^2^Bharat Constructions^DELH00789P^2,50,000^15,750^\n"
    ).encode("utf-8")
    headers, body, pages = parse_mod.read_rows(raw, "26as_traces.txt")
    assert headers is not None
    assert len(body) == 2
    assert len(headers) == len(body[0])

    norm = parse_mod.normalize_rows(headers, body)
    assert len(norm) == 2
    r0 = norm[0]["data"]
    assert r0.get("name") == "Acme Corp"
    assert r0.get("tan") == "CALM00123A"
    assert r0.get("tds") == pytest.approx(10000.0)
    assert r0.get("gross") == pytest.approx(100000.0)
    assert r0.get("quarter") == "Q1"


def test_read_traces_txt_section_from_part_block():
    raw = (
        "^PART-II - Details of Tax Collected at Source\n"
        "^Q2\n"
        "^Sr No^Name of Deductee^TAN of Deductee^Total Amount Paid^Tax Collected^\n"
        "^1^Zenith Inc^MUMB00444K^50,000^500^\n"
    ).encode("utf-8")
    headers, body, pages = parse_mod.read_rows(raw, "tc s_traces.txt")
    norm = parse_mod.normalize_rows(headers, body)
    assert "TCS" in (norm[0]["data"].get("section") or "")


# ── parse: normalization surfaces canonical tax keys ───────────────────────

def test_normalize_rows_canonical_keys():
    headers = ["Deductor Name", "TAN of Deductor", "Gross Amount", "TDS Amount", "Section", "Quarter"]
    body = [["Acme Corp", "CALM00123A", "1,00,000", "1,000", "194J", "Q1"]]
    norm = parse_mod.normalize_rows(headers, body)
    data = norm[0]["data"]
    assert data["name"] == "Acme Corp"
    assert data["tan"] == "CALM00123A"
    assert data["gross"] == pytest.approx(100000.0)
    assert data["tds"] == pytest.approx(1000.0)
    assert data["section"] == "194J"
    assert data["quarter"] == "Q1"


# ── quarter / FY derivation from dates ──────────────────────────────────────

def test_quarter_and_fy_from_date():
    assert match_mod._quarter_from_date("2025-06-15") == "Q1"
    assert match_mod._quarter_from_date("2025-10-02") == "Q3"
    assert match_mod._fy_from_date("2025-06-15") == "2025-26"
    assert match_mod._fy_from_date("2025-01-31") == "2024-25"


# ── matching: exact match ───────────────────────────────────────────────────

def test_exact_pais_match():
    a = rows(make_26as())
    b = rows(make_books())
    result = match_mod.match("ais_26as", a, b, params={})
    m = [i for i in result["items"] if i["matchStatus"] == "gstin_pan"]
    assert len(m) == 1, f"Expected one gstin_pan pair, got {len(m)}"
    assert m[0]["score"] == 1.0  # PAN/TAN + name + section + quarter + gross + TDS


def test_pan_only_match():
    """Same PAN, different TAN → still matches via PAN priority."""
    a = rows(make_26as(**{"tan": "DELH00999Z"}))
    b = rows(make_books(**{"tan": "MUMB00888Y"}))
    result = match_mod.match("ais_26as", a, b, params={})
    m = [i for i in result["items"] if i["matchStatus"] != "unmatched"]
    assert len(m) == 1, f"Expected one matched pair (PAN), got {len(m)}"
    assert m[0]["score"] >= 0.95


def test_tan_only_match():
    """No PAN equality, but TAN equality carries the key when PAN is absent."""
    a = rows(make_26as(**{"pan": None}))
    b = rows(make_books(**{"pan": None}))
    result = match_mod.match("ais_26as", a, b, params={})
    m = [i for i in result["items"] if i["matchStatus"] != "unmatched"]
    assert len(m) == 1
    assert m[0]["tax"]["tan"] == "CALM00123A"


# ── matching: amount difference ─────────────────────────────────────────────

def test_tds_amount_difference():
    a = rows(make_26as(**{"tds": 1000}))
    b = rows(make_books(**{"tds": 1080}))
    result = match_mod.match("ais_26as", a, b, params={})
    statuses = [i["matchStatus"] for i in result["items"]]
    assert "amount_tolerance" in statuses, f"statuses={statuses}"


def test_tds_within_tolerance_is_clean():
    """₹5 difference is within the ₹10 tolerance → clean match, not a diff."""
    a = rows(make_26as(**{"tds": 1000}))
    b = rows(make_books(**{"tds": 1005}))
    result = match_mod.match("ais_26as", a, b, params={})
    assert any(i["matchStatus"] == "gstin_pan" for i in result["items"])


# ── matching: income mismatch ───────────────────────────────────────────────

def test_income_mismatch_on_match():
    a = rows(make_26as(**{"gross": 100000, "tds": 1000}))
    b = rows(make_books(**{"gross": 200000, "tds": 1000}))
    result = match_mod.match("ais_26as", a, b, params={})
    im = [i for i in result["items"] if i["matchStatus"] == "income_mismatch"]
    assert len(im) == 1, f"statuses={[i['matchStatus'] for i in result['items']]}"
    assert im[0]["tax"]["grossA"] == pytest.approx(100000.0)
    assert im[0]["tax"]["grossB"] == pytest.approx(200000.0)


# ── matching: section mismatch ──────────────────────────────────────────────

def test_section_mismatch():
    a = rows(make_26as(**{"section": "194J"}))
    b = rows(make_books(**{"section": "194C"}))
    result = match_mod.match("ais_26as", a, b, params={})
    sm = [i for i in result["items"] if i["matchStatus"] == "section_mismatch"]
    assert len(sm) == 1, f"statuses={[i['matchStatus'] for i in result['items']]}"
    assert sm[0]["tax"]["section"] == "194J"


# ── matching: unrelated rows stay unmatched ─────────────────────────────────

def test_completely_unrelated_rows_unmatched():
    a = rows(make_26as(name="Acme Corp", pan="AAACA1234B", tan="CALM00123A",
                       section="194J", quarter="Q1", gross=100000, tds=500))
    b = rows(make_books(name="Zenith Inc", pan="ZZZZZ9999A", tan="BBBB00002B",
                        section="194C", quarter="Q3", fy="2024-25", gross=90000, tds=300))
    result = match_mod.match("ais_26as", a, b, params={})
    assert all(i["matchStatus"] == "unmatched" for i in result["items"])


# ── duplicate detection ─────────────────────────────────────────────────────

def test_duplicate_detection_within_side():
    a = rows(make_26as(), make_26as())
    b = rows(make_books())
    result = match_mod.match("ais_26as", a, b, params={})
    statuses = [i["matchStatus"] for i in result["items"]]
    assert "duplicate" in statuses, f"statuses={statuses}"


# ── metrics.tax payload ─────────────────────────────────────────────────────

def test_metrics_tax_fields_present():
    a = rows(make_26as(), make_26as(name="Bharat Constructions", pan="BBBBB2222C",
                                    tan="DELH00555Z", section="194C", tds=5000))
    b = rows(make_books(), make_books(name="Bharat Constructions", pan="BBBBB2222C",
                                      tan="DELH00555Z", section="194C", tds=5000))
    result = match_mod.match("ais_26as", a, b, params={})
    tax = tax_metrics(result)
    for key in ("matched", "missingInBooks", "missingIn26AS", "amountDiff",
                "incomeMismatch", "sectionMismatch", "duplicates", "highRisk",
                "tds26", "tdsBooks", "netDiff", "pairs", "matchRate", "taxCreditLoss"):
        assert key in tax, f"metrics.tax.{key} missing"
    assert tax["matched"]["count"] == 2
    assert tax["pairs"] == 2


def test_metrics_match_rate():
    a = rows(make_26as())
    b = rows(make_books())
    result = match_mod.match("ais_26as", a, b, params={})
    tax = tax_metrics(result)
    assert tax["matched"]["count"] == 1
    assert tax["matchRate"] == 100.0


def test_metrics_missing_in_books():
    """A row present in 26AS but not books → missingInBooks > 0."""
    a = rows(make_26as(), make_26as(pan="CCCCC3333D", tan="DELH00999Z", name="X Corp", tds=200))
    b = []  # no books side at all
    result = match_mod.match("ais_26as", a, b, params={})
    assert tax_metrics(result)["missingInBooks"]["count"] == 2


def test_metrics_missing_in_26as():
    """A row present in books but not 26AS → missingIn26AS > 0."""
    a = []
    b = rows(make_books(), make_books(pan="DDDDD4444E", tan="MUMB00888Y", name="Y Ltd", tds=200))
    result = match_mod.match("ais_26as", a, b, params={})
    assert tax_metrics(result)["missingIn26AS"]["count"] == 2


def test_metrics_net_diff():
    """Net TDS diff = TDS(26AS) − TDS(books)."""
    a = rows(make_26as(**{"tds": 2000}))
    b = rows(make_books(**{"tds": 1000}))
    result = match_mod.match("ais_26as", a, b, params={})
    assert tax_metrics(result)["netDiff"] == pytest.approx(1000.0)


def test_metrics_high_risk_threshold():
    """A large unmatched TDS lands in the highRisk bucket."""
    a = rows(make_26as(**{"tds": 60000}))
    b = []  # not in books at all
    result = match_mod.match("ais_26as", a, b, params={})
    assert tax_metrics(result)["highRisk"]["count"] == 1
    assert tax_metrics(result)["taxCreditLoss"] == pytest.approx(60000.0)


# ── tax workbook export ─────────────────────────────────────────────────────

def test_workbook_returns_bytes():
    a = rows(make_26as())
    b = rows(make_books())
    analysis = match_mod.match("ais_26as", a, b, params={})
    data = tw.workbook_bytes(analysis, "Test Client")
    assert isinstance(data, (bytes, bytearray))
    assert len(data) > 500


def test_workbook_is_valid_xlsx_with_core_sheets():
    import io
    from openpyxl import load_workbook
    a = rows(make_26as(), make_26as(name="Bharat Constructions", pan="BBBBB2222C",
                                    tan="DELH00555Z", section="194C", tds=5000))
    b = rows(make_books(), make_books(name="Bharat Constructions", pan="BBBBB2222C",
                                      tan="DELH00555Z", section="194C", tds=5000))
    analysis = match_mod.match("ais_26as", a, b, params={})
    data = tw.workbook_bytes(analysis, "Test Client")
    wb = load_workbook(io.BytesIO(data))
    lower = [s.lower() for s in wb.sheetnames]
    assert any("summary" in s for s in lower), f"Missing summary sheet: {wb.sheetnames}"
    assert any("match" in s for s in lower), f"Missing matched sheet: {wb.sheetnames}"
    assert any("amount diff" in s for s in lower), f"Missing amount-diff sheet: {wb.sheetnames}"
    assert any("income" in s for s in lower), f"Missing income sheet: {wb.sheetnames}"
    assert any("26as" in s for s in lower), f"Missing only-in-26AS sheet: {wb.sheetnames}"


# ── edge cases ──────────────────────────────────────────────────────────────

def test_empty_both_sides():
    result = match_mod.match("ais_26as", [], [], params={})
    tax = tax_metrics(result)
    assert tax["matched"]["count"] == 0
    assert tax["pairs"] == 0
    assert result["items"] == []