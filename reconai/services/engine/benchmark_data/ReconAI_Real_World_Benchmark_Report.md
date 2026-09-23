# ReconAI Real-World Benchmark Report

- **Date:** 2026-09-17T10:06:37.997940+00:00
- **Commit/Version:** baseline (engine-direct, in-process)
- **Dataset:** C:\Users\DELL\Desktop\ReconAI\ReconAI_real_world_stress_dataset_v1 (seed 42, ~804k rows)
- **OCR:** out of scope by instruction

## Executive Summary
- Modules tested: 9
- Total assertions: 75
- **pass=44  fail=23  partial=0  not_implemented=3  blocked=5**

## parsing
- **PASS** parse_gst_purchase_ledger_100k.csv: expected=100000 actual=100000
    - {"headers": 11, "seconds": 8.47}
- **PASS** parse_gst_gstr2b_107k.csv: expected=105012 actual=105012
    - {"headers": 12, "seconds": 5.16}
- **PASS** parse_bank_book_105k.csv: expected=105000 actual=105000
    - {"headers": 9, "seconds": 3.85}
- **PASS** parse_bank_statement_106k.csv: expected=106000 actual=106000
    - {"headers": 7, "seconds": 2.51}
- **PASS** parse_ais_26as_portal_50k.csv: expected=50500 actual=50500
    - {"headers": 9, "seconds": 1.37}
- **PASS** parse_ais_books_tds_50k.csv: expected=50000 actual=50000
    - {"headers": 9, "seconds": 3.91}
- **PASS** parse_tds_expense_ledger_100k.csv: expected=100000 actual=100000
    - {"headers": 10, "seconds": 6.09}
- **PASS** parse_tds_payable_15k_debit_balance.csv: expected=15000 actual=15000
    - {"headers": 5, "seconds": 0.14}
- **PASS** parse_variance_prior_tb_10k.csv: expected=10200 actual=10200
    - {"headers": 5, "seconds": 0.32}
- **PASS** parse_variance_current_tb_10k.csv: expected=10200 actual=10200
    - {"headers": 5, "seconds": 0.34}
- **PASS** parse_audit_ledger_152k.csv: expected=152000 actual=152000
    - {"headers": 8, "seconds": 4.05}
- _Timing:_ {"gst_purchase_ledger_100k.csv": 8.47, "gst_gstr2b_107k.csv": 5.16, "bank_book_105k.csv": 3.85, "bank_statement_106k.csv": 2.51, "ais_26as_portal_50k.csv": 1.37, "ais_books_tds_50k.csv": 3.91, "tds_expense_ledger_100k.csv": 6.09, "tds_payable_15k_debit_balance.csv": 0.14, "variance_prior_tb_10k.csv": 0.32, "variance_current_tb_10k.csv": 0.34, "audit_ledger_152k.csv": 4.05}

## gst
- **PASS** books_rows_parsed: expected=100000 actual=100000
- **PASS** gstr2b_rows_parsed: expected=105012 actual=105012
- **PASS** gstr2b_blank_invoice_rows: expected=90 actual=91
- **PASS** gstr2b_duplicate_invoice_rows: expected=2000 actual=1999
- **FAIL** books_unparsed_gstin_rows: expected=0 actual=100000
- **PASS** match_scale_100x100: expected=finite actual=9.2
    - {"seconds": 9.2}
- **PASS** match_scale_200x200: expected=finite actual=41.51
    - {"seconds": 41.51}
- **BLOCKED** match_scale_400x400: expected=finite actual=202.82
    - {"seconds": 202.82}
- **BLOCKED** full_size_scalability: expected=fit_within_30min actual={'eta_minutes': 160940.4}
    - {"eq": "t\u22489.196e-04\u00b7(A\u00b7B) at n_a=100000, n_b=105012", "eta_seconds": 9656425.170679092, "points": [[100, 9.196], [200, 41.513], [400, 202.822]]}
- **PASS** twin_recall_exact: expected=>=0.95 actual=1.0
    - {"twin_pairs_in_slice": 356, "exact_claims": 356, "slice": {"A": 400, "B": 460, "pairs": 184000}, "seconds": 216.45}
- **PASS** steal_rate: expected=low actual=0.0
    - {"steal_claims": 0, "claims": 397, "by_tier": {"exact_invoice": 356, "amount": 33, "amount_tolerance": 5, "date_tolerance": 1, "fuzzy_invoice": 2}}
- **PASS** blank_invoice_sample_parses: expected=row actual=yes
    - {"sample": {"Supplier Name": "Konkan Logistics Services", "GSTIN": "27FFFLK6789L1Z6", "Invoice Number": null, "Invoice Date": "10/08/2025", "Taxable Value": "1908519.88", "CGST": "0", "SGST": "0", "IGST": "534385.57", "Invoice Value": "2442905.45", "GST Rate": "28", "Document Type": "Invoice", "Source": "GSTR-2B", "amount": 1908519.88, "date": "2025-08-10", "invoice": null, "gstin": null, "vendor": "Konkan Logistics Services"}}
- _Timing:_ {"match_100": 9.2, "match_200": 41.51, "match_400": 202.82, "accuracy_slice_400": 216.45}
- _NOTE:_ matcher is O(n²): t≈9.196e-04·(A·B) at n_a=100000, n_b=105012; ETA for full 100k×105k ≈ 160940.4 min

## bank
- **PASS** book_rows_parsed: expected=105000 actual=105000
- **PASS** statement_rows_parsed: expected=106000 actual=106000
- **FAIL** statement_bank_ref_bound_to_ref: expected=2000 actual=147
    - "Bank Ref / Cheque No not mapped to logical 'ref' \u2014 UTR lost"
- **PASS** match_scale_100x100: expected=finite actual=18.52
    - {"seconds": 18.52}
- **PASS** match_scale_200x200: expected=finite actual=59.97
    - {"seconds": 59.97}
- **BLOCKED** match_scale_400x400: expected=finite actual=246.84
    - {"seconds": 246.84}
- **BLOCKED** full_size_scalability: expected=fit_within_30min actual={'eta_minutes': 278105.8}
    - {"eq": "t\u22481.499e-03\u00b7(A\u00b7B) at n_a=105000, n_b=106000", "eta_seconds": 16686350.727438927, "points": [[100, 18.519], [200, 59.969], [400, 246.839]]}
- **PASS** twin_recall_exact: expected=>=0.95 actual=1.0
    - {"twin_pairs_in_slice": 369, "exact_claims": 369, "slice": {"A": 400, "B": 460, "pairs": 184000}, "by_tier": {"exact_invoice": 379, "fuzzy_invoice": 5, "gstin_pan": 11}, "seconds": 274.52}
- **PASS** steal_rate: expected=low actual=0.0
    - {"steal_claims": 0, "claims": 395}
- _Timing:_ {"match_100": 18.52, "match_200": 59.97, "match_400": 246.84, "accuracy_slice_400": 274.51}
- _NOTE:_ Statement 'Bank Ref' header is not mapped to logical 'ref'; the UTR reference column is ignored by the matcher.

## ais_26as
- **PASS** portal_rows_parsed: expected=50500 actual=50500
- **PASS** books_rows_parsed: expected=50000 actual=50000
- **PASS** match_scale_50x50: expected=finite actual=0.15
    - {"seconds": 0.15}
- **PASS** match_scale_100x100: expected=finite actual=0.59
    - {"seconds": 0.59}
- **PASS** match_scale_200x200: expected=finite actual=1.88
    - {"seconds": 1.88}
- **BLOCKED** full_size_scalability: expected=fit_within_30min actual={'eta_minutes': 1981.6}
    - {"eq": "t\u22484.709e-05\u00b7(A\u00b7B) at n_a=50500, n_b=50000", "eta_seconds": 118895.1912522316, "points": [[50, 0.146], [100, 0.593], [200, 1.883]]}
- **PASS** twin_recall_exact: expected=>=0.90 actual=0.9714
    - {"twin_pairs_in_slice": 140, "exact_claims": 136, "slice": {"A": 150, "B": 210, "pairs": 31500}, "by_tier": {"PAN/TAN + TDS": 131, "PAN/TAN + amount": 5, "Amount diff": 14}, "seconds": 1.25}
- **PASS** section_mismatch_surfaced: expected=>0 actual=5
    - {"count": 5, "matched": 131, "note": "section mismatch surfaces as its own metric in _ais_master when identity/amount still match"}
- _Timing:_ {"match_50": 0.15, "match_100": 0.59, "match_200": 1.88, "accuracy_slice_150": 1.25}

## tds
- **PASS** expense_rows_parsed: expected=100000 actual=100000
- **PASS** payable_rows_parsed: expected=15000 actual=15000
- **PASS** single_sided_debit_balance_deposits: expected=>5000 actual=10788
    - {"deposits": 10788, "opening_balance": 0.0}
- **FAIL** full_size_checklist: expected=completed actual=58.19
    - {"seconds": 58.19}
- **FAIL** summary_notDeducted: expected=recorded actual=5925
    - {"value": 5925}
- **FAIL** summary_belowThreshold: expected=recorded actual=1
    - {"value": 1}
- **FAIL** summary_compliant: expected=recorded actual=51618
    - {"value": 51618}
- **FAIL** summary_notDeposited: expected=recorded actual=0
    - {"value": 0}
- **FAIL** summary_transactionCount: expected=recorded actual=100000
    - {"value": 100000}
- **FAIL** summary_hasDeposits: expected=recorded actual=True
    - {"value": true}
- **PASS** single_sided_row_sample: expected=debit_balance actual={'Date': '07/03/2026', 'Debit': '425228.81', 'Balance': '0.0'}
    - {"headers": ["Date", "Particulars", "Voucher No", "Debit", "Balance", "date", "description", "ref"]}
- _Timing:_ {"full_checklist_100k": 58.19}

## tb_variance
- **PASS** prior_rows_parsed: expected=10200 actual=10200
- **PASS** current_rows_parsed: expected=10200 actual=10200
- **FAIL** full_size_variance: expected=completed actual=6.69
    - {"seconds": 6.69}
- **FAIL** summary_totalPrior: expected=recorded actual=10200
    - {"value": 10200}
- **FAIL** summary_totalCurrent: expected=recorded actual=10200
    - {"value": 10200}
- **FAIL** summary_newLedgers: expected=recorded actual=0
    - {"value": 0}
- **FAIL** summary_noMovement: expected=recorded actual=200
    - {"value": 200}
- **FAIL** summary_dropped: expected=recorded actual=200
    - {"value": 200}
- **FAIL** summary_withinThreshold: expected=recorded actual=3542
    - {"value": 3542}
- **FAIL** summary_quickReview: expected=recorded actual=496
    - {"value": 496}
- **FAIL** summary_detailedReview: expected=recorded actual=955
    - {"value": 955}
- **FAIL** summary_obMismatches: expected=recorded actual=10000
    - {"value": 10000}
- **FAIL** summary_totalVarianceAbs: expected=recorded actual=872730909.46
    - {"value": 872730909.46}
- **FAIL** category_counts: expected=recorded actual={'within_threshold': 3542, 'quick_review': 496, 'no_movement': 200, 'dropped': 200, 'detailed_review': 955}
    - {"categories": {"within_threshold": 3542, "quick_review": 496, "no_movement": 200, "dropped": 200, "detailed_review": 955}}
- **PASS** closing_equation_errors_present: expected=detected actual=477
    - {"rows_violating_equation": 477}
- **FAIL** closing_equation_flagged_as_finding: expected=477 actual=0
    - {"note": "engine has no closing-equation/data-integrity finding; 0 flagged"}
- _Timing:_ {"full_variance_10k": 6.69}
- _NOTE:_ 477 rows violate closing equation (opening+debit−credit==closing) but none are flagged as a data-integrity finding.

## audit_analytics
- **PASS** rows_parsed: expected=152000 actual=152000
    - {"seconds": 96.65}
- **NOT_IMPLEMENTED** risk_flagging_engine: expected=implemented actual=NOT_IMPLEMENTED
    - {"note": "no audit-analytics module/endpoint exists in engine or API"}
- _Timing:_ {"parse_152k": 96.65}
- _NOTE:_ 152,000 audit rows parse cleanly but no audit-analytics analysis exists to flag risk indicators (duplicates, round amounts, missing narration, weekends, backdated, splits, etc.).

## concurrency
- **PASS** parallel_jobs_deterministic: expected=True actual=True
    - {"seq_gst": 391, "par_gst1": 391, "par_gst2": 391, "par_tds": 1, "wall": 321.14}

## exports
- **PASS** ais_reconciliation_export: expected=8_sheets actual=8
    - {"sheets": ["Summary", "Matched", "Amount Differences", "Income Mismatch", "Section Mismatch", "Only in 26AS", "Only in Books", "Duplicates"], "size": 23519}
- **PASS** tds_checklist_export: expected=2_sheets actual=2
    - {"sheets": ["TDS Checklist", "Payment Reconciliation"], "size": 10717519}
- **FAIL** variance_export: expected=7_sheets actual=8
    - {"sheets": ["1. Full P&L Analysis", "2. Detailed Review (>20%)", "3. Quick Review (10-20%)", "4. Within Threshold (<10%)", "5. New Ledgers", "6. No Movement", "7. OB Reconciliation", "Summary"], "size": 888040}
- **NOT_IMPLEMENTED** gst_export: expected=implemented actual=NOT_IMPLEMENTED
    - {"note": "no engine endpoint and API /reconciliations/:id/export is AIS-only (400 for gst/bank)"}
- **NOT_IMPLEMENTED** bank_export: expected=implemented actual=NOT_IMPLEMENTED
    - {"note": "same as GST \u2014 no gst/bank reconciliation export exists"}
