import { z } from 'zod';
/** Update one recon item's match state (manual match / mismatch override). */
export declare const reconItemUpdateSchema: z.ZodObject<{
    runId: z.ZodString;
    itemId: z.ZodString;
    action: z.ZodEnum<["manual_match", "unmatch", "apply_ai", "reject_ai", "flag_exception"]>;
    targetItemId: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    runId: string;
    itemId: string;
    action: "manual_match" | "unmatch" | "apply_ai" | "reject_ai" | "flag_exception";
    note?: string | undefined;
    targetItemId?: string | undefined;
}, {
    runId: string;
    itemId: string;
    action: "manual_match" | "unmatch" | "apply_ai" | "reject_ai" | "flag_exception";
    note?: string | undefined;
    targetItemId?: string | undefined;
}>;
export declare const exceptionCreateSchema: z.ZodObject<{
    runId: z.ZodString;
    kind: z.ZodEnum<["missing_invoice", "amount_mismatch", "duplicate", "unmatched_entry", "itc_not_available", "itc_blocked", "tax_credit_lost", "gstin_mismatch", "vendor_mismatch", "date_mismatch", "risk_signal", "other"]>;
    severity: z.ZodEnum<["critical", "high", "medium", "low"]>;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    referenceItemIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    title: string;
    kind: "other" | "duplicate" | "vendor_mismatch" | "missing_invoice" | "amount_mismatch" | "unmatched_entry" | "itc_not_available" | "itc_blocked" | "tax_credit_lost" | "gstin_mismatch" | "date_mismatch" | "risk_signal";
    runId: string;
    severity: "critical" | "high" | "medium" | "low";
    referenceItemIds: string[];
    description?: string | undefined;
}, {
    title: string;
    kind: "other" | "duplicate" | "vendor_mismatch" | "missing_invoice" | "amount_mismatch" | "unmatched_entry" | "itc_not_available" | "itc_blocked" | "tax_credit_lost" | "gstin_mismatch" | "date_mismatch" | "risk_signal";
    runId: string;
    severity: "critical" | "high" | "medium" | "low";
    description?: string | undefined;
    referenceItemIds?: string[] | undefined;
}>;
export declare const exceptionUpdateSchema: z.ZodObject<{
    exceptionId: z.ZodString;
    status: z.ZodOptional<z.ZodEnum<["open", "assigned", "in_review", "resolved", "reopened"]>>;
    assigneeId: z.ZodOptional<z.ZodString>;
    comment: z.ZodOptional<z.ZodString>;
    evidenceDocumentIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    resolution: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    exceptionId: string;
    status?: "open" | "assigned" | "in_review" | "resolved" | "reopened" | undefined;
    assigneeId?: string | undefined;
    comment?: string | undefined;
    evidenceDocumentIds?: string[] | undefined;
    resolution?: string | undefined;
}, {
    exceptionId: string;
    status?: "open" | "assigned" | "in_review" | "resolved" | "reopened" | undefined;
    assigneeId?: string | undefined;
    comment?: string | undefined;
    evidenceDocumentIds?: string[] | undefined;
    resolution?: string | undefined;
}>;
export declare const workingPaperCreateSchema: z.ZodObject<{
    engagementId: z.ZodString;
    clientId: z.ZodString;
    title: z.ZodString;
    deliverable: z.ZodEnum<["gst_reconciliation", "bank_reconciliation", "ais_reconciliation", "exception_summary", "risk_report", "tax_credit"]>;
    runId: z.ZodOptional<z.ZodString>;
    procedures: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    conclusion: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    clientId: string;
    title: string;
    engagementId: string;
    deliverable: "gst_reconciliation" | "bank_reconciliation" | "ais_reconciliation" | "exception_summary" | "risk_report" | "tax_credit";
    procedures: string[];
    conclusion?: string | undefined;
    runId?: string | undefined;
}, {
    clientId: string;
    title: string;
    engagementId: string;
    deliverable: "gst_reconciliation" | "bank_reconciliation" | "ais_reconciliation" | "exception_summary" | "risk_report" | "tax_credit";
    conclusion?: string | undefined;
    runId?: string | undefined;
    procedures?: string[] | undefined;
}>;
export declare const workingPaperUpdateSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    procedures: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    conclusion: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["draft", "ready_for_review", "senior_signed", "partner_signed"]>>;
    reviewerNote: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    status?: "draft" | "ready_for_review" | "senior_signed" | "partner_signed" | undefined;
    title?: string | undefined;
    conclusion?: string | undefined;
    procedures?: string[] | undefined;
    reviewerNote?: string | undefined;
}, {
    id: string;
    status?: "draft" | "ready_for_review" | "senior_signed" | "partner_signed" | undefined;
    title?: string | undefined;
    conclusion?: string | undefined;
    procedures?: string[] | undefined;
    reviewerNote?: string | undefined;
}>;
export declare const exportSchema: z.ZodObject<{
    runId: z.ZodOptional<z.ZodString>;
    exceptionId: z.ZodOptional<z.ZodString>;
    workingPaperId: z.ZodOptional<z.ZodString>;
    reportId: z.ZodOptional<z.ZodString>;
    format: z.ZodEnum<["pdf", "xlsx", "csv"]>;
}, "strict", z.ZodTypeAny, {
    format: "pdf" | "xlsx" | "csv";
    runId?: string | undefined;
    exceptionId?: string | undefined;
    workingPaperId?: string | undefined;
    reportId?: string | undefined;
}, {
    format: "pdf" | "xlsx" | "csv";
    runId?: string | undefined;
    exceptionId?: string | undefined;
    workingPaperId?: string | undefined;
    reportId?: string | undefined;
}>;
export type ReconItemUpdateInput = z.infer<typeof reconItemUpdateSchema>;
export type ExceptionCreateInput = z.infer<typeof exceptionCreateSchema>;
export type ExceptionUpdateInput = z.infer<typeof exceptionUpdateSchema>;
export type WorkingPaperCreateInput = z.infer<typeof workingPaperCreateSchema>;
export type WorkingPaperUpdateInput = z.infer<typeof workingPaperUpdateSchema>;
//# sourceMappingURL=reconciliation.d.ts.map