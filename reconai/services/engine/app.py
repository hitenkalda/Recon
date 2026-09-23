"""ReconAI Python processing engine — FastAPI application.

Endpoints:
  GET  /health                     liveness probe
  POST /v1/process                  parse + normalize a document (presigned GET url)
  POST /v1/reconcile                deterministic reconciliation between two row sets
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

from fastapi import FastAPI, HTTPException

from engine import parse as parse_mod
from engine import match as match_mod
from engine import tb_variance as tb_mod
from engine import tds_checklist as tds_mod
from engine import tax_workbook as tax_mod
from engine import risk_analysis as risk_mod
from engine.ai_provider import create_ai_manager

logger = logging.getLogger("reconai.engine")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="ReconAI engine", version="0.1.0")


# ── models ──────────────────────────────────────────────────────────────────

class ProcessRequest(BaseModel):
    url: str
    filename: str
    category: Optional[str] = None
    mapping: Optional[Dict[str, str]] = None


class ReconRow(BaseModel):
    index: Optional[int] = None
    data: Dict[str, Any] = Field(default_factory=dict)


class ReconcileRequest(BaseModel):
    runType: str
    rowsA: List[ReconRow] = Field(default_factory=list)
    rowsB: List[ReconRow] = Field(default_factory=list)
    params: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None


class VarianceRequest(BaseModel):
    rowsA: List[ReconRow] = Field(default_factory=list)  # prior-period TB
    rowsB: List[ReconRow] = Field(default_factory=list)  # current-period TB
    config: Optional[Dict[str, Any]] = None


class TdsLedger(BaseModel):
    name: str
    section: str
    tdsCol: Optional[str] = None
    amountCol: Optional[str] = None
    rows: List[ReconRow] = Field(default_factory=list)


class TdsRequest(BaseModel):
    ledgers: List[TdsLedger] = Field(default_factory=list)
    payableRows: List[ReconRow] = Field(default_factory=list)  # TDS Payable ledger
    payableAmountCol: Optional[str] = None
    financialYear: Optional[Dict[str, Any]] = None
    config: Optional[Dict[str, Any]] = None


class RiskAnalysisRequest(BaseModel):
    rows: List[ReconRow] = Field(default_factory=list)
    config: Optional[Dict[str, Any]] = None


class InvoiceVerifyRequest(BaseModel):
    rows: List[ReconRow] = Field(default_factory=list)
    config: Optional[Dict[str, Any]] = None


class ExpenseVerifyRequest(BaseModel):
    rows: List[ReconRow] = Field(default_factory=list)
    config: Optional[Dict[str, Any]] = None


class ClassifyRequest(BaseModel):
    headers: List[str]
    sampleRows: List[Dict[str, Any]]
    filename: str


class ColumnMappingRequest(BaseModel):
    sourceHeaders: List[str]
    targetFields: List[str]


class RiskExplainRequest(BaseModel):
    rowData: Dict[str, Any]
    triggeredRules: List[Dict[str, Any]]


class WorkingPaperDraftRequest(BaseModel):
    context: Dict[str, Any]


class ExceptionSummaryRequest(BaseModel):
    exceptions: List[Dict[str, Any]]


# ── routes ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "service": "reconai-engine", "time": datetime.now(timezone.utc).isoformat()}


@app.post("/v1/process")
async def process_document(req: ProcessRequest) -> Dict[str, Any]:
    """Download the file at `url`, extract tabular rows, normalize and classify."""
    try:
        timeout = httpx.Timeout(120.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(req.url)
            resp.raise_for_status()
            raw = resp.content
    except httpx.HTTPError as e:
        logger.warning("process download failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Could not fetch document: {e}")

    try:
        headers, body, page_count = parse_mod.read_rows(raw, req.filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # pandas/openpyxl etc. — surface as a clean 422
        raise HTTPException(status_code=422, detail=f"Failed to parse file: {e}")

    if headers is None:
        return {
            "columns": [],
            "rows": [],
            "mappingSuggestion": {},
            "classification": {"category": "other", "confidence": 0.3, "reason": "no tabular data found"},
            "pageCount": page_count or 1,
            "warnings": ["No tabular rows could be extracted from this document"],
        }

    mapping = req.mapping or parse_mod.build_mapping_suggestion(headers)
    rows = parse_mod.normalize_rows(headers, body, mapping=mapping)

    columns = [
        {
            "name": h,
            "index": i,
            "type": parse_mod.detect_column_type(h, [str(r["data"].get(h) or "") for r in rows[:50]]),
            "candidates": [h],
        }
        for i, h in enumerate(headers)
    ]

    classification = parse_mod.classify_document(headers, body, req.category)
    warnings: List[str] = []
    if parse_mod.ocr_applied:
        warnings.append("OCR applied to scanned content")
    if not mapping:
        warnings.append("No columns could be mapped to logical fields")
    if sum(1 for r in rows if r.get("status") == "warning"):
        warnings.append("Some rows could not be fully normalized")

    return {
        "columns": columns,
        "rows": rows,
        "mappingSuggestion": mapping,
        "classification": classification,
        "pageCount": page_count or 1,
        "warnings": warnings,
    }


@app.post("/v1/reconcile")
def reconcile(req: ReconcileRequest) -> Dict[str, Any]:
    """Run the deterministic matcher over two row sets."""
    if req.runType not in ("gst", "bank", "ais_26as"):
        raise HTTPException(status_code=422, detail=f"Unsupported runType: {req.runType}")
    a_rows = [{"index": r.index, "data": r.data} for r in req.rowsA]
    b_rows = [{"index": r.index, "data": r.data} for r in req.rowsB]
    try:
        return match_mod.match(req.runType, a_rows, b_rows, params={**(req.params or {}), **(req.config or {})})
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/v1/variance")
def variance_analysis(req: VarianceRequest) -> Dict[str, Any]:
    """Deterministic Trial Balance / P&L variance between two periods."""
    a_rows = [{"index": r.index, "data": r.data} for r in req.rowsA]
    b_rows = [{"index": r.index, "data": r.data} for r in req.rowsB]
    try:
        return tb_mod.analyze_tb(a_rows, b_rows, req.config)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/v1/variance/export")
def variance_export(req: VarianceRequest) -> Dict[str, Any]:
    """Return a base64 XLSX workbook of the variance analysis (7 sheets)."""
    import base64

    a_rows = [{"index": r.index, "data": r.data} for r in req.rowsA]
    b_rows = [{"index": r.index, "data": r.data} for r in req.rowsB]
    client_name = (req.config or {}).get("clientName") or "Client"
    try:
        analysis = tb_mod.analyze_tb(a_rows, b_rows, req.config)
        data = tb_mod.workbook_bytes(analysis, client_name)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"data": base64.b64encode(data).decode("ascii"), "size": len(data),
            "summary": analysis["summary"]}


@app.post("/v1/tds")
def tds_checklist_analysis(req: TdsRequest) -> Dict[str, Any]:
    """Deterministic TDS Compliance Checklist across expense ledgers + payable."""
    ledgers = [
        {"name": lg.name, "section": lg.section, "tdsCol": lg.tdsCol,
         "amountCol": lg.amountCol,
         "rows": [{"index": r.index, "data": r.data} for r in lg.rows]}
        for lg in req.ledgers
    ]
    payable = [{"index": r.index, "data": r.data} for r in req.payableRows]
    fy = req.financialYear
    fy_tuple = (fy.get("from"), fy.get("to")) if fy else None
    try:
        return tds_mod.run_checklist(
            ledgers,
            payable_rows=payable,
            payable_amount_col=req.payableAmountCol,
            financial_year=fy_tuple,
            config=req.config,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/v1/tds/export")
def tds_checklist_export(req: TdsRequest) -> Dict[str, Any]:
    """Return a base64 XLSX workbook (2 sheets: TDS Checklist + Payment Reconciliation)."""
    import base64

    ledgers = [
        {"name": lg.name, "section": lg.section, "tdsCol": lg.tdsCol,
         "amountCol": lg.amountCol,
         "rows": [{"index": r.index, "data": r.data} for r in lg.rows]}
        for lg in req.ledgers
    ]
    payable = [{"index": r.index, "data": r.data} for r in req.payableRows]
    fy = req.financialYear
    fy_tuple = (fy.get("from"), fy.get("to")) if fy else None
    client_name = (req.config or {}).get("clientName") or "Client"
    try:
        analysis = tds_mod.run_checklist(
            ledgers,
            payable_rows=payable,
            payable_amount_col=req.payableAmountCol,
            financial_year=fy_tuple,
            config=req.config,
        )
        data = tds_mod.workbook_bytes(analysis, client_name)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"data": base64.b64encode(data).decode("ascii"), "size": len(data),
            "summary": analysis["summary"]}


@app.post("/v1/ais/export")
def ais_26as_export(req: ReconcileRequest) -> Dict[str, Any]:
    """Return a base64 XLSX workbook of the 26AS/AIS tax reconciliation (8 sheets)."""
    import base64

    if req.runType != "ais_26as":
        raise HTTPException(status_code=422, detail="ais/export requires runType ais_26as")
    a_rows = [{"index": r.index, "data": r.data} for r in req.rowsA]
    b_rows = [{"index": r.index, "data": r.data} for r in req.rowsB]
    client_name = (req.params or {}).get("clientName") or (req.config or {}).get("clientName") or "Client"
    try:
        analysis = match_mod.match("ais_26as", a_rows, b_rows, params={**(req.params or {}), **(req.config or {})})
        analysis["generatedAt"] = datetime.now(timezone.utc).isoformat()
        data = tax_mod.workbook_bytes(analysis, client_name)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"data": base64.b64encode(data).decode("ascii"), "size": len(data),
            "summary": analysis.get("metrics", {}).get("tax", {})}


# ── Phase 10: Risk Analysis ────────────────────────────────────────────────

@app.post("/v1/risk/transactions")
def risk_transactions(req: RiskAnalysisRequest) -> Dict[str, Any]:
    """Analyze transactions for risk (journal entries, bank book, etc.)."""
    rows = [{"index": r.index, "data": r.data} for r in req.rows]
    try:
        return risk_mod.analyze_transactions(rows, req.config)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/v1/risk/invoices")
def risk_invoices(req: InvoiceVerifyRequest) -> Dict[str, Any]:
    """Verify invoices for duplicates, GSTIN validity, tax mismatches."""
    rows = [{"index": r.index, "data": r.data} for r in req.rows]
    try:
        return risk_mod.verify_invoices(rows, req.config)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/v1/risk/expenses")
def risk_expenses(req: ExpenseVerifyRequest) -> Dict[str, Any]:
    """Verify expenses for missing bills, duplicates, personal expenses."""
    rows = [{"index": r.index, "data": r.data} for r in req.rows]
    try:
        return risk_mod.verify_expenses(rows, req.config)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


# ── Phase 11: AI Suggestions ───────────────────────────────────────────────

_ai_manager = None


def get_ai_manager():
    global _ai_manager
    if _ai_manager is None:
        _ai_manager = create_ai_manager()
    return _ai_manager


@app.post("/v1/ai/classify")
async def ai_classify(req: ClassifyRequest) -> Dict[str, Any]:
    """AI-powered document classification suggestion."""
    try:
        mgr = get_ai_manager()
        return await mgr.classify(req.headers, req.sampleRows, req.filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/v1/ai/column-mapping")
async def ai_column_mapping(req: ColumnMappingRequest) -> Dict[str, Any]:
    """AI-powered column mapping suggestion."""
    try:
        mgr = get_ai_manager()
        return await mgr.column_mapping(req.sourceHeaders, req.targetFields)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/v1/ai/explain-risk")
async def ai_explain_risk(req: RiskExplainRequest) -> Dict[str, Any]:
    """AI-generated risk explanation."""
    try:
        mgr = get_ai_manager()
        return await mgr.explain_risk(req.rowData, req.triggeredRules)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/v1/ai/draft-working-paper")
async def ai_draft_wp(req: WorkingPaperDraftRequest) -> Dict[str, Any]:
    """AI-assisted working paper draft."""
    try:
        mgr = get_ai_manager()
        return await mgr.draft_working_paper(req.context)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/v1/ai/exception-summary")
async def ai_exception_summary(req: ExceptionSummaryRequest) -> Dict[str, Any]:
    """AI-generated exception summary."""
    try:
        mgr = get_ai_manager()
        return await mgr.exception_summary(req.exceptions)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))