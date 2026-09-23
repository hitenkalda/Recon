"""TB / P&L variance engine tests — the enumerated cases from the integration spec."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from engine import tb_variance as T


def _tb(*ledgers):
    """Build engine ReconRow-style rows from (particulars, opening, debit, credit, closing)."""
    rows = []
    for i, (name, opening, debit, credit, closing) in enumerate(ledgers):
        rows.append({
            "index": i,
            "data": {
                "Particulars": name,
                "Opening Balance": opening,
                "Debit": debit,
                "Credit": credit,
                "Closing Balance": closing,
            },
        })
    return rows


def _runs(results):
    return [r for r in results if r["category"] not in ("new_ledger", "no_movement", "dropped")]


def test_exact_same_tb():
    a = _tb(("Sales", 0, 0, 0, "1,00,000"), ("Rent", 0, 0, 0, 24000))
    out = T.analyze_tb(a, a)
    assert out["summary"]["withinThreshold"] == 2
    assert all(r["category"] == "within_threshold" for r in _runs(out["results"]))
    assert all(r["varPct"] == 0 for r in _runs(out["results"]))


def test_under_10_pct_within():
    a = _tb(("Sales", 0, 0, 0, "1,00,000"))
    b = _tb(("Sales", 0, 0, 0, "1,05,000"))  # +5%
    out = T.analyze_tb(a, b)
    r = out["results"][0]
    assert r["category"] == "within_threshold"
    assert abs(r["varPct"]) < 10


def test_10_to_20_quick():
    a = _tb(("Rent", 0, 0, 0, 100000))
    b = _tb(("Rent", 0, 0, 0, 115000))  # +15%
    out = T.analyze_tb(a, b)
    assert out["results"][0]["category"] == "quick_review"
    assert 10 <= abs(out["results"][0]["varPct"]) < 20


def test_above_20_detailed():
    a = _tb(("Salary", 0, 0, 0, 100000))
    b = _tb(("Salary", 0, 0, 0, 135000))  # +35%
    out = T.analyze_tb(a, b)
    assert out["results"][0]["category"] == "detailed_review"
    assert out["results"][0]["varPct"] == 35.0


def test_new_ledger():
    a = _tb(("Salary", 0, 0, 0, 100000))
    b = _tb(("Salary", 0, 0, 0, 100000), ("Bonus Expense", 0, 0, 0, 50000))
    out = T.analyze_tb(a, b)
    cats = {r["particulars"]: r["category"] for r in out["results"]}
    assert cats["Bonus Expense"] == "new_ledger"
    assert out["summary"]["newLedgers"] == 1


def test_dropped_ledger():
    a = _tb(("Insurance", 0, 0, 0, 12000), ("Sales", 0, 0, 0, 90000))
    b = _tb(("Sales", 0, 0, 0, 90000))
    out = T.analyze_tb(a, b)
    cats = [r["category"] for r in out["results"]]
    assert "dropped" in cats
    assert out["summary"]["dropped"] == 1


def test_no_movement():
    a = _tb(("Sales", 0, 0, 0, 100000))
    b = _tb(("Sales", 0, 0, 0, 100000), ("Capital", 0, 0, 0, 0))
    out = T.analyze_tb(a, b)
    cats = {r["particulars"]: r["category"] for r in out["results"]}
    assert cats["Capital"] == "no_movement"


def test_prior_zero_current_value_detailed():
    a = _tb(("Rent", 0, 0, 0, 0))
    b = _tb(("Rent", 0, 0, 0, 30000))
    out = T.analyze_tb(a, b)
    r = out["results"][0]
    assert r["category"] == "detailed_review"
    assert r["varPct"] is None


def test_ob_mismatch_flagged():
    a = _tb(("Sales", 0, 0, 0, 100000))
    b = _tb(("Sales", 1000, 0, 0, 105000))
    out = T.analyze_tb(a, b)
    r = [x for x in out["results"] if x["particulars"] == "Sales"][0]
    assert r["obMismatch"] and r["obMismatch"] > 0.5
    assert out["summary"]["obMismatches"] == 1


def test_invalid_columns_no_particulars():
    # a "TB" without a particulars/ledger column → ValueError, not a crash
    rows = [{"index": 0, "data": {"A": "x", "B": "1,00,000"}}]
    try:
        T.analyze_tb(rows, rows)
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_pl_all_ledgers_mode_counts_balance_sheet_ledgers():
    # balance-sheet ledgers excluded by keyword mode, included by all-ledgers mode
    a = _tb(("Sales", 0, 0, 0, 100000), ("Capital A/c", 0, 0, 0, 500000))
    b = _tb(("Sales", 0, 0, 0, 130000), ("Capital A/c", 0, 0, 0, 600000))
    keyword_mode = T.analyze_tb(a, b, {"plAllLedgers": False})
    all_mode = T.analyze_tb(a, b, {"plAllLedgers": True})
    assert keyword_mode["summary"]["withinThreshold"] + keyword_mode["summary"]["quickReview"] + keyword_mode["summary"]["detailedReview"] == 1
    assert all_mode["summary"]["detailedReview"] >= 2


def test_workbook_builds_with_7_sheets():
    a = _tb(("Sales", 0, 0, 0, 100000), ("Rent", 0, 0, 0, 20000))
    b = _tb(("Sales", 0, 0, 0, 150000), ("Rent", 0, 0, 0, 24000), ("New A/c", 0, 0, 0, 5000))
    analysis = T.analyze_tb(a, b)
    wb = T.build_workbook(analysis, client_name="Acme")
    assert wb.sheetnames == [
        "1. Full P&L Analysis", "2. Detailed Review (>20%)", "3. Quick Review (10-20%)",
        "4. Within Threshold (<10%)", "5. New Ledgers", "6. No Movement", "7. OB Reconciliation",
        "Summary",
    ]
    data = T.workbook_bytes(analysis, "Acme")
    assert data[:2] == b"PK"  # real xlsx zip magic