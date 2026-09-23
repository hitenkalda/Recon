# ReconAI Phased Implementation Plan

## Delivery Strategy

Build ReconAI around four reusable foundations:

1.  **Firm, user, client, and engagement tenancy**
2.  **Document ingestion and traceable normalized data**
3.  **Reusable reconciliation and exception workflows**
4.  **Review, working paper, and reporting layers**

GST, Bank, 26AS/AIS, invoice, expense, and journal modules should
consume these shared services rather than implement separate workflows.

assuming the initial release uses rule-based processing and supports a
limited set of standardized input formats.

## Phase 0: Product and Technical Foundation

### Objectives

Finalize the product boundaries, core workflows, data contracts, and
development standards before implementation begins.

### Deliverables

-   Confirm MVP scope
-   Define user permissions matrix
-   Define engagement lifecycle
-   Define document categories and processing states
-   Define reconciliation module interface
-   Define exception status transitions
-   Define audit-log requirements
-   Create initial UX flows and wireframes
-   Create architecture decision records
-   Set up repository standards and environments

### Technical Work

-   Monorepo or clearly separated frontend, API, engine, and worker
    projects
-   TypeScript and Python linting
-   Formatting and type-checking
-   Environment configuration
-   Local PostgreSQL, Redis, and object storage
-   Development, staging, and production configuration strategy
-   API error format
-   Request ID and structured logging format
-   Database migration strategy
-   CI pipeline

### Exit Criteria

-   Core entities and relationships are approved
-   Role permissions are documented
-   API conventions are defined
-   Local development environment starts consistently
-   CI runs linting, type checks, and unit tests

------------------------------------------------------------------------

## Phase 1: Authentication, Firm Tenancy, and Access Control

### Objectives

Establish secure multi-tenant access before building client or
financial-data functionality.

### Deliverables

-   Sign up
-   Login
-   Logout
-   Session handling
-   Password reset
-   Firm creation
-   Firm profile
-   User invitations
-   User activation and deactivation
-   Role-based navigation
-   `/api/auth/me`
-   Audit logging for authentication events

### Roles

-   Firm Admin
-   Partner
-   Senior/Manager
-   Article
-   Viewer

### Technical Work

-   `firms`
-   `users`
-   User invitation records
-   Password reset records
-   Session or refresh-token storage
-   Authorization middleware
-   Firm-scoped repository/query helpers
-   Engagement membership authorization
-   Secure cookie or token strategy
-   Rate limiting for authentication endpoints
-   Password hashing
-   Session expiration

### Required Authorization Rules

Every protected request must validate:

``` text
Authenticated user
Firm membership
Resource ownership by firm
Engagement membership
Role permissions
```

### Exit Criteria

-   Users cannot access another firm's records
-   Viewers cannot mutate data
-   Articles cannot access unassigned engagements
-   Deactivated users cannot create new sessions
-   Authorization tests cover direct object-ID manipulation

------------------------------------------------------------------------

## Phase 2: Client and Engagement Management

### Objectives

Create the hierarchy that owns all documents, reconciliations,
exceptions, and working papers.

### Deliverables

-   Client list
-   Client creation and editing
-   Client archive flow
-   PAN, GSTIN, TAN, and CIN fields
-   Client contacts
-   Duplicate client detection
-   Client history
-   Engagement creation
-   Engagement type and financial year
-   Period and materiality settings
-   Team assignment
-   Engagement status lifecycle
-   Engagement overview page
-   Setup checklist

### Database Tables

-   `clients`
-   `engagements`
-   `engagement_members`

Recommended additions:

-   `client_contacts`
-   `engagement_status_history`
-   `engagement_checklist_items`

### Validation

-   PAN format
-   GSTIN format
-   TAN format
-   Period start before period end
-   Financial year consistency
-   Materiality threshold greater than or equal to zero
-   Duplicate client warning within a firm

### Exit Criteria

-   Admin can create a client and engagement
-   Team members can be assigned
-   Engagements are isolated by firm
-   Engagement lifecycle transitions are enforced
-   Overview page displays setup progress

------------------------------------------------------------------------

## Phase 3: Document Management and Private Storage

### Objectives

Build a reliable document system before implementing reconciliation
logic.

### Deliverables

-   Drag-and-drop upload
-   Multiple-file upload
-   File category selection
-   Upload progress
-   Processing status
-   Document list and filters
-   Document detail page
-   Document preview
-   Secure download
-   Document archive
-   Document replacement
-   Reprocess action
-   Document-to-engagement linking
-   Processing error display

### Supported Initial Formats

-   PDF
-   XLSX
-   XLS
-   CSV

JPG, PNG, and DOCX can be added in the same phase if the extraction
pipeline supports them reliably.

### Technical Work

-   `documents`
-   Private S3 or MinIO bucket
-   Signed download URLs
-   File hash calculation
-   Duplicate file detection
-   File size limits
-   MIME-type validation
-   Virus scanning integration point
-   Upload metadata
-   Document status transitions
-   Storage abstraction layer

### Document State Machine

``` text
UPLOADED
  -> SCANNING
  -> PROCESSING
  -> PROCESSED

PROCESSING
  -> PARTIALLY_PROCESSED
  -> FAILED
  -> RETRYING

PROCESSED
  -> ARCHIVED
```

### Exit Criteria

-   Files are never publicly accessible
-   Duplicate files are detected
-   Upload acknowledgement is fast
-   Users can see actionable processing errors
-   Downloads are authorization-checked and audit-logged

------------------------------------------------------------------------

## Phase 4: Processing Pipeline and Source Data Model

### Objectives

Create the reusable ingestion layer for PDFs, spreadsheets, scanned
documents, and future modules.

### Deliverables

-   File-type detection
-   Excel and CSV table extraction
-   PDF text extraction
-   OCR integration
-   Document classification
-   Header detection
-   Column mapping UI
-   Date normalization
-   Amount normalization
-   GSTIN and PAN normalization
-   Invoice-number normalization
-   Duplicate row detection
-   Processing progress
-   Retry and failure handling
-   Source record traceability

### Database Tables

-   `document_pages`
-   `source_records`

Recommended additions:

-   `processing_jobs`
-   `processing_stages`
-   `column_mappings`
-   `normalization_errors`
-   `source_record_values`

### Source Record Requirements

Each extracted record must retain:

``` text
Document ID
Page number
Row number
Raw values
Normalized values
Extraction confidence
Processing version
```

### Processing Pipeline

``` text
Upload
  -> Scan
  -> Detect type
  -> Extract
  -> OCR if required
  -> Classify
  -> Map columns
  -> Normalize
  -> Validate
  -> Store source records
```

### Exit Criteria

-   A standard Excel register becomes normalized source records
-   A PDF preserves page-level references
-   A failed mapping produces a recoverable error
-   Raw values remain unchanged
-   Normalized values can be regenerated
-   Processing jobs are idempotent

------------------------------------------------------------------------

## Phase 5: Reconciliation Framework

### Objectives

Implement the generic reconciliation framework before adding GST or
Bank-specific logic.

### Deliverables

-   Reconciliation creation flow
-   Source dataset selection
-   Matching configuration
-   Run progress
-   Reconciliation summary
-   Result tabs
-   Match status filters
-   Match score display
-   Source record comparison view
-   Export interface
-   Retry and cancellation handling

### Database Tables

-   `reconciliation_runs`
-   `reconciliation_items`

Recommended additions:

-   `reconciliation_configurations`
-   `reconciliation_metrics`
-   `reconciliation_item_sources`

### Generic Reconciliation Contract

Each module should provide:

``` text
Input validation
Field mapping
Candidate matching
Match scoring
Classification
Exception generation
Summary calculation
Export data
```

### Match Statuses

``` text
EXACT_MATCH
TOLERANCE_MATCH
DATE_TOLERANCE_MATCH
PARTIAL_MATCH
POTENTIAL_MATCH
NO_MATCH
DUPLICATE
```

### Exit Criteria

-   A reconciliation can be created independently of its module
-   Results are paginated
-   Source records are traceable
-   Matching configuration is persisted
-   A module can create results through the shared framework

------------------------------------------------------------------------

## Phase 6: GST Reconciliation

### Objectives

Deliver the first production-grade reconciliation module and validate
the shared architecture.

### Initial Supported Reconciliations

1.  Purchase register versus GSTR-2B
2.  Sales register versus GSTR-1
3.  Books versus GSTR-3B

### Deliverables

-   GST-specific column mapping
-   GSTIN normalization and validation
-   Invoice-number normalization
-   Taxable value matching
-   IGST matching
-   CGST matching
-   SGST matching
-   Invoice-date tolerance
-   Duplicate invoice detection
-   Tax-period comparison
-   GST result summary
-   Exception creation from unmatched items
-   GST export report

### Matching Sequence

``` text
GSTIN
  -> Invoice number
  -> Invoice date
  -> Taxable value
  -> Total tax
  -> Tax component comparison
```

### GST Exception Types

-   Invoice missing in GSTR-2B
-   Invoice missing in books
-   Taxable value mismatch
-   IGST mismatch
-   CGST mismatch
-   SGST mismatch
-   GSTIN mismatch
-   Duplicate invoice
-   Wrong tax period
-   Credit/debit note mismatch

### Exit Criteria

-   Users can select two GST datasets
-   Matching results are deterministic
-   Differences show source A and source B values
-   Summary totals reconcile with detailed rows
-   Exceptions retain source page and row references
-   XLSX and CSV exports work

------------------------------------------------------------------------

## Phase 7: Bank Reconciliation

### Objectives

Add transaction-oriented reconciliation using the shared matching and
exception framework.

### Deliverables

-   Bank statement import
-   Bank book or ledger import
-   Debit and credit normalization
-   Reference and cheque number extraction
-   UTR matching
-   Date and amount tolerance configuration
-   Outstanding deposits
-   Outstanding payments
-   Duplicate detection
-   Reversal detection
-   Round-number detection
-   Weekend/holiday detection
-   Bank reconciliation statement
-   Bank working paper draft

### Matching Sequence

``` text
Reference / UTR / cheque number
  -> Amount and direction
  -> Transaction date
  -> Counterparty
  -> Description similarity
```

### Database Work

Use `source_records` and `reconciliation_items` for matching. Add
`transactions` only after a normalized transaction model is stable.

### Exit Criteria

-   Bank and book balances are calculated
-   Matched and unmatched transactions are visible
-   Outstanding items are classified
-   Net difference is shown
-   Risk indicators are explainable
-   Bank reconciliation report can be exported

------------------------------------------------------------------------

## Phase 8: 26AS/AIS Tax Reconciliation

### Objectives

Build the tax reconciliation engine after the generic pipeline has
proven it can support multiple schemas.

### Initial Supported Inputs

-   26AS
-   AIS
-   TDS ledger
-   Income ledger
-   Trial balance

### Deliverables

-   26AS parser
-   AIS parser
-   TIS parser, if input format requires it
-   PAN and TAN normalization
-   Section normalization
-   Quarter and financial-year normalization
-   Deductor-wise matching
-   Section-wise matching
-   Gross amount matching
-   TDS amount matching
-   TDS receivable comparison
-   Tax credit loss summary
-   Income mismatch summary
-   Tax-specific exceptions

### Matching Sequence

``` text
PAN
  -> Deductor TAN
  -> Section
  -> Financial year and quarter
  -> Gross amount
  -> TDS amount
```

### Output Views

-   Overview
-   Matched
-   TDS missing in books
-   TDS missing in 26AS
-   Income mismatch
-   Section mismatch
-   Duplicates
-   High risk

### Exit Criteria

-   Portal records and book records are separately identifiable
-   TDS and gross income totals are accurate
-   Section-wise and deductor-wise summaries work
-   Missing tax credit is clearly distinguished from data mismatch
-   All findings link back to source records

------------------------------------------------------------------------

## Phase 9: Exception Management and Review Workflow

### Objectives

Turn reconciliation findings into a controlled review process.

### Deliverables

-   Exception queue
-   Filtering by module, risk, status, and assignee
-   Exception detail page
-   Assignment
-   Comments
-   Internal notes
-   Client evidence requests
-   Evidence upload
-   Related transaction links
-   Related document links
-   Status transitions
-   Risk-level changes
-   Resolution options
-   Reopen flow
-   Senior approval
-   Partner approval
-   Complete activity history

### Exception State Rules

``` text
Open
  -> Assigned
  -> In Progress
  -> Waiting for Client
  -> Resolved
  -> Approved
  -> Closed
```

Alternative paths:

``` text
In Progress -> Accepted Risk
In Progress -> Escalated
Resolved -> Reopened
Senior Review -> Returned for Changes
```

### Approval Controls

-   Articles cannot close high-risk or critical exceptions
-   Senior approval is required for material exceptions
-   Partner approval is required before final engagement completion
-   Reopening a closed exception creates an audit-log event

### Exit Criteria

-   Every exception has an owner and history
-   Evidence is access-controlled
-   High-risk closure restrictions work
-   Status transitions are validated server-side
-   Users can trace an exception to source data

------------------------------------------------------------------------

## Phase 10: Transaction Risk, Invoice, and Expense Analysis

### Objectives

Add rule-based risk detection after source normalization and exception
workflows are stable.

### Transaction Risk Deliverables

-   Journal and ledger ingestion
-   Rule execution framework
-   Risk score calculation
-   Risk level classification
-   Rule explanation display
-   Related document lookup
-   Transaction-to-exception flow

### Initial Rules

-   Period-end manual journal
-   Backdated entry
-   Round-number entry
-   Missing narration
-   Large one-time transaction
-   Reversal after period close
-   Repeated identical amounts
-   Unusual account combination
-   High-value cash transaction
-   Negative balance
-   Unusual month-end movement

### Invoice Verification Deliverables

-   Invoice field extraction
-   Ledger comparison
-   Duplicate invoice detection
-   GSTIN validation
-   Tax arithmetic validation
-   Period validation
-   Invoice sequence anomaly detection
-   Low-quality or incomplete document flagging

### Expense Verification Deliverables

-   Expense ledger comparison
-   Bill matching
-   Bank/cash matching
-   Missing bill detection
-   Duplicate bill detection
-   Personal-looking expense flagging
-   Weekend/holiday check
-   High-value and round-number checks
-   Split transaction detection
-   Approval evidence check

### Risk Design

Use explainable additive scoring:

``` text
Rule triggered
  -> Evidence collected
  -> Score contribution
  -> Risk score
  -> Risk level
  -> Human review required
```

### Exit Criteria

-   Rules are versioned
-   Each risk score shows triggered rules
-   Findings do not claim fraud
-   Users can create exceptions from findings
-   Rule results are repeatable

------------------------------------------------------------------------

## Phase 11: AI-Assisted Features

### Objectives

Introduce AI only where it improves interpretation, classification, or
explanation without becoming authoritative.

### LLM Provider Strategy

Use a provider abstraction so the product is not locked to a single LLM.

-   Primary LLM: Gemini Flash via Google AI Studio
-   Fallback LLM: Qwen 27B via Groq
-   The application must be able to switch between providers without changing business logic.
-   LLM calls must be isolated behind an AI service/provider interface.
-   Deterministic accounting and reconciliation calculations must not depend on an LLM.

### Initial AI Use Cases

-   Document classification suggestions
-   Column mapping suggestions
-   Invoice field extraction assistance
-   Narration explanation
-   Risk explanation
-   Exception summary generation
-   Suggested client queries
-   Working paper draft assistance

### AI Guardrails

-   Send only minimum required data
-   Mask sensitive values where possible
-   Include engagement and firm scope in service-layer checks
-   Treat document content as untrusted input
-   Validate structured responses against schemas
-   Store model version and timestamp
-   Store confidence
-   Require human approval
-   Never overwrite deterministic accounting values
-   Never close exceptions automatically

### Exit Criteria

-   AI outputs are clearly labeled
-   Low-confidence results are visible
-   Source references are preserved
-   Prompt-injection test cases exist
-   Invalid model responses fail safely
-   Human approval status is stored

------------------------------------------------------------------------

## Phase 12: Working Papers and Reports

### Objectives

Generate review-ready audit documentation from system activity.

### Working Paper Templates

-   GST reconciliation
-   Bank reconciliation
-   26AS/AIS reconciliation
-   Invoice verification
-   Expense verification
-   Journal-entry analysis
-   Exception summary
-   Senior review checklist
-   Partner sign-off summary

### Deliverables

-   Working paper generation
-   Source document links
-   Source row and page references
-   Procedure selection
-   Records tested
-   Exceptions identified
-   Management responses
-   Reviewer comments
-   Conclusion field
-   Review status workflow
-   PDF export
-   XLSX export where appropriate
-   Working paper pack generation

### Status Workflow

``` text
Draft
  -> Prepared
  -> Submitted for Review
  -> Review Comments
  -> Reviewed
  -> Approved
  -> Final
```

### Report Deliverables

-   GST report
-   Bank report
-   26AS/AIS report
-   Transaction risk report
-   Exception report
-   Review status report
-   Client request report
-   Working paper pack

### Exit Criteria

-   Reports reconcile to underlying records
-   Source references are clickable or identifiable
-   Draft and final versions are distinguishable
-   Approval history is retained
-   Export permissions are enforced

------------------------------------------------------------------------

## Phase 13: Dashboard, Tasks, and Engagement Monitoring

### Objectives

Provide role-specific visibility across active work.

### Dashboard Views

#### Article

-   Assigned engagements
-   Processing files
-   Open assigned exceptions
-   Client evidence requests
-   Pending tasks

#### Senior

-   Review queue
-   High-risk exceptions
-   Reconciliation completion
-   Working papers awaiting review
-   Exceptions returned for changes

#### Partner

-   Engagement progress
-   Risk heatmap
-   Material unresolved exceptions
-   Working papers awaiting approval
-   Due dates and overdue engagements

#### Firm Admin

-   Active clients
-   Active engagements
-   Team workload
-   Storage usage
-   Subscription status
-   Processing failures

### Exit Criteria

-   Dashboard metrics match underlying data
-   Filters work by firm and engagement permissions
-   Progress calculation is deterministic
-   Pending actions link to the relevant workflow

------------------------------------------------------------------------

## Phase 14: Hardening and Production Readiness

### Security

-   Tenant-isolation testing
-   Object-level authorization testing
-   Signed URL expiration testing
-   Malware scanning validation
-   Session expiry testing
-   Rate limiting
-   Secret management
-   Dependency scanning
-   Backup encryption
-   Data deletion workflow
-   AI data-minimization review

### Reliability

-   Job retry tests
-   Dead-letter queue handling
-   Idempotency tests
-   Processing checkpoint recovery
-   Duplicate file tests
-   Worker restart tests
-   Database migration rollback strategy
-   Storage failure handling

### Performance

-   Dashboard load testing
-   Reconciliation pagination testing
-   Large CSV/XLSX processing
-   Concurrent upload tests
-   Queue throughput tests
-   Database query profiling
-   Index validation

### Auditability

Verify logs for:

``` text
Login
Upload
Download
Archive
Reprocess
Reconciliation execution
Exception creation
Assignment
Comment
Evidence upload
Status change
Approval
Report generation
Working paper export
```

### Exit Criteria

-   No critical authorization issues
-   Background failures are visible and recoverable
-   Large datasets do not block API requests
-   Backups have been restored successfully in a test environment
-   Production alerts and dashboards are configured
-   MVP acceptance tests pass

------------------------------------------------------------------------

# Recommended Release Sequence

## Internal Alpha

Includes:

-   Authentication
-   Firm tenancy
-   Clients
-   Engagements
-   Document upload
-   Excel/CSV processing
-   GST reconciliation
-   Basic exceptions

Target users:

-   Internal product team
-   One controlled CA firm

## Private Beta

Adds:

-   PDF and OCR processing
-   Bank reconciliation
-   26AS/AIS reconciliation
-   Evidence and comments
-   Senior review
-   Basic reports
-   Audit logs

Target users:

-   3-5 CA firms
-   Controlled document formats
-   Manual support during onboarding

## MVP Release

Adds:

-   Invoice verification
-   Expense verification
-   Transaction risk analysis
-   Working papers
-   Partner approval
-   PDF/XLSX exports
-   Production hardening
-   Monitoring and backup validation

## Post-MVP

Prioritize based on actual usage:

1.  Tally integration
2.  Better document classification
3.  Custom reconciliation rules
4.  Client portal
5.  Email and WhatsApp notifications
6.  Advanced review analytics
7.  Bulk engagement setup
8.  Firm-level templates
9.  Additional Indian tax workflows
10. Digital signatures and formal approvals

# Cross-Phase Engineering Standards

## API Standards

-   Version APIs if breaking changes are expected
-   Use consistent pagination
-   Return request IDs
-   Validate all inputs with schemas
-   Use consistent error codes
-   Enforce authorization in the API layer
-   Never expose storage keys directly

## Data Standards

-   Store raw and normalized values separately
-   Preserve source references
-   Version normalization logic
-   Use decimal-safe numeric types for financial amounts
-   Store dates with explicit timezone or business-period rules
-   Avoid floating-point arithmetic for accounting values
-   Use immutable processing outputs where possible

## Job Standards

Every asynchronous job should have:

``` text
Job type
Firm ID
Engagement ID
Input IDs
Idempotency key
Attempt count
Progress
Status
Failure reason
Created by
Started at
Completed at
```

## Testing Standards

Each module should include:

-   Parser tests
-   Normalization tests
-   Matching tests
-   Tolerance-boundary tests
-   Duplicate detection tests
-   Exception-generation tests
-   Authorization tests
-   Export validation tests
-   Large-file tests
-   Failure and retry tests

# Initial Backlog by Epic

## Epic 1: Platform Foundation

-   Repository setup
-   Environments
-   CI
-   Database migrations
-   Logging
-   Error handling
-   Configuration management

## Epic 2: Identity and Access

-   Registration
-   Login
-   Password reset
-   Firm setup
-   Invitations
-   Roles
-   Permissions
-   Audit logs

## Epic 3: Client and Engagements

-   Client CRUD
-   Engagement CRUD
-   Team assignment
-   Status lifecycle
-   Setup checklist

## Epic 4: Documents

-   Upload
-   Storage
-   Scanning
-   Categorization
-   Preview
-   Download
-   Archive
-   Reprocess

## Epic 5: Processing

-   Excel parser
-   CSV parser
-   PDF parser
-   OCR
-   Classification
-   Column mapping
-   Normalization
-   Source records

## Epic 6: Reconciliation Core

-   Run creation
-   Matching configuration
-   Matching results
-   Progress tracking
-   Pagination
-   Summary metrics
-   Export abstraction

## Epic 7: GST

-   GST parsers
-   GST normalization
-   Invoice matching
-   Tax matching
-   Duplicate detection
-   GST exceptions
-   GST reports

## Epic 8: Bank

-   Transaction normalization
-   Bank matching
-   Outstanding items
-   Bank risk rules
-   Bank report

## Epic 9: Tax Reconciliation

-   26AS parser
-   AIS parser
-   TDS matching
-   Income matching
-   Tax exceptions
-   Tax summaries

## Epic 10: Exception Workflow

-   Exception queue
-   Assignment
-   Comments
-   Evidence
-   Status transitions
-   Review and approval
-   Activity history

## Epic 11: Risk and Verification

-   Risk rule engine
-   Journal analysis
-   Invoice verification
-   Expense verification
-   Risk explanations
-   Exception integration

## Epic 12: Documentation and Reporting

-   Working paper templates
-   Review workflow
-   PDF export
-   XLSX/CSV export
-   Report pack generation

## Epic 13: Production Readiness

-   Security testing
-   Performance testing
-   Queue monitoring
-   Backup restore
-   Alerting
-   Operational runbooks

# Key Risks and Mitigations

  ---------------------------------------------------------------------
  Risk                               Mitigation
  ---------------------------------- ----------------------------------
  Inconsistent client files          Start with column mapping and
                                     supported templates

  OCR inaccuracies                   Show confidence and require review
                                     for low-confidence fields

  Incorrect financial matching       Use deterministic rules before AI

  Cross-tenant data exposure         Centralize authorization and test
                                     object-level access

  Long-running processing            Use workers, progress tracking,
                                     retries, and checkpoints

  Unexplainable risk scores          Versioned additive rules with
                                     visible reasons

  AI hallucinations                  Structured schemas, source
                                     references, and human approval

  Scope expansion                    Keep Tally, filing, notifications,
                                     and advanced fraud analysis
                                     deferred

  Poor senior adoption               Prioritize review queues, evidence
                                     links, and concise summaries

  Report inconsistency               Generate reports from immutable
                                     reconciliation and exception data
  ---------------------------------------------------------------------

# Definition of MVP Completion

ReconAI is ready for MVP release when a permitted user can:

1.  Create a firm, client, and engagement.
2.  Assign engagement team members.
3.  Upload and privately store source documents.
4.  Process Excel, CSV, and PDF inputs.
5.  Trace normalized records to source rows or pages.
6.  Run GST, Bank, and 26AS/AIS reconciliations.
7.  Review matched, unmatched, duplicate, and risky records.
8.  Create and assign exceptions.
9.  Add comments and evidence.
10. Route high-risk findings through senior and partner approval.
11. Generate working papers and reports.
12. View all material actions in an audit log.
13. Complete these workflows without unauthorized users accessing the
    engagement or its files.
