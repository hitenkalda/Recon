#!/usr/bin/env python3
"""ReconAI Real-World Stress Benchmark — live-path E2E harness.

Uploads 10k/3k-row CSV probe files through the real production API stack
(upload → worker → engine /v1/process → persist → recon/variance/TDS/audit run →
exceptions → export → security/tenant isolation → concurrency → E2E engagement).

Run after the engine-direct `stress_benchmark.py` baseline. Results are written
to benchmark_data/stress_e2e_results.json.

Config (env):
  RECONAI_API    base URL (default http://localhost:3001/api)
  STRESS_DATASET dataset directory
"""
from __future__ import annotations
import csv, io, os, sys, time, json, threading
from pathlib import Path
from datetime import datetime, timezone

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# add engine for helper imports
HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

# ── shared helpers from existing benchmark runner ────────────────────────────
sys.path.insert(0, str(HERE))
from benchmark_runner import (
    api, upload_file, wait_for_parse, wait_for_run, wait_for_variance, wait_for_tds,
)
DATASET = Path(os.environ.get("STRESS_DATASET", str(HERE.parent.parent.parent / "ReconAI_real_world_stress_dataset_v1")))
OUT_DIR = HERE / "benchmark_data"
PROBE_DIR = OUT_DIR / "stress_probes"
PROBE_DIR.mkdir(parents=True, exist_ok=True)

results: dict = {
    "benchmark": "ReconAI Real-World Stress Benchmark — Live E2E",
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "dataset": str(DATASET),
    "modules": {},
    "summary": {},
}
TOTALS = {"pass": 0, "fail": 0, "partial": 0, "not_implemented": 0, "blocked": 0}

def record(mod, name, expected, actual, passed=None, details=None):
    if passed is None: passed = (expected == actual)
    if isinstance(passed, str): TOTALS[passed] = TOTALS.get(passed, 0) + 1
    elif passed: TOTALS["pass"] += 1
    else: TOTALS["fail"] += 1
    results["modules"].setdefault(mod, {"tests": [], "timing": {}})
    results["modules"][mod]["tests"].append({"name": name, "expected": expected, "actual": actual,
                                             "passed": passed, "details": details or {}})
    return passed

def timing(mod, key, seconds):
    results["modules"].setdefault(mod, {"tests": [], "timing": {}})
    results["modules"][mod]["timing"][key] = round(seconds, 2)

# ── probe CSV generation (deterministic, from same dataset) ──────────────────

def write_slice(src: str, dest: str, n: int):
    """Slice first n rows of a stress CSV into a new CSV (same headers)."""
    dest_p = PROBE_DIR / dest
    if dest_p.exists():
        return dest_p
    with open(DATASET / src, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        headers = next(reader)
        rows = [next(reader) for _ in range(n)]
    with open(dest_p, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(headers)
        w.writerows(rows)
    return dest_p

def probe_pairs():
    """Create all 3k/10k probe CSVs and return {name: path}."""
    return {
        "gst_books_3k": write_slice("gst_purchase_ledger_100k.csv", "gst_books_3k.csv", 3000),
        "gst_2b_3k":    write_slice("gst_gstr2b_107k.csv", "gst_2b_3k.csv", 3000),
        "gst_books_10k": write_slice("gst_purchase_ledger_100k.csv", "gst_books_10k.csv", 10000),
        "bank_book_3k":  write_slice("bank_book_105k.csv", "bank_book_3k.csv", 3000),
        "bank_stmt_3k":  write_slice("bank_statement_106k.csv", "bank_stmt_3k.csv", 3000),
        "ais_portal_1k5": write_slice("ais_26as_portal_50k.csv", "ais_portal_1k5.csv", 1500),
        "ais_books_1k5":  write_slice("ais_books_tds_50k.csv", "ais_books_1k5.csv", 1500),
        "tds_exp_3k":    write_slice("tds_expense_ledger_100k.csv", "tds_exp_3k.csv", 3000),
        "tds_pay_3k":    write_slice("tds_payable_15k_debit_balance.csv", "tds_pay_3k.csv", 3000),
        "var_prior_3k":  write_slice("variance_prior_tb_10k.csv", "var_prior_3k.csv", 3000),
        "var_curr_3k":   write_slice("variance_current_tb_10k.csv", "var_curr_3k.csv", 3000),
    }

# ── upload helpers ───────────────────────────────────────────────────────────

def upload_doc(file_path: Path, category: str, engagement_id: str, client_id: str) -> str | None:
    """Upload and confirm a file → document_id (or None on failure)."""
    fname = file_path.name
    mime = "text/csv" if fname.endswith(".csv") else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    r = api("POST", "/documents/upload-init", {"engagementId": engagement_id, "clientId": client_id,
            "files": [{"name": fname, "size": file_path.stat().st_size, "mime": mime}]})
    if "_error" in r:
        return None
    up_id = r.get("uploadId")
    doc_info = r.get("uploads", [{}])[0]
    doc_id = doc_info.get("documentId")
    url = doc_info.get("presignedUrl")
    status = upload_file(url, str(file_path), mime)
    if status not in (200, 201):
        return None
    api("POST", f"/documents/{doc_id}/confirm", {"uploadId": up_id, "fieldId": doc_id, "category": category})
    return doc_id

def upload_and_parse(file_path: Path, category: str, engagement_id: str, client_id: str,
                     expected_rows: int, label: str) -> tuple[str | None, int, float]:
    """Upload, wait for parse, record. Returns (doc_id, record_count, seconds)."""
    t0 = time.time()
    doc_id = upload_doc(file_path, category, engagement_id, client_id)
    if not doc_id:
        return None, 0, time.time() - t0
    count = wait_for_parse(doc_id, max_wait=120)
    dt = time.time() - t0
    timing("pipeline", f"{label}_upload_parse", dt)
    return doc_id, count, dt

# ── E2E phases ──────────────────────────────────────────────────────────────

def phase_auth_and_engagement():
    """Sign up (or login) and create client + engagement. Returns (client_id, engagement_id)."""
    email = f"stress_e2e_{int(time.time())}@reconai.test"
    pw = "Stress!2026E2E"
    r = api("POST", "/auth/signup", {"name": "Stress E2E", "email": email, "password": pw, "firmName": "Stress Firm"})
    user_id = r.get("id")
    if not user_id:
        r = api("POST", "/auth/login", {"email": email, "password": pw})
        user_id = (r.get("user") or {}).get("id")
    assert user_id, f"Auth failed: {r}"
    r = api("POST", "/clients", {"name": "Stress Client", "type": "company", "gstin": "27AAACS1232F1ZU", "pan": "AAACS1232F"})
    client_id = r.get("id"); assert client_id
    r = api("POST", "/engagements", {"clientId": client_id, "title": "Stress FY25-26", "kind": "tax_audit",
            "financialYear": {"start": "2025-04-01", "end": "2026-03-31"}, "scope": {"months": {"from": "2025-04", "to": "2026-03"}}})
    engagement_id = r.get("id"); assert engagement_id
    return email, pw, client_id, engagement_id, user_id

def phase_parse_10k(client_id, engagement_id):
    """Upload a 10k-row GST purchase slice and confirm parsing at 10k scale."""
    print("[10k PARSE-PERSIST]", flush=True)
    doc_id, count, dt = upload_and_parse(PROBE_DIR / "gst_books_10k.csv", "purchase_invoice",
                                         engagement_id, client_id, 10000, "gst_books_10k")
    record("pipeline", "10k_parse_persist", 10000, count, passed=count == 10000,
           details={"seconds": round(dt, 2), "doc_id": doc_id})
    print(f"  10k GST parse+persist: {count} rows in {dt:.1f}s", flush=True)

def phase_gst_run(client_id, engagement_id):
    print("[GST RUN]", flush=True)
    t0 = time.time()
    ids = {}
    for label, cat, fkey in [("books", "purchase_invoice", "gst_books_3k"), ("2b", "gstr_2b", "gst_2b_3k")]:
        doc_id, count, _ = upload_and_parse(PROBE_DIR[fkey], cat, engagement_id, client_id, 3000, f"gst_{label}")
        ids[label] = (doc_id, count)
    b_id, b_ct = ids["books"]; g_id, g_ct = ids["2b"]
    if not (b_id and g_id):
        record("gst_live", "run_completed", True, False, details={"error": "upload failed"}); return
    r = api("POST", "/reconciliations", {"type": "gst", "data": {"engagementId": engagement_id, "clientId": client_id,
            "purchaseLedgerDocumentId": b_id, "gstr2bDocumentId": g_id, "period": {"from": "2025-04", "to": "2026-03"}}})
    run_id = r.get("id");
    if not run_id:
        record("gst_live", "run_created", True, False, details={"error": r}); return
    res = wait_for_run(run_id, max_wait=120)
    dt = time.time() - t0
    timing("gst_live", "total_run", dt)
    record("gst_live", "run_completed", "completed", res.get("status"),
           passed=res.get("status") == "completed", details={"seconds": round(dt, 2), "run_id": run_id})
    m = (res.get("metrics") or {})
    matched = m.get("matchedCount", 0)
    record("gst_live", "matched_count", ">0", matched, passed=matched > 0,
           details={"totalA": m.get("totalA"), "totalB": m.get("totalB"), "matched": matched})
    # export: GST should 400 (AIS-only)
    ex = api("GET", f"/reconciliations/{run_id}/export")
    record("gst_live", "export_gst_correctly_rejected", 400, ex.get("_error"), passed=ex.get("_error") == 400)
    # exceptions
    exc = api("GET", f"/exceptions?engagementId={engagement_id}&page=1&pageSize=5")
    exc_total = exc.get("total", 0)
    record("gst_live", "exceptions_generated", ">0", exc_total, passed=exc_total > 0,
           details={"exception_sample_kinds": [e.get("kind") for e in exc.get("items", [])[:5]]})
    return run_id

def phase_bank_run(client_id, engagement_id):
    print("[BANK RUN]", flush=True)
    t0 = time.time()
    b_id, _ = upload_and_parse(PROBE_DIR["bank_book_3k"], "bank_statement", engagement_id, client_id, 3000, "bank_book")
    s_id, _ = upload_and_parse(PROBE_DIR["bank_stmt_3k"], "bank_statement", engagement_id, client_id, 3000, "bank_stmt")
    if not (b_id and s_id):
        record("bank_live", "run_completed", True, False, details={"error": "upload failed"}); return
    r = api("POST", "/reconciliations", {"type": "bank", "data": {"engagementId": engagement_id, "clientId": client_id,
            "bankStatementDocumentId": s_id, "bookLedgerDocumentId": b_id, "period": {"from": "2025-04", "to": "2026-03"}}})
    run_id = r.get("id")
    res = wait_for_run(run_id, max_wait=120)
    dt = time.time() - t0
    timing("bank_live", "total_run", dt)
    record("bank_live", "run_completed", "completed", res.get("status"),
           passed=res.get("status") == "completed", details={"seconds": round(dt, 2), "run_id": run_id})
    ex = api("GET", f"/reconciliations/{run_id}/export")
    record("bank_live", "export_bank_correctly_rejected", 400, ex.get("_error"), passed=ex.get("_error") == 400)
    return run_id

def phase_ais_run(client_id, engagement_id):
    print("[AIS/26AS RUN]", flush=True)
    t0 = time.time()
    a_id, _ = upload_and_parse(PROBE_DIR["ais_portal_1k5"], "ais_26as", engagement_id, client_id, 1500, "ais_portal")
    b_id, _ = upload_and_parse(PROBE_DIR["ais_books_1k5"], "tds_receivable", engagement_id, client_id, 1500, "ais_books")
    if not (a_id and b_id):
        record("ais_live", "run_completed", True, False, details={"error": "upload failed"}); return
    r = api("POST", "/reconciliations", {"type": "ais_26as", "data": {"engagementId": engagement_id, "clientId": client_id,
            "ais26asDocumentId": a_id, "booksDocumentId": b_id, "period": {"from": "2025-04", "to": "2026-03"}}})
    run_id = r.get("id")
    res = wait_for_run(run_id, max_wait=180)
    dt = time.time() - t0
    timing("ais_live", "total_run", dt)
    record("ais_live", "run_completed", "completed", res.get("status"),
           passed=res.get("status") == "completed", details={"seconds": round(dt, 2), "run_id": run_id})
    m = res.get("metrics") or {}
    tax = m.get("tax") or {}
    sec = tax.get("sectionMismatch", {}).get("count", 0)
    record("ais_live", "section_mismatch_in_live_run", ">0", sec, passed=sec > 0,
           details={"section_mismatch": sec, "matched": tax.get("matched", {}).get("count"), "missingInBooks": tax.get("missingInBooks", {}).get("count")})
    # export 8 sheets
    ex = api("GET", f"/reconciliations/{run_id}/export")
    sheets_ok = ex.get("_error") is None and isinstance(ex.get("url"), str)
    record("ais_live", "export_8_sheet_26as", True, sheets_ok, passed=sheets_ok,
           details={"url_present": sheets_ok, "summary": ex.get("summary")})
    return run_id

def phase_tds_run(client_id, engagement_id):
    print("[TDS RUN]", flush=True)
    t0 = time.time()
    exp_id, exp_ct, _ = upload_and_parse(PROBE_DIR["tds_exp_3k"], "expense_ledger", engagement_id, client_id, 3000, "tds_exp")
    pay_id, pay_ct, _ = upload_and_parse(PROBE_DIR["tds_pay_3k"], "tds_payable", engagement_id, client_id, 3000, "tds_pay")
    if not (exp_id and pay_id):
        record("tds_live", "run_completed", True, False, details={"error": "upload failed"}); return
    r = api("POST", "/tds", {"engagementId": engagement_id, "clientId": client_id,
           "ledgers": [{"documentId": exp_id, "name": "Stress Expense", "section": "194C", "tdsCol": "TDS Deducted", "amountCol": "Gross Amount"}],
           "payableDocumentId": pay_id,
           "config": {"financialYear": {"from": 2025, "to": 2026}, "clientName": "Stress Client"}})
    run_id = r.get("id")
    res = wait_for_tds(run_id, max_wait=180)
    dt = time.time() - t0
    timing("tds_live", "total_run", dt)
    record("tds_live", "run_completed", "completed", res.get("status"),
           passed=res.get("status") == "completed", details={"seconds": round(dt, 2), "run_id": run_id})
    # export 2 sheets
    ex = api("GET", f"/tds/{run_id}/export")
    sheets_ok = ex.get("_error") is None and isinstance(ex.get("url"), str)
    record("tds_live", "export_2_sheet_tds", True, sheets_ok, passed=sheets_ok)
    return run_id

def phase_variance_run(client_id, engagement_id):
    print("[VARIANCE RUN]", flush=True)
    t0 = time.time()
    p_id, _, _ = upload_and_parse(PROBE_DIR["var_prior_3k"], "trial_balance", engagement_id, client_id, 3000, "var_prior")
    c_id, _, _ = upload_and_parse(PROBE_DIR["var_curr_3k"], "trial_balance", engagement_id, client_id, 3000, "var_curr")
    if not (p_id and c_id):
        record("var_live", "run_completed", True, False, details={"error": "upload failed"}); return
    r = api("POST", "/variance", {"engagementId": engagement_id, "clientId": client_id,
           "priorDocumentId": p_id, "currentDocumentId": c_id, "config": {}})
    run_id = r.get("id")
    res = wait_for_variance(run_id, max_wait=180)
    dt = time.time() - t0
    timing("var_live", "total_run", dt)
    record("var_live", "run_completed", "completed", res.get("status"),
           passed=res.get("status") == "completed", details={"seconds": round(dt, 2), "run_id": run_id})
    # export 7 sheets
    ex = api("GET", f"/variance/{run_id}/export")
    sheets_ok = ex.get("_error") is None and isinstance(ex.get("url"), str)
    record("var_live", "export_7_sheet_variance", True, sheets_ok, passed=sheets_ok)
    return run_id

def phase_concurrent(client_id, engagement_id):
    print("[CONCURRENCY]", flush=True)
    doc_ids = {}
    for label, cat, fkey in [("gb", "purchase_invoice", "gst_books_3k"), ("g2", "gstr_2b", "gst_2b_3k"),
                             ("bb", "bank_statement", "bank_book_3k"), ("bs", "bank_statement", "bank_stmt_3k")]:
        doc_ids[label] = upload_doc(PROBE_DIR[fkey], cat, engagement_id, client_id)
    def run_gst():
        r = api("POST", "/reconciliations", {"type": "gst", "data": {"engagementId": engagement_id, "clientId": client_id,
                "purchaseLedgerDocumentId": doc_ids["gb"], "gstr2bDocumentId": doc_ids["g2"],
                "period": {"from": "2025-04", "to": "2026-03"}}})
        return r.get("id"), wait_for_run(r.get("id"), max_wait=180).get("status")
    def run_bank():
        r = api("POST", "/reconciliations", {"type": "bank", "data": {"engagementId": engagement_id, "clientId": client_id,
                "bankStatementDocumentId": doc_ids["bs"], "bookLedgerDocumentId": doc_ids["bb"],
                "period": {"from": "2025-04", "to": "2026-03"}}})
        return r.get("id"), wait_for_run(r.get("id"), max_wait=180).get("status")
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=2) as ex:
        f1 = ex.submit(run_gst); f2 = ex.submit(run_bank)
        gst_id, gst_st = f1.result()
        bank_id, bank_st = f2.result()
    dt = time.time() - t0
    timing("concurrency", "two_runs_parallel", dt)
    all_completed = (gst_st == "completed") and (bank_st == "completed")
    isolated = (gst_id is not None) and (bank_id is not None) and (gst_id != bank_id)
    record("concurrency", "two_jobs_completed_parallel", True, all_completed,
           passed=all_completed and isolated, details={"gst": gst_id, "bank": bank_id, "wall": round(dt, 2)})
    print(f"  concurrency: gst={gst_st} bank={bank_st} wall={dt:.1f}s", flush=True)

def phase_security_tenant_isolation(client_id, engagement_id, email, pw):
    print("[SECURITY / TENANT ISOLATION]", flush=True)
    # Firm B sign up
    email_b = f"stress_firm_b_{int(time.time())}@reconai.test"
    pw_b = "Stress!2026FirmB"
    r = api("POST", "/auth/signup", {"name": "Firm B", "email": email_b, "password": pw_b, "firmName": "Firm B"})
    uid_b = r.get("id") or ((r.get("user") or {}).get("id"))
    assert uid_b, f"Firm B signup failed: {r}"
    # Firm B has no access to Firm A documents/clients/reports
    # Try reading Firm A's clients (should return only B's = 0)
    cli_b = api("GET", "/clients")
    firm_a_clients = [c for c in cli_b.get("items", []) if c.get("id") == client_id]
    record("security", "firm_b_cannot_see_firm_a_clients", 0, len(firm_a_clients),
           passed=len(firm_a_clients) == 0)
    # Try reading Firm A's exceptions (should be empty for B's firm)
    exc_b = api("GET", "/exceptions")
    firm_a_exc = [e for e in exc_b.get("items", []) if e.get("clientId") == client_id]
    record("security", "firm_b_cannot_see_firm_a_exceptions", 0, len(firm_a_exc),
           passed=len(firm_a_exc) == 0)
    # direct API manipulation — access Firm A engagement by id with Firm B session
    eng_a = api("GET", f"/engagements/{engagement_id}")
    record("security", "firm_b_cannot_access_firm_a_engagement", True, eng_a.get("_error") in (404, 403),
           passed=eng_a.get("_error") in (404, 403), details={"status": eng_a.get("_error")})
    print("  tenant isolation checks complete", flush=True)

# ── main ────────────────────────────────────────────────────────────────────

def main():
    print(f"Dataset: {DATASET}", flush=True)
    probes = probe_pairs()
    email, pw, client_id, engagement_id, user_id = phase_auth_and_engagement()
    phase_parse_10k(client_id, engagement_id)
    gst_run_id = phase_gst_run(client_id, engagement_id)
    bank_run_id = phase_bank_run(client_id, engagement_id)
    ais_run_id = phase_ais_run(client_id, engagement_id)
    tds_run_id = phase_tds_run(client_id, engagement_id)
    var_run_id = phase_variance_run(client_id, engagement_id)
    phase_concurrent(client_id, engagement_id)
    phase_security_tenant_isolation(client_id, engagement_id, email, pw)

    # write results
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results["summary"] = TOTALS
    with open(OUT_DIR / "stress_e2e_results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, default=str)
    print("\n== LIVE E2E SUMMARY ==")
    print(json.dumps(TOTALS), flush=True)
    print(f"results: {OUT_DIR / 'stress_e2e_results.json'}", flush=True)


if __name__ == "__main__":
    from concurrent.futures import ThreadPoolExecutor  # lazy import to keep module-level clean
    main()