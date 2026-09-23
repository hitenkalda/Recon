/** ReconAI shared domain enums. Mirrors the DB enums defined in the TRD. */

/** RBAC roles — coarse-to-fine permission, ascending capability. */
export enum Role {
  FirmAdmin = 'firm_admin',
  Partner = 'partner',
  Senior = 'senior',
  Article = 'article',
  Viewer = 'viewer',
}

export const ROLE_HIERARCHY: Record<Role, number> = {
  [Role.FirmAdmin]: 5,
  [Role.Partner]: 4,
  [Role.Senior]: 3,
  [Role.Article]: 2,
  [Role.Viewer]: 1,
};

/** Client lifecycle. */
export enum ClientStatus {
  Active = 'active',
  Inactive = 'inactive',
  Archived = 'archived',
}

/** Flags surfaced in the client-management filter pills. */
export enum ClientFlag {
  ActiveGST = 'active_gst',
  NeedsRecon = 'needs_recon',
  TaxAudit = 'tax_audit',
}

/** Engagement status lifecycle (per Application Flow §setup-checklist → overview). */
export enum EngagementStatus {
  Draft = 'draft',
  InSetup = 'in_setup',
  InProgress = 'in_progress',
  UnderReview = 'under_review',
  Completed = 'completed',
  Archived = 'archived',
}

/** Document categories. */
export enum DocumentCategory {
  GSTR2B = 'gstr_2b',
  GSTR1 = 'gstr_1',
  GSTR3B = 'gstr_3b',
  BankStatement = 'bank_statement',
  AIS26AS = 'ais_26as',
  PurchaseInvoice = 'purchase_invoice',
  SalesInvoice = 'sales_invoice',
  ExpenseVoucher = 'expense_voucher',
  TrialBalance = 'trial_balance',
  ExpenseLedger = 'expense_ledger', // Tally expense-ledger export (TDS analysis)
  TdsPayable = 'tds_payable', // Tally TDS Payable ledger export
  TdsReceivable = 'tds_receivable', // Tally TDS Receivable ledger (26AS reconcile books side)
  Other = 'other',
}

/**
 * Processing pipeline stages (Application Flow §document-upload).
 * Upload → Store → Scan → Type detect → Extract → OCR → Classify → Map columns →
 * Normalize → Validate → Records ready → Reconcile → Exceptions.
 */
export enum ProcessingStage {
  Uploaded = 'uploaded',
  Stored = 'stored',
  Scanned = 'scanned',
  TypeDetected = 'type_detected',
  Extracting = 'extracting',
  Extracted = 'extracted',
  OcrCompleted = 'ocr_completed',
  Classified = 'classified',
  ColumnsMapped = 'columns_mapped',
  Normalizing = 'normalizing',
  Normalized = 'normalized',
  Validating = 'validating',
  Validated = 'validated',
  RecordsReady = 'records_ready',
  Failed = 'failed',
  Archived = 'archived',
}

/** Job execution states in the queue. */
export enum JobState {
  Queued = 'queued',
  Active = 'active',
  Waiting = 'waiting',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
  Delayed = 'delayed',
}

/** Reconciliation module types. */
export enum ReconType {
  GST = 'gst',
  Bank = 'bank',
  AIS26AS = 'ais_26as',
  Invoice = 'invoice',
  Expense = 'expense',
}

/** A reconciliation item's match status, following the TRD matching order. */
export enum MatchStatus {
  Pending = 'pending',
  ExactInvoice = 'exact_invoice',
  GstinPan = 'gstin_pan',
  Amount = 'amount',
  DateTolerance = 'date_tolerance',
  FuzzyInvoice = 'fuzzy_invoice',
  VendorSimilarity = 'vendor_similarity',
  AmountTolerance = 'amount_tolerance',
  AiAssisted = 'ai_assisted',
  Manual = 'manual',
  Unmatched = 'unmatched',
  // 26AS/AIS tax-recon classifications (paired finds that need review).
  IncomeMismatch = 'income_mismatch',
  SectionMismatch = 'section_mismatch',
  Duplicate = 'duplicate',
}

/** Exception severity. */
export enum Severity {
  Critical = 'critical',
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

/** Exception lifecycle status. */
export enum ExceptionStatus {
  Open = 'open',
  Assigned = 'assigned',
  InReview = 'in_review',
  Resolved = 'resolved',
  Reopened = 'reopened',
}

/** System-wide risk tags (P10 rule engine outputs). */
export enum RiskTag {
  Journal = 'journal',
  SplitTransaction = 'split_transaction',
  WeekendTransaction = 'weekend_transaction',
  RoundNumber = 'round_number',
  Duplicate = 'duplicate',
  Reversal = 'reversal',
  MissingDocument = 'missing_document',
  VendorMismatch = 'vendor_mismatch',
  CalculatedAmountMismatch = 'calculated_amount_mismatch',
  DateOutOfScope = 'date_out_of_scope',
  OutlierAmount = 'outlier_amount',
  RelatedParty = 'related_party',
}

/** Working paper lifecycle status. */
export enum WorkingPaperStatus {
  Draft = 'draft',
  ReadyForReview = 'ready_for_review',
  SeniorSigned = 'senior_signed',
  PartnerSigned = 'partner_signed',
}

/** Report formats. */
export enum ReportFormat {
  PDF = 'pdf',
  XLSX = 'xlsx',
  CSV = 'csv',
}

/** Evidence attachment kinds on exceptions. */
export enum EvidenceKind {
  Document = 'document',
  Note = 'note',
}

/** Audit log intent categories. */
export enum AuditAction {
  Auth = 'auth',
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
  Upload = 'upload',
  Download = 'download',
  Process = 'process',
  Reconcile = 'reconcile',
  Resolve = 'resolve',
  Sign = 'sign',
  Export = 'export',
}

/** AI provider identifiers (never authoritative). */
export enum AiProvider {
  Gemini = 'gemini',
  Qwen = 'qwen',
}

/** AI outcome labelling. */
export enum AiLabel {
  Suggested = 'suggested',
  SuggestedMismatch = 'suggested_mismatch',
  Reviewed = 'reviewed',
  Rejected = 'rejected',
}