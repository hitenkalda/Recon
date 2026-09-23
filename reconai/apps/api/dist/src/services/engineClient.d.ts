/**
 * Thin HTTP client for the Python processing engine (FastAPI).
 * The engine is the ONLY component allowed to compute authoritative
 * financial values (parsing, normalization, reconciliation scoring, risk).
 */
export interface ProcessRequest {
    url: string;
    filename: string;
    category?: string;
    mapping?: Record<string, string>;
}
export interface DetectedColumn {
    name: string;
    index?: number;
    type?: string;
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
    classification?: {
        category: string;
        confidence: number;
        reason?: string;
    };
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
    rowsA: ReconRow[];
    rowsB: ReconRow[];
    params: Record<string, unknown>;
    config?: Record<string, unknown>;
}
export interface ReconResult {
    items: Array<{
        recordA?: Record<string, unknown>;
        recordB?: Record<string, unknown>;
        matchStatus: string;
        score: number;
        reasons: string[];
        params?: Record<string, unknown>;
    }>;
    metrics: Record<string, unknown>;
    warnings?: string[];
}
/** Optional liveness probe. */
export declare function engineHealthy(): Promise<boolean>;
export declare const engine: {
    process: (req: ProcessRequest) => Promise<ProcessResult>;
    reconcile: (req: ReconRequest) => Promise<ReconResult>;
};
//# sourceMappingURL=engineClient.d.ts.map