"""Deterministic tests for the TDS Compliance Checklist engine module.

Cases mirror the prototype's business rules: section thresholds + rates,
threshold-crossing (TDS on full cumulative), 194C auto-rate, deduction
statuses, deposit tracking (on time / late + interest / partial / not
deposited), month-wise reconciliation running balance, date parsing, and
the 2-sheet export.
"""
import pytest
from datetime import date, datetime, timedelta

from engine.tds_checklist import (
    SECTIONS, is_company, get_rate, parse_date_cell, parse_amount_cell,
    parse_expense_ledger, parse_payable_ledger, analyze, run_checklist,
    build_workbook,
)


def rows(*dicts):
    """ReconRow-style fixtures: [{index, data}] keyed by original headers."""
    return [{"index": i, "data": d} for i, d in enumerate(dicts)]


def expense_ledger(name, section, txns, tds_col="TDS", amount_col="Amount"):
    return {"name": name, "section": section, "tdsCol": tds_col, "amountCol": amount_col, "rows": rows(*txns)}


# ── sections / rates / company detection ────────────────────────────────────

def test_section_master_rates_and_thresholds():
    assert SECTIONS["194J_prof"]["rateI"] == 10.0
    assert SECTIONS["194I_land"]["threshold"] == 240000
    assert SECTIONS["194Q"]["threshold"] == 5000000


def test_194c_auto_rate_company_vs_individual():
    assert get_rate("194C", "Sharma & Sons") == 1.0
    assert get_rate("194C", "Bharat Construction Ltd") == 2.0
    assert get_rate("194C", "Infotech Solutions Pvt Ltd") == 2.0
    assert get_rate("194C", "Ramesh Kumar") == 1.0


def test_is_company_keywords():
    assert is_company("Acme & Co")
    assert is_company("Delta Industries")
    assert not is_company("Suresh Traders")


# ── amount / date cells ─────────────────────────────────────────────────────

def test_parse_amount_cell_sides_and_formats():
    assert parse_amount_cell("10,000") == (10000.0, False, False)
    assert parse_amount_cell("10,000 Dr") == (10000.0, True, False)
    assert parse_amount_cell("10000 Cr") == (10000.0, False, True)
    assert parse_amount_cell("₹1,00,000.50") == (100000.5, False, False)
    assert parse_amount_cell(500.25) == (500.25, False, False)


def test_parse_date_variants():
    assert parse_date_cell("05-04-2025") == date(2025, 4, 5)
    assert parse_date_cell("31-Mar-2025") == date(2025, 3, 31)
    assert parse_date_cell("05/06/2025") == date(2025, 6, 5)
    serial = datetime(1899, 12, 30) + timedelta(days=45658)
    assert parse_date_cell(45658) == serial.date()
    assert parse_date_cell("") is None
    # ISO from Excel/pandas cells (the Tally xlsx datetime string form)
    assert parse_date_cell("2025-01-20") == date(2025, 1, 20)
    assert parse_date_cell("2025-01-20 00:00:00") == date(2025, 1, 20)
    assert parse_date_cell("2025-01-20T15:30:00") == date(2025, 1, 20)
    assert parse_date_cell(datetime(2025, 1, 20, 9, 0)) == date(2025, 1, 20)


# ── expense parsing: columns, fill-down, totals skipped ─────────────────────

def test_parse_expense_filldown_and_skip():
    txns = parse_expense_ledger(
        "Rent A/c",
        rows(
            {"Date": "05-04-2025", "Particulars": "Delta Traders", "Voucher": "V1",
             "TDS ON RENT": "500", "Amount": "5000"},
            {"Date": "06-04-2025", "Particulars": "", "Voucher": "V2",
             "TDS ON RENT": "0", "Amount": "6000"},
            {"Date": "07-04-2025", "Particulars": "Grand Total", "Voucher": "",
             "TDS ON RENT": "500", "Amount": "11000"},
        ),
        tds_col="TDS ON RENT",
    )
    assert len(txns) == 2
    assert txns[0]["party"] == "Delta Traders"
    assert txns[1]["party"] == "Delta Traders"  # fill-down
    assert txns[0]["tds"] == 500.0
    assert txns[1]["gross"] == 6000.0


# ── analysis: threshold + statuses ──────────────────────────────────────────

def test_194J_professional_threshold_cross_does_not_deduct():
    # 194J threshold 30,000; single ₹40,000 invoice → crossing → TDS on full.
    res = run_checklist([expense_ledger("Professional Fees", "194J_prof", [
        {"Date": "05-04-2025", "Particulars": "Consultant & Co", "Voucher": "V1", "TDS": "0", "Amount": "40000"},
    ])])["results"]
    assert len(res) == 1
    assert res[0]["dedStatus"] == "NOT DEDUCTED"
    assert res[0]["tdsReq"] == pytest.approx(4000.0)  # 40,000 × 10%
    assert res[0]["remark"].startswith("Threshold crossed!")


def test_below_threshold_classified():
    res = run_checklist([expense_ledger("Rent", "194I_land", [
        {"Date": "05-04-2025", "Particulars": "Big Office", "Voucher": "V1", "TDS": "0", "Amount": "150000"},
    ])])["results"]
    assert res[0]["dedStatus"] == "BELOW THRESHOLD"
    assert res[0]["tdsReq"] == 0.0


def test_second_txn_crosses_rent_threshold_short_deduction():
    res = run_checklist([expense_ledger("Rent", "194I_land", [
        {"Date": "05-06-2025", "Particulars": "Big Office", "Voucher": "V1", "TDS": "0", "Amount": "150000"},
        {"Date": "05-07-2025", "Particulars": "Big Office", "Voucher": "V2", "TDS": "10000", "Amount": "150000"},
    ])])["results"]
    # Engine sorts results by dedKey/date/gross descending, so locate rows by status.
    below = next(r for r in res if r["dedStatus"] == "BELOW THRESHOLD")
    assert below["tdsReq"] == 0.0
    r2 = next(r for r in res if r["dedStatus"] == "SHORT DEDUCTION")
    assert r2["cumulative"] == pytest.approx(300000.0)
    assert r2["tdsReq"] == pytest.approx(30000.0)   # crossing → full cumulative × 10%
    assert r2["tdsDed"] == pytest.approx(10000.0)
    assert r2["dedStatus"] == "SHORT DEDUCTION"


def test_compliant_when_deducted_matches():
    res = run_checklist([expense_ledger("Professional Fees", "194J_prof", [
        {"Date": "05-04-2025", "Particulars": "Consultant & Co", "Voucher": "V1", "TDS": "5000", "Amount": "50000"},
    ])])["results"]
    assert res[0]["dedStatus"] == "COMPLIANT"
    assert res[0]["diff"] == pytest.approx(0.0)


def test_excess_deduction_flagged():
    res = run_checklist([expense_ledger("Professional Fees", "194J_prof", [
        {"Date": "05-04-2025", "Particulars": "Consultant & Co", "Voucher": "V1", "TDS": "2000", "Amount": "10000"},
    ])])["results"]
    # 10,000 is below the 30,000 threshold → BELOW THRESHOLD, not excess.
    assert res[0]["dedStatus"] == "BELOW THRESHOLD"


def test_194C_contractor_rates_apply_per_party_type():
    res = run_checklist([
        expense_ledger("Contractors", "194C", [
            {"Date": "05-04-2025", "Particulars": "Sharma & Sons", "Voucher": "V1", "TDS": "0", "Amount": "40000"},
            {"Date": "05-04-2025", "Particulars": "Bharat Construction Ltd", "Voucher": "V2", "TDS": "3000", "Amount": "150000"},
        ]),
    ])["results"]
    indiv = next(r for r in res if r["party"] == "Sharma & Sons")
    comp = next(r for r in res if r["party"] == "Bharat Construction Ltd")
    assert indiv["rate"] == pytest.approx(1.0)
    assert indiv["tdsReq"] == pytest.approx(400.0)
    assert indiv["dedStatus"] == "NOT DEDUCTED"
    assert comp["rate"] == pytest.approx(2.0)
    assert comp["tdsReq"] == pytest.approx(3000.0)
    assert comp["dedStatus"] == "COMPLIANT"
    assert comp["partyType"] == "Company"


# ── deposit tracking + interest ─────────────────────────────────────────────

def _rent_ledger_with_deposits(dep_txn_date, dep_rows, amt=150000, tds=10000):
    return run_checklist(
        [expense_ledger("Rent", "194I_land", [
            {"Date": "05-06-2025", "Particulars": "Big Office", "Voucher": "V1", "TDS": "0", "Amount": "150000"},
            {"Date": dep_txn_date, "Particulars": "Big Office", "Voucher": "V2", "TDS": str(tds), "Amount": str(amt)},
        ])],
        payable_rows=rows(*dep_rows),
    )


def test_deposit_on_time():
    # July deduction deposited in the same (July) month pool → on time (before 7-Aug due).
    a = _rent_ledger_with_deposits("05-07-2025", [
        {"Date": "05-07-2025", "Particulars": "TDS Payable", "Voucher": "PD1", "Debit": "10000", "Credit": ""},
    ])
    r = next(x for x in a["results"] if x["dedStatus"] != "BELOW THRESHOLD")
    assert r["depStatus"] == "DEPOSITED ON TIME"
    assert r["depAmt"] == pytest.approx(10000.0)
    assert r["interest"] == 0


def test_month_recon_late_deposit_interest():
    # April deduction due 07-May; May payment on 10-May is passed 3 days late.
    # Interest @ 1.5%/month = round(5,000 x 0.015 x ceil(3/30.44)) = 75.
    a = run_checklist(
        [expense_ledger("Professional Fees", "194J_prof", [
            {"Date": "05-04-2025", "Particulars": "Consultant & Co", "Voucher": "V1", "TDS": "5000", "Amount": "50000"},
        ])],
        payable_rows=rows(
            {"Date": "10-05-2025", "Particulars": "TDS Payable", "Voucher": "PD1", "Debit": "5000", "Credit": ""},
        ),
    )
    may = next(m for m in a["monthRecon"] if m["month"] == "2025-05")
    assert may["status"].startswith("LATE")
    assert may["daysLate"] == 3
    assert may["interest"] == 75
    assert a["monthReconMeta"]["totalInterest"] == 75


def test_not_deposited():
    # Payable ledger loaded (hasDep true) but no deposit in the deduction's own
    # month → per-transaction status NOT DEPOSITED (FIFO pool is same-month only).
    a = _rent_ledger_with_deposits("05-07-2025", [
        {"Date": "05-08-2025", "Particulars": "TDS Payable", "Voucher": "PD1", "Debit": "10000", "Credit": ""},
    ])
    late = next(r for r in a["results"] if r["dedStatus"] != "BELOW THRESHOLD")
    assert late["depStatus"] == "NOT DEPOSITED"
    assert a["summary"]["notDeposited"] == 1


def test_no_deposit_data_without_payable():
    # No TDS Payable ledger at all → prototype's hasDep gate leaves the deposit
    # column as "NO DEPOSIT DATA"; no deposit findings are counted.
    a = _rent_ledger_with_deposits("05-07-2025", [])
    r = next(x for x in a["results"] if x["dedStatus"] != "BELOW THRESHOLD")
    assert r["depStatus"] == "NO DEPOSIT DATA"
    assert a["summary"]["hasDeposits"] is False
    assert a["summary"]["notDeposited"] == 0


def test_partial_deposit():
    # July deduction, July pool only carries 4,000 → partially deposited.
    a = _rent_ledger_with_deposits("05-07-2025", [
        {"Date": "05-07-2025", "Particulars": "TDS Payable", "Voucher": "PD1", "Debit": "4000", "Credit": ""},
    ])
    late = next(r for r in a["results"] if r["dedStatus"] != "BELOW THRESHOLD")
    assert late["depStatus"] == "PARTIALLY DEPOSITED"
    assert late["depAmt"] == pytest.approx(4000.0)


# ── single-sided registers (no Credit column) ───────────────────────────────

def test_single_sided_debit_balance_deposits():
    # Realistic challan register: Date/Particulars/Voucher/Debit/Balance — a
    # running-balance column, no Credit side. Debit alone must still count as a
    # deposit (the running balance must not leak into the deposit pool).
    a = run_checklist(
        [expense_ledger("Rent", "194I_land", [
            {"Date": "05-06-2025", "Particulars": "Big Office", "Voucher": "V1", "TDS": "0", "Amount": "150000"},
            {"Date": "05-07-2025", "Particulars": "Big Office", "Voucher": "V2", "TDS": "10000", "Amount": "150000"},
        ])],
        payable_rows=rows(
            {"Date": "05-07-2025", "Particulars": "TDS Payable", "Voucher": "PD1", "Debit": "10000", "Balance": "85000"},
        ),
    )
    r = next(x for x in a["results"] if x["dedStatus"] != "BELOW THRESHOLD")
    assert r["depStatus"] == "DEPOSITED ON TIME"
    assert r["depAmt"] == pytest.approx(10000.0)
    # Running balance must never be mistaken for a deposit.
    assert sum(d["gross"] for d in parse_payable_ledger(rows(
        {"Date": "05-07-2025", "Particulars": "TDS Payable", "Voucher": "PD1", "Debit": "10000", "Balance": "85000"},
    ))[1]) == pytest.approx(10000.0)


def test_single_sided_amount_only_deposits():
    # Bare Amount register with no Debit/Credit/Balance sides → amount = deposit.
    a = run_checklist(
        [expense_ledger("Professional Fees", "194J_prof", [
            {"Date": "05-04-2025", "Particulars": "Consultant & Co", "Voucher": "V1", "TDS": "5000", "Amount": "50000"},
        ])],
        payable_rows=rows(
            {"Date": "10-05-2025", "Particulars": "TDS Payable", "Voucher": "PD1", "Amount": "5000"},
        ),
    )
    may = next(m for m in a["monthRecon"] if m["month"] == "2025-05")
    assert may["status"].startswith("LATE")
    assert may["paid"] == pytest.approx(5000.0)


# ── month-wise reconciliation ───────────────────────────────────────────────

def test_month_reconciliation_running_balance():
    a = run_checklist(
        [expense_ledger("Professional Fees", "194J_prof", [
            {"Date": "05-04-2025", "Particulars": "Consultant & Co", "Voucher": "V1", "TDS": "5000", "Amount": "50000"},
            {"Date": "10-04-2025", "Particulars": "Consultant & Co", "Voucher": "V2", "TDS": "1500", "Amount": "15000"},
        ])],
        payable_rows=rows(
            {"Date": "05-05-2025", "Particulars": "TDS Payable", "Voucher": "PD1", "Debit": "6500", "Credit": ""},
        ),
    )
    months = a["monthRecon"]
    assert months[0]["month"] == "2025-04"
    assert months[0]["deducted"] == pytest.approx(6500.0)
    assert months[0]["closing"] == pytest.approx(6500.0)
    assert months[0]["status"] == "PENDING PAYMENT"
    assert months[1]["month"] == "2025-05"
    assert months[1]["paid"] == pytest.approx(6500.0)
    assert months[1]["closing"] == pytest.approx(0.0)
    assert months[1]["status"] == "PAID"
    assert a["monthReconMeta"]["finalBalance"] == pytest.approx(0.0)


def test_opening_balance_carried_from_payable():
    a = run_checklist(
        [expense_ledger("Rent", "194I_land", [
            {"Date": "05-06-2025", "Particulars": "Big Office", "Voucher": "V1", "TDS": "1000", "Amount": "30000"},
        ])],
        payable_rows=[
            {"index": 0, "data": {"Particulars": "Opening Balance", "Debit": "", "Credit": "2500"}},
            {"index": 1, "data": {"Date": "07-07-2025", "Particulars": "TDS Payable", "Voucher": "PD1", "Debit": "3000", "Credit": ""}},
        ],
    )
    assert a["summary"]["openingBalance"] == pytest.approx(2500.0)
    months = a["monthRecon"]
    june = next(m for m in months if m["month"] == "2025-06")
    assert june["opening"] == pytest.approx(2500.0)


# ── export ──────────────────────────────────────────────────────────────────

def test_workbook_has_two_sheets():
    a = run_checklist([expense_ledger("Professional Fees", "194J_prof", [
        {"Date": "05-04-2025", "Particulars": "Consultant & Co", "Voucher": "V1", "TDS": "5000", "Amount": "50000"},
    ])])
    import io
    from openpyxl import load_workbook
    data = build_workbook(a, "Acme Mfg")
    assert data[:2] == b"PK"  # xlsx zip magic
    wb = load_workbook(io.BytesIO(data))
    assert wb.sheetnames == ["TDS Checklist", "Payment Reconciliation"]


def test_workbook_bytes_roundtrip():
    from engine.tds_checklist import workbook_bytes
    a = run_checklist([expense_ledger("Professional Fees", "194J_prof", [
        {"Date": "05-04-2025", "Particulars": "Consultant & Co", "Voucher": "V1", "TDS": "5000", "Amount": "50000"},
    ])])
    data = workbook_bytes(a, "Acme Mfg")
    assert data[:2] == b"PK"
    assert len(data) > 800


# ── summary / section aggregation ───────────────────────────────────────────

def test_section_summary_aggregates():
    a = run_checklist([
        expense_ledger("Professional Fees", "194J_prof", [
            {"Date": "05-04-2025", "Particulars": "Consultant & Co", "Voucher": "V1", "TDS": "0", "Amount": "40000"},
        ]),
        expense_ledger("Contractors", "194C", [
            {"Date": "05-04-2025", "Particulars": "Sharma & Sons", "Voucher": "V2", "TDS": "0", "Amount": "40000"},
        ]),
    ])
    ss = a["sectionSummary"]
    assert len(ss) == 2
    prof = next(s for s in ss if "194J" in s["section"])
    assert prof["issues"] == 1  # NOT DEDUCTED
    assert prof["short"] == pytest.approx(4000.0)
    assert a["summary"]["notDeducted"] == 2
    assert a["summary"]["transactionCount"] == 2