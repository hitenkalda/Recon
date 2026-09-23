import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Thin HTTP client for the Python processing engine (FastAPI).
 * The engine is the ONLY component allowed to compute authoritative
 * financial values (parsing, normalization, reconciliation scoring, risk).
 */

export interface ProcessRequest {
  url: string;       // presigned GET URL for the file
  filename: string;
  category?: string; // DocumentCategory hint (can be empty → engine classifies)
  mapping?: Record<string, string>; // explicit column mapping on reprocess
}

export interface DetectedColumn {
  name: string;
  index?: number;
  type?: string; // date | invoice | gstin | pan | amount | text ...
  candidates?: string[];
}

export interface NormalizedRow {
  rowIndex?: number;
  data: Record<string, unknown>;
  confidence?: number;
  status?: 'valid' | 'warning' | 'error';
  warnings?: string[];
}

export interface ProcessResult {
  columns: DetectedColumn[];
  rows: NormalizedRow[];
  mappingSuggestion: Record<string, string>;
  classification?: { category: string; confidence: number; reason?: string };
  pageCount?: number;
  warnings?: string[];
}

export interface ReconRow {
  index: number;
  data: Record<string, unknown>;
}

/** /v1/reconcile request body. The engine matches row-for-row and returns
 *  matched pairs keyed by the index each row was given. */
export interface ReconRequest {
  runType: 'gst' | 'bank' | 'ais_26as';
  rowsA: ReconRow[]; // source A: books / ledger
  rowsB: ReconRow[]; // source B: 2B / statement / 26AS
  params: Record<string, unknown>; // tolerances
  config?: Record<string, unknown>;
}

export interface ReconResult {
  items: Array<{
    recordA?: Record<string, unknown> | null;
    recordB?: Record<string, unknown> | null;
    matchStatus: string;
    score: number;
    reasons: string[];
    matchedBy?: string | null;
    tax?: {
      side?: string;
      name?: string | null;
      pan?: string | null;
      tan?: string | null;
      section?: string | null;
      quarter?: string | null;
      fy?: string | null;
      gross?: number | null;
      tds?: number | null;
      grossA?: number | null;
      grossB?: number | null;
      tdsA?: number | null;
      tdsB?: number | null;
    };
    params?: Record<string, unknown>;
  }>;
  metrics: Record<string, unknown>;
  warnings?: string[];
}

export interface VarianceRequest {
  rowsA: ReconRow[]; // prior-period TB
  rowsB: ReconRow[]; // current-period TB
  config?: Record<string, unknown>; // {plKeywords, plAllLedgers, quickThreshold, detailedThreshold, obTolerance, clientName}
}

export interface VarianceResult {
  results: Array<{
    particulars: string;
    category: string;
    priorClosing: number | null;
    currentClosing: number | null;
    variance: number | null;
    varPct: number | null;
    obMismatch: number | null;
    priorIndex: number | null;
    currentIndex: number | null;
  }>;
  obReconciliation: Array<{ particulars: string; opening: number | null; priorClosing: number | null; mismatch: number | null }>;
  summary: Record<string, unknown>;
  config?: Record<string, unknown>;
}

/** Base64 XLSX workbook from the engine, ready to persist to MinIO. */
export interface VarianceExportResult {
  data: string; // base64 xlsx
  size: number;
  summary: Record<string, unknown>;
}

// ── TDS checklist ───────────────────────────────────────────

export interface TdsLedgerInput {
  name: string;
  section: string; // section key e.g. 194I_land
  tdsCol?: string;
  amountCol?: string;
  rows: ReconRow[];
}

export interface TdsRequest {
  ledgers: TdsLedgerInput[];
  payableRows?: ReconRow[];
  payableAmountCol?: string;
  financialYear?: { from?: number; to?: number };
  config?: Record<string, unknown>;
}

export interface TdsResult {
  results: Array<{
    documentIndex: number | null;
    ledger: string;
    section: string;
    sectionKey: string;
    sectionName: string;
    party: string;
    partyType: string;
    isCompany: boolean;
    date: string | null;
    narration: string;
    voucher: string;
    gross: number;
    cumulative: number;
    rate: number;
    tdsReq: number;
    tdsDed: number;
    diff: number;
    dedStatus: string;
    dedKey: string;
    remark: string;
    quarter: string;
    due: string | null;
    depDate: string | null;
    depAmt: number;
    depStatus: string;
    daysLate: number;
    interest: number;
  }>;
  monthRecon: Array<Record<string, unknown>>;
  monthReconMeta: Record<string, unknown>;
  sectionSummary: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface TdsExportResult {
  data: string; // base64 xlsx
  size: number;
  summary: Record<string, unknown>;
}

/** Base64 XLSX workbook of the 26AS/AIS tax reconciliation (8 sheets). */
export interface AisExportResult {
  data: string; // base64 xlsx
  size: number;
  summary: Record<string, unknown>;
}

class EngineError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'EngineError';
  }
}

async function post<T>(path: string, body: unknown, timeoutMs = 120_000): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.pythonServiceUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new EngineError(`engine ${path} → ${res.status} ${text.slice(0, 200)}`, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof EngineError) throw e;
    const msg = e instanceof Error ? e.message : 'engine unreachable';
    logger.error({ path, msg }, 'engine request failed');
    throw new EngineError(`Engine call to ${path} failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Optional liveness probe. */
export async function engineHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${config.pythonServiceUrl}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Risk analysis ─────────────────────────────────────────

export interface RiskRequest {
  runType: 'transaction' | 'invoice' | 'expense';
  rowsA: ReconRow[];
  rowsB: ReconRow[];
  params: Record<string, unknown>;
  config?: Record<string, unknown>;
}

// ── AI endpoints ──────────────────────────────────────────

export interface AiClassifyRequest {
  headers: string[];
  sampleRows: Record<string, unknown>[];
  filename: string;
}

export interface AiClassifyResult {
  category: string;
  confidence: number;
  reason?: string;
}

export interface AiColumnMappingRequest {
  sourceHeaders: string[];
  targetFields: string[];
}

export interface AiColumnMappingResult {
  mapping: Record<string, string>;
  confidence: number;
  unmapped?: string[];
}

export interface AiExplainRiskRequest {
  rowData: Record<string, unknown>;
  triggeredRules: string[];
}

export interface AiExplainRiskResult {
  explanation: string;
  riskFactors: Array<{ rule: string; severity: string; detail: string }>;
  recommendation?: string;
}

export interface AiDraftWorkingPaperRequest {
  context: Record<string, unknown>;
}

export interface AiDraftWorkingPaperResult {
  title: string;
  content: string;
  sections?: Array<{ heading: string; body: string }>;
}

export interface AiExceptionSummaryRequest {
  exceptions: Array<Record<string, unknown>>;
}

export interface AiExceptionSummaryResult {
  summary: string;
  keyFindings: string[];
  riskLevel: string;
}

export const engine = {
  process: (req: ProcessRequest) => post<ProcessResult>('/v1/process', req, 300_000),
  reconcile: (req: ReconRequest) => post<ReconResult>('/v1/reconcile', req, 180_000),
  analyzeVariance: (req: VarianceRequest) => post<VarianceResult>('/v1/variance', req, 300_000),
  varianceExport: (req: VarianceRequest) => post<VarianceExportResult>('/v1/variance/export', req, 300_000),
  analyzeTds: (req: TdsRequest) => post<TdsResult>('/v1/tds', req, 300_000),
  tdsExport: (req: TdsRequest) => post<TdsExportResult>('/v1/tds/export', req, 300_000),
  aisExport: (req: ReconRequest) => post<AisExportResult>('/v1/ais/export', req, 300_000),
  analyzeRisk: (req: RiskRequest) => post<ReconResult>('/v1/risk', req, 300_000),
  aiClassify: (req: AiClassifyRequest) => post<AiClassifyResult>('/v1/ai/classify', req),
  aiColumnMapping: (req: AiColumnMappingRequest) => post<AiColumnMappingResult>('/v1/ai/column-mapping', req),
  aiExplainRisk: (req: AiExplainRiskRequest) => post<AiExplainRiskResult>('/v1/ai/explain-risk', req),
  aiDraftWorkingPaper: (req: AiDraftWorkingPaperRequest) => post<AiDraftWorkingPaperResult>('/v1/ai/draft-working-paper', req),
  aiExceptionSummary: (req: AiExceptionSummaryRequest) => post<AiExceptionSummaryResult>('/v1/ai/exception-summary', req),
};