/** ReconAI shared domain enums. Mirrors the DB enums defined in the TRD. */
/** RBAC roles — coarse-to-fine permission, ascending capability. */
export var Role;
(function (Role) {
    Role["FirmAdmin"] = "firm_admin";
    Role["Partner"] = "partner";
    Role["Senior"] = "senior";
    Role["Article"] = "article";
    Role["Viewer"] = "viewer";
})(Role || (Role = {}));
export const ROLE_HIERARCHY = {
    [Role.FirmAdmin]: 5,
    [Role.Partner]: 4,
    [Role.Senior]: 3,
    [Role.Article]: 2,
    [Role.Viewer]: 1,
};
/** Client lifecycle. */
export var ClientStatus;
(function (ClientStatus) {
    ClientStatus["Active"] = "active";
    ClientStatus["Inactive"] = "inactive";
    ClientStatus["Archived"] = "archived";
})(ClientStatus || (ClientStatus = {}));
/** Flags surfaced in the client-management filter pills. */
export var ClientFlag;
(function (ClientFlag) {
    ClientFlag["ActiveGST"] = "active_gst";
    ClientFlag["NeedsRecon"] = "needs_recon";
    ClientFlag["TaxAudit"] = "tax_audit";
})(ClientFlag || (ClientFlag = {}));
/** Engagement status lifecycle (per Application Flow §setup-checklist → overview). */
export var EngagementStatus;
(function (EngagementStatus) {
    EngagementStatus["Draft"] = "draft";
    EngagementStatus["InSetup"] = "in_setup";
    EngagementStatus["InProgress"] = "in_progress";
    EngagementStatus["UnderReview"] = "under_review";
    EngagementStatus["Completed"] = "completed";
    EngagementStatus["Archived"] = "archived";
})(EngagementStatus || (EngagementStatus = {}));
/** Document categories. */
export var DocumentCategory;
(function (DocumentCategory) {
    DocumentCategory["GSTR2B"] = "gstr_2b";
    DocumentCategory["GSTR1"] = "gstr_1";
    DocumentCategory["GSTR3B"] = "gstr_3b";
    DocumentCategory["BankStatement"] = "bank_statement";
    DocumentCategory["AIS26AS"] = "ais_26as";
    DocumentCategory["PurchaseInvoice"] = "purchase_invoice";
    DocumentCategory["SalesInvoice"] = "sales_invoice";
    DocumentCategory["ExpenseVoucher"] = "expense_voucher";
    DocumentCategory["TrialBalance"] = "trial_balance";
    DocumentCategory["ExpenseLedger"] = "expense_ledger";
    DocumentCategory["TdsPayable"] = "tds_payable";
    DocumentCategory["TdsReceivable"] = "tds_receivable";
    DocumentCategory["Other"] = "other";
})(DocumentCategory || (DocumentCategory = {}));
/**
 * Processing pipeline stages (Application Flow §document-upload).
 * Upload → Store → Scan → Type detect → Extract → OCR → Classify → Map columns →
 * Normalize → Validate → Records ready → Reconcile → Exceptions.
 */
export var ProcessingStage;
(function (ProcessingStage) {
    ProcessingStage["Uploaded"] = "uploaded";
    ProcessingStage["Stored"] = "stored";
    ProcessingStage["Scanned"] = "scanned";
    ProcessingStage["TypeDetected"] = "type_detected";
    ProcessingStage["Extracting"] = "extracting";
    ProcessingStage["Extracted"] = "extracted";
    ProcessingStage["OcrCompleted"] = "ocr_completed";
    ProcessingStage["Classified"] = "classified";
    ProcessingStage["ColumnsMapped"] = "columns_mapped";
    ProcessingStage["Normalizing"] = "normalizing";
    ProcessingStage["Normalized"] = "normalized";
    ProcessingStage["Validating"] = "validating";
    ProcessingStage["Validated"] = "validated";
    ProcessingStage["RecordsReady"] = "records_ready";
    ProcessingStage["Failed"] = "failed";
    ProcessingStage["Archived"] = "archived";
})(ProcessingStage || (ProcessingStage = {}));
/** Job execution states in the queue. */
export var JobState;
(function (JobState) {
    JobState["Queued"] = "queued";
    JobState["Active"] = "active";
    JobState["Waiting"] = "waiting";
    JobState["Completed"] = "completed";
    JobState["Failed"] = "failed";
    JobState["Cancelled"] = "cancelled";
    JobState["Delayed"] = "delayed";
})(JobState || (JobState = {}));
/** Reconciliation module types. */
export var ReconType;
(function (ReconType) {
    ReconType["GST"] = "gst";
    ReconType["Bank"] = "bank";
    ReconType["AIS26AS"] = "ais_26as";
    ReconType["Invoice"] = "invoice";
    ReconType["Expense"] = "expense";
})(ReconType || (ReconType = {}));
/** A reconciliation item's match status, following the TRD matching order. */
export var MatchStatus;
(function (MatchStatus) {
    MatchStatus["Pending"] = "pending";
    MatchStatus["ExactInvoice"] = "exact_invoice";
    MatchStatus["GstinPan"] = "gstin_pan";
    MatchStatus["Amount"] = "amount";
    MatchStatus["DateTolerance"] = "date_tolerance";
    MatchStatus["FuzzyInvoice"] = "fuzzy_invoice";
    MatchStatus["VendorSimilarity"] = "vendor_similarity";
    MatchStatus["AmountTolerance"] = "amount_tolerance";
    MatchStatus["AiAssisted"] = "ai_assisted";
    MatchStatus["Manual"] = "manual";
    MatchStatus["Unmatched"] = "unmatched";
    // 26AS/AIS tax-recon classifications (paired finds that need review).
    MatchStatus["IncomeMismatch"] = "income_mismatch";
    MatchStatus["SectionMismatch"] = "section_mismatch";
    MatchStatus["Duplicate"] = "duplicate";
})(MatchStatus || (MatchStatus = {}));
/** Exception severity. */
export var Severity;
(function (Severity) {
    Severity["Critical"] = "critical";
    Severity["High"] = "high";
    Severity["Medium"] = "medium";
    Severity["Low"] = "low";
})(Severity || (Severity = {}));
/** Exception lifecycle status. */
export var ExceptionStatus;
(function (ExceptionStatus) {
    ExceptionStatus["Open"] = "open";
    ExceptionStatus["Assigned"] = "assigned";
    ExceptionStatus["InReview"] = "in_review";
    ExceptionStatus["Resolved"] = "resolved";
    ExceptionStatus["Reopened"] = "reopened";
})(ExceptionStatus || (ExceptionStatus = {}));
/** System-wide risk tags (P10 rule engine outputs). */
export var RiskTag;
(function (RiskTag) {
    RiskTag["Journal"] = "journal";
    RiskTag["SplitTransaction"] = "split_transaction";
    RiskTag["WeekendTransaction"] = "weekend_transaction";
    RiskTag["RoundNumber"] = "round_number";
    RiskTag["Duplicate"] = "duplicate";
    RiskTag["Reversal"] = "reversal";
    RiskTag["MissingDocument"] = "missing_document";
    RiskTag["VendorMismatch"] = "vendor_mismatch";
    RiskTag["CalculatedAmountMismatch"] = "calculated_amount_mismatch";
    RiskTag["DateOutOfScope"] = "date_out_of_scope";
    RiskTag["OutlierAmount"] = "outlier_amount";
    RiskTag["RelatedParty"] = "related_party";
})(RiskTag || (RiskTag = {}));
/** Working paper lifecycle status. */
export var WorkingPaperStatus;
(function (WorkingPaperStatus) {
    WorkingPaperStatus["Draft"] = "draft";
    WorkingPaperStatus["ReadyForReview"] = "ready_for_review";
    WorkingPaperStatus["SeniorSigned"] = "senior_signed";
    WorkingPaperStatus["PartnerSigned"] = "partner_signed";
})(WorkingPaperStatus || (WorkingPaperStatus = {}));
/** Report formats. */
export var ReportFormat;
(function (ReportFormat) {
    ReportFormat["PDF"] = "pdf";
    ReportFormat["XLSX"] = "xlsx";
    ReportFormat["CSV"] = "csv";
})(ReportFormat || (ReportFormat = {}));
/** Evidence attachment kinds on exceptions. */
export var EvidenceKind;
(function (EvidenceKind) {
    EvidenceKind["Document"] = "document";
    EvidenceKind["Note"] = "note";
})(EvidenceKind || (EvidenceKind = {}));
/** Audit log intent categories. */
export var AuditAction;
(function (AuditAction) {
    AuditAction["Auth"] = "auth";
    AuditAction["Create"] = "create";
    AuditAction["Update"] = "update";
    AuditAction["Delete"] = "delete";
    AuditAction["Upload"] = "upload";
    AuditAction["Download"] = "download";
    AuditAction["Process"] = "process";
    AuditAction["Reconcile"] = "reconcile";
    AuditAction["Resolve"] = "resolve";
    AuditAction["Sign"] = "sign";
    AuditAction["Export"] = "export";
})(AuditAction || (AuditAction = {}));
/** AI provider identifiers (never authoritative). */
export var AiProvider;
(function (AiProvider) {
    AiProvider["Gemini"] = "gemini";
    AiProvider["Qwen"] = "qwen";
})(AiProvider || (AiProvider = {}));
/** AI outcome labelling. */
export var AiLabel;
(function (AiLabel) {
    AiLabel["Suggested"] = "suggested";
    AiLabel["SuggestedMismatch"] = "suggested_mismatch";
    AiLabel["Reviewed"] = "reviewed";
    AiLabel["Rejected"] = "rejected";
})(AiLabel || (AiLabel = {}));
//# sourceMappingURL=enums.js.map