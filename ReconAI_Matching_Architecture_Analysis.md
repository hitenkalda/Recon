# ReconAI — Matching Architecture Analysis

**Date:** 2026-09-17
**Module:** `engine/match.py` (738 lines)
**Scope:** GST, Bank, AIS/26AS deterministic reconciliation matchers

---

## 1. Architecture Overview

The matching engine implements three deterministic reconciliation matchers, all sharing a common tiered candidate-generation + greedy-assignment pattern:

```
INPUT: rows_a (e.g. purchase ledger), rows_b (e.g. GSTR-2B)
  ↓
Candidate generation: O(A×B) nested loop produces (tier, score, a_idx, b_idx, reason)
  ↓
Sort candidates by (tier asc, score desc)
  ↓
Greedy one-to-one assignment: each a-row claims its best unused b-row
  ↓
Unmatched a-rows → "unmatched"; unmatched b-rows → "unmatched"
  ↓
Metrics + duplicate detection
```

### Three matchers

| Matcher | Entry point | Candidate generator | Scoring |
|---|---|---|---|
| GST | `match("gst", ...)` | `_candidates_gst` | Tier-based binary (match/no-match per tier) |
| Bank | `match("bank", ...)` | `_candidates_bank` | Tier-based binary |
| AIS/26AS | `match("ais_26as", ...)` | `_ais_master` (inline O(A×B)) | Weighted score 0–100 |

---

## 2. GST Matcher — Detailed Rules

### 2.1 Candidate generation (`_candidates_gst`)

For every (a, b) pair in the O(A×B) nested loop, **the first matching tier wins and `continue`s** — lower tiers are never considered for that pair:

| Tier | Rule | Score | Blocking key needed |
|---:|---|---:|---|
| 1 | `norm_invoice(a) == norm_invoice(b)` AND `amounts_close(a, b, tol_abs, tol_pct)` | 1.0 | normalized invoice + amount |
| 2 | `(a.gstin \|\| a.pan) == (b.gstin \|\| b.pan)` AND `amounts_close(a, b, tol_abs, tol_pct)` | 0.95 | GSTIN/PAN + amount |
| 3 | `amounts_close(a, b, tol_abs, 0.0)` — exact amount only (0% tolerance) | 0.90 | exact amount |
| 4 | `date_diff(a, b) <= date_tol` (3 days) AND `amounts_close(a, b, tol_abs, tol_pct)` | 0.88 | date bucket + amount |
| 5 | `similarity(a.invoice, b.invoice) >= 0.85` AND `amounts_close(a, b, tol_abs, tol_pct)` | 0.85 | fuzzy invoice + amount |
| 6 | `similarity(a.vendor, b.vendor) >= 0.75` AND `amounts_close(a, b, tol_abs, tol_pct)` | 0.80 | vendor name + amount |
| 7 | `amounts_close(a, b, tol_abs, tol_pct)` — amount within 2% | 0.75 | amount bucket |

**Tolerance defaults:**
- `amount_tolerance_pct`: 2.0%
- `amount_tolerance_abs`: ₹1
- `date_tolerance_days`: 3
- `fuzzy_threshold`: 0.85
- `vendor_threshold`: 0.75

**Score scaling** (`_scaled_score`): tiers 1, 2, 5, 6 have their base score reduced by `min(0.2, (amount_diff / amount) * 4)`.

### 2.2 Post-assignment

- Greedy one-to-one: once an a-row or b-row is claimed, it's excluded from further matching.
- Candidates sorted by `(tier asc, -score desc)` — highest-priority tier first, best score within tier.
- Unmatched a-rows → `"unmatched"` with reason "No matching record found on the counterpart side".
- Unmatched b-rows → `"unmatched"` with reason "Record present on counterpart side without a books match (ITC to verify)".

### 2.3 Duplicate detection

After matching, duplicates are detected by `(invoice, amount, gstin)` tuples. Records sharing the same key are flagged. This is a **post-hoc** count, not integrated into the matching logic.

### 2.4 Match statuses produced

`exact_invoice`, `gstin_pan`, `amount`, `date_tolerance`, `fuzzy_invoice`, `vendor_similarity`, `amount_tolerance`, `unmatched`

---

## 3. Bank Matcher — Detailed Rules

### 3.1 Candidate generation (`_candidates_bank`)

| Tier | Rule | Score | Blocking key needed |
|---:|---|---:|---|
| 1 | `amounts_close(a, b, tol_abs, 0.0)` AND (`same_ref` OR `same_date`) | 1.0 | amount + (ref OR date) |
| 2 | `date_diff(a, b) <= date_tol` AND `amounts_close(a, b, tol_abs, tol_pct)` | 0.95 | date bucket + amount |
| 3 | `similarity(a.ref, b.ref) >= 0.85` AND `amounts_close(a, b, tol_abs, tol_pct)` | 0.90 | fuzzy ref + amount |
| 4 | `similarity(a.vendor, b.vendor) >= 0.75` AND `amounts_close(a, b, tol_abs, tol_pct)` | 0.85 | vendor name + amount |
| 5 | `amounts_close(a, b, tol_abs, tol_pct)` — amount within 2% | 0.80 | amount bucket |

**`same_ref`**: `a.ref.upper() == b.ref.upper()` (where ref = `ref` or `description` field).

### 3.2 Post-assignment

Same greedy one-to-one pattern as GST. Match statuses: `exact_invoice`, `date_tolerance`, `fuzzy_invoice`, `vendor_similarity`, `amount_tolerance`, `unmatched`.

### 3.3 Duplicate detection

Same `(invoice, amount, gstin)` post-hoc detection as GST.

---

## 4. AIS/26AS Matcher — Detailed Rules

### 4.1 Architecture difference

AIS does **not** use the shared `_candidates_*` + greedy-assignment pattern. Instead, `_ais_master` implements its own O(A×B) loop with a **weighted scoring** system:

```python
for ai, a in enumerate(a_rows):
    best, best_key, idx = None, (-1.0, inf), -1
    for bi, b in enumerate(b_rows):
        if bi in used_b: continue
        score = _ais_score(a, b, tds_tol)
        if score < gate (40): continue
        if not key_exact and not tds_close and sim < 0.5: continue
        tie = (score, -tds_gap)
        if tie > best_key: best = (b, score, ...); idx = bi
    used_b.add(idx); choices[ai] = best
```

### 4.2 Scoring (`_ais_score`)

Weighted components (max 100):

| Component | Points | Condition |
|---|---:|---|
| PAN/TAN exact match | 35 | `tax_ident(pan or tan)` equal |
| Name similarity ≥ 99.9% | 16 | |
| Name similarity ≥ 75% | 10 | |
| Name similarity ≥ 50% | 6 | |
| Section match | 10 | `section` equal |
| Quarter match | 10 | `quarter` equal |
| FY match (fallback) | 4 | `fy` equal (if quarter differs) |
| Gross within ₹1 | 12 | `|gross_a - gross_b| < 1` |
| Gross within 1% | 8 | `|diff| ≤ max(gross) * 0.01` |
| TDS within tolerance (₹10) | 18 | |
| TDS within 5% | 12 | |
| TDS within 20% | 6 | |

### 4.3 Gate

Score must be ≥ 40 (`_AIS_GATE`). Additionally, if PAN/TAN doesn't match AND TDS isn't close AND name similarity < 0.5, the pair is rejected even if score ≥ 40.

### 4.4 Duplicate detection

Pre-match: within each side (a_rows, b_rows), records with identical `(PAN/TAN, section, quarter, tds_amount, gross_amount)` are flagged as duplicates. Duplicate records still participate in matching but get `matchStatus: "duplicate"` in output.

### 4.5 Match statuses produced

`gstin_pan`, `amount`, `amount_tolerance`, `income_mismatch`, `section_mismatch`, `duplicate`, `unmatched`

---

## 5. Existing Tolerance/Fuzzy Matching Summary

| Function | Implementation | Used by |
|---|---|---|
| `amounts_close(a, b, abs, pct)` | `diff ≤ abs OR diff ≤ max(|a|,|b|) * pct/100` | All matchers |
| `date_diff_days(d1, d2)` | `abs((date.fromisoformat(d1) - date.fromisoformat(d2)).days)` | All matchers |
| `similarity(a, b)` | `1 - levenshtein(a,b) / max(len(a), len(b))` | GST tier 5/6, Bank tier 3/4 |
| `_name_sim(a, b)` | Token overlap + substring bonus | AIS only |
| `normalize_invoice(v)` | `upper().strip().remove whitespace` | GST tier 1 |

---

## 6. One-to-One vs One-to-Many

**All three matchers are strictly one-to-one.** Once an a-row or b-row is claimed, it cannot be claimed by another. This is enforced by `matched_a`/`matched_b` sets (GST/Bank) or `used_b` set (AIS).

**Consequence:** If a duplicate exists on side B, only one of the duplicates will match. The other becomes "unmatched". Duplicate detection is post-hoc and counts duplicates, but does not change matching behavior.

---

## 7. How Already-Matched Records Are Handled

Once matched, a record is excluded from further matching via `matched_a`/`matched_b`/`used_b` sets. The greedy assignment processes candidates in priority order (tier first, then score), so the best match for each a-row is found first.

---

## 8. Complexity Analysis

### Current

| Phase | GST/Bank | AIS |
|---|---|---|
| Candidate generation | O(A × B) | O(A × B) |
| Sorting candidates | O(C log C) where C = candidates | N/A (inline scoring) |
| Greedy assignment | O(C) | O(A × B) (scoring in inner loop) |
| **Total** | **O(A × B)** | **O(A × B)** |

### Target

| Phase | Target |
|---|---|
| Index construction | O(A + B) |
| Candidate generation | O(A × avg_candidates) where avg_candidates ≪ B |
| Scoring | O(A × avg_candidates) |
| **Total** | **O(A + B) + O(A × k)** where k ≪ B |

---

## 9. Key Observations for Optimization

### 9.1 GST matcher

- **Tier 1** (exact invoice): Most matches happen here in clean data. A hash index on `normalize_invoice(invoice)` gives O(1) lookup.
- **Tier 2** (GSTIN/PAN): Second most common. Hash index on `(gstin or pan)` gives O(1) lookup.
- **Tier 3** (exact amount): Requires exact float match. Amount-bucket index (e.g. round to nearest ₹1000) reduces candidates.
- **Tier 4** (date tolerance): Date ±3 days. Date-bucket index (e.g. group by month) + linear scan of ±3 days.
- **Tier 5** (fuzzy invoice): Requires Levenshtein ≥ 0.85. Token-based blocking (first 3 chars, sorted tokens) reduces candidates.
- **Tier 6** (vendor similarity): Requires Levenshtein ≥ 0.75. Token-based blocking.
- **Tier 7** (amount tolerance): Amount within 2%. Amount-bucket index with overlap.

### 9.2 Bank matcher

- **Tier 1** (amount + ref/date): Hash index on `(ref, amount_bucket)` and `(date, amount_bucket)`.
- **Tier 2** (date tolerance): Same as GST tier 4.
- **Tier 3** (fuzzy ref): Token-based blocking on reference.
- **Tier 4** (vendor similarity): Token-based blocking.
- **Tier 5** (amount tolerance): Amount-bucket index.

### 9.3 AIS matcher

- **Primary key**: PAN/TAN. Partition a_rows and b_rows by PAN/TAN. Only compare within same PAN/TAN block.
- **Within block**: Weighted scoring remains the same, but the inner loop is now small (typically 1-10 records per PAN/TAN).
- **No PAN/TAN**: Fallback to amount-based blocking (same as GST tier 3/7).

### 9.4 Cross-cutting concern: amounts_close is the universal gate

Every tier in every matcher requires `amounts_close(...)`. This means **amount is the primary blocking dimension**. Building an amount-bucket index is the single highest-impact optimization.

**Amount bucketing strategy:**
- For exact amounts (tol_abs=₹1): group by `round(amount / 1) * 1` (i.e. exact float).
- For 2% tolerance: group by `round(amount / (amount * 0.02))` or use overlapping buckets of width = 2% of amount.
- Practical approach: round to nearest ₹100 (or adaptive bucket size) and include neighboring buckets.

---

## 10. Stress Test Dataset Characteristics

From the stress benchmark, the test data has:

- **GST**: 100k purchase ledger rows × 105k GSTR-2B rows. Planted exact/invoice/fuzzy matches at various tiers. ~397 matched pairs found in 400×460 slice (recall 100%).
- **Bank**: 105k book rows × 106k statement rows. ~395 matched pairs in 400×460 slice (recall 100%).
- **AIS**: 50.5k portal rows × 50k book rows. ~150 matched pairs in 150×210 slice (recall 97.1%).

The stress test deliberately includes edge cases that exercise every tier and every status. Any optimization must preserve behavior on these edge cases.
