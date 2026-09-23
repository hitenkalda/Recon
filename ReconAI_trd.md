# ReconAI --- Technical Requirements Document

### 2.1 Recommended Architecture

                         Web Browser
                              |
                        Next.js Frontend
                              |
                        Node.js API Layer
                              |
           --------------------------------------------
           |                    |                     |
     PostgreSQL              Redis/BullMQ       MinIO/S3
           |                    |                     |
           |              Background Workers       |
           |                    |                     |
           |              Python FastAPI Engine
           |                    |
           |        Extraction / Reconciliation / AI
           |                    |
           -------- AI Provider Layer ------------------
                       |               |
                 Gemini Flash     Qwen 27B / Groq

### 2.2 Technology Stack

#### Frontend

-   Next.js
-   TypeScript
-   React
-   Tailwind CSS or existing design system
-   TanStack Query
-   React Hook Form
-   Zod
-   Data table component
-   Charting library
-   PDF preview component

#### Backend

-   Node.js
-   Express
-   TypeScript
-   REST API
-   JWT or secure cookie sessions
-   PostgreSQL client or Prisma
-   Redis
-   BullMQ
-   OpenAPI documentation

#### Reconciliation Engine

-   Python
-   FastAPI
-   Pandas
-   Polars for large datasets
-   Pydantic
-   OpenPyXL
-   PyMuPDF
-   OCR engine
-   Rule-based matching
-   AI provider abstraction
-   Gemini Flash via Google AI Studio as primary LLM
-   Qwen 27B via Groq as fallback LLM
-   AI service interface so providers can be switched without changing reconciliation business logic

#### Storage

-   PostgreSQL for structured application data
-   MinIO or S3 for documents
-   Redis for queues, locks and temporary state

------------------------------------------------------------------------

### 2.3 Service Boundaries

## Frontend Service

Responsibilities:

-   Authentication UI
-   Dashboard
-   Client and engagement screens
-   Upload interface
-   Reconciliation tables
-   Exception workflow
-   Review screens
-   Reports

The frontend must not contain authoritative reconciliation logic.

## Node.js API

Responsibilities:

-   Authentication
-   Authorization
-   Firm and user management
-   Client and engagement APIs
-   Upload initialization
-   Signed storage URLs
-   Job creation
-   Exception workflow
-   Comments
-   Audit logs
-   Report access

## Python Engine

Responsibilities:

-   File parsing
-   OCR orchestration
-   Data normalization
-   Data validation
-   Record matching
-   GST reconciliation
-   Bank reconciliation
-   26AS/AIS reconciliation
-   Invoice checks
-   Expense checks
-   Journal analysis
-   Risk scoring
-   AI-assisted classification

## Worker Service

Responsibilities:

-   Execute asynchronous jobs
-   Retry failures
-   Update progress
-   Call Python engine
-   Generate reports
-   Trigger notifications later

------------------------------------------------------------------------

### 2.4 Processing Pipeline

    Upload file
       |
    Create document record
       |
    Store original file
       |
    Virus scan
       |
    Detect file type
       |
    Extract text/table data
       |
    OCR if required
       |
    Classify document
       |
    Map columns
       |
    Normalize values
       |
    Validate records
       |
    Store source records
       |
    Run selected reconciliation
       |
    Generate matches
       |
    Generate exceptions
       |
    Calculate risk
       |
    Create summary
       |
    Update dashboard

Every processing stage should have a status.

    QUEUED
    PROCESSING
    COMPLETED
    FAILED
    RETRYING

------------------------------------------------------------------------

### 2.5 Database Design

#### `firms`

    id
    name
    slug
    plan
    status
    created_at
    updated_at

#### `users`

    id
    firm_id
    name
    email
    password_hash
    role
    status
    last_login_at
    created_at
    updated_at

#### `clients`

    id
    firm_id
    name
    legal_name
    entity_type
    pan
    gstin
    tan
    cin
    industry
    address
    status
    created_at
    updated_at

#### `engagements`

    id
    firm_id
    client_id
    name
    type
    financial_year
    period_start
    period_end
    materiality_threshold
    status
    due_date
    created_by
    created_at
    updated_at

#### `engagement_members`

    id
    engagement_id
    user_id
    role
    created_at

#### `documents`

    id
    firm_id
    client_id
    engagement_id
    name
    category
    mime_type
    storage_key
    file_hash
    size_bytes
    status
    processing_error
    uploaded_by
    created_at
    updated_at

#### `document_pages`

    id
    document_id
    page_number
    text_content
    image_storage_key
    ocr_confidence
    created_at

#### `source_records`

    id
    document_id
    engagement_id
    record_type
    source_row_number
    source_page_number
    raw_data
    normalized_data
    extraction_confidence
    created_at

#### `reconciliation_runs`

    id
    engagement_id
    module
    source_a_id
    source_b_id
    status
    configuration
    summary
    started_at
    completed_at
    created_by

#### `reconciliation_items`

    id
    run_id
    source_record_a_id
    source_record_b_id
    match_status
    match_score
    amount_difference
    date_difference
    match_reasons
    created_at

#### `transactions`

    id
    engagement_id
    source_record_id
    transaction_date
    account
    description
    debit
    credit
    amount
    counterparty
    reference_number
    risk_score
    risk_level
    risk_reasons

#### `exceptions`

    id
    engagement_id
    module
    type
    title
    description
    amount
    risk_score
    risk_level
    status
    assigned_to
    created_by
    created_at
    updated_at
    resolved_at

#### `exception_sources`

    id
    exception_id
    source_record_id
    document_id
    transaction_id

#### `exception_comments`

    id
    exception_id
    user_id
    comment
    is_internal
    created_at

#### `exception_evidence`

    id
    exception_id
    document_id
    uploaded_by
    description
    created_at

#### `working_papers`

    id
    engagement_id
    module
    title
    content
    status
    prepared_by
    reviewed_by
    approved_by
    created_at
    updated_at

#### `audit_logs`

    id
    firm_id
    user_id
    action
    entity_type
    entity_id
    metadata
    ip_address
    created_at

------------------------------------------------------------------------

### 2.6 API Design

#### Authentication

    POST /api/auth/register
    POST /api/auth/login
    POST /api/auth/logout
    POST /api/auth/forgot-password
    POST /api/auth/reset-password
    GET  /api/auth/me

#### Firms and Users

    GET  /api/firm
    PATCH /api/firm
    GET  /api/users
    POST /api/users/invite
    PATCH /api/users/:id
    DELETE /api/users/:id

#### Clients

    GET    /api/clients
    POST   /api/clients
    GET    /api/clients/:id
    PATCH  /api/clients/:id
    DELETE /api/clients/:id

#### Engagements

    GET    /api/engagements
    POST   /api/engagements
    GET    /api/engagements/:id
    PATCH  /api/engagements/:id
    POST   /api/engagements/:id/members
    DELETE /api/engagements/:id/members/:userId

#### Documents

    POST   /api/engagements/:id/documents/upload-url
    POST   /api/engagements/:id/documents
    GET    /api/engagements/:id/documents
    GET    /api/documents/:id
    DELETE /api/documents/:id
    POST   /api/documents/:id/reprocess

#### Reconciliation

    POST /api/engagements/:id/reconciliations
    GET  /api/engagements/:id/reconciliations
    GET  /api/reconciliations/:id
    GET  /api/reconciliations/:id/items
    POST /api/reconciliations/:id/retry

#### Exceptions

    GET   /api/engagements/:id/exceptions
    POST  /api/engagements/:id/exceptions
    GET   /api/exceptions/:id
    PATCH /api/exceptions/:id
    POST  /api/exceptions/:id/comments
    POST  /api/exceptions/:id/evidence
    POST  /api/exceptions/:id/approve
    POST  /api/exceptions/:id/reopen

#### Working Papers

    GET   /api/engagements/:id/working-papers
    POST  /api/engagements/:id/working-papers
    PATCH /api/working-papers/:id
    POST  /api/working-papers/:id/submit-review
    POST  /api/working-papers/:id/approve
    GET   /api/working-papers/:id/export

------------------------------------------------------------------------

### 2.7 Matching Engine Design

Matching should use deterministic logic before AI.

#### Matching Order

1.  Exact invoice/reference match
2.  Exact GSTIN/PAN match
3.  Exact amount match
4.  Date tolerance
5.  Fuzzy invoice number match
6.  Vendor/customer similarity
7.  Amount tolerance
8.  AI-assisted potential match
9.  Manual review

#### Match Score Example

    Invoice number exact match: +40
    GSTIN exact match: +25
    Amount exact match: +20
    Date within 3 days: +10
    Vendor name similarity: +5

Suggested classification:

    90-100: Exact Match
    75-89: Strong Match
    50-74: Potential Match
    1-49: Weak Match
    0: No Match

AI must not silently change deterministic accounting values.

------------------------------------------------------------------------

### 2.8 AI Requirements

#### LLM Provider Architecture

The Python engine must use an AI provider abstraction rather than calling a
specific model directly from reconciliation logic.

Primary provider:

-   Gemini Flash via Google AI Studio

Fallback provider:

-   Qwen 27B via Groq

The provider layer must support:

-   Provider selection and fallback
-   Structured JSON/schema-validated responses
-   Model/version recording
-   Request and response error handling
-   Confidence and source-reference metadata
-   No silent modification of deterministic results

LLMs are advisory. Deterministic matching, amount calculations, tax
calculations, duplicate detection and authoritative accounting values must
remain in Python/rule-based services.


AI may be used for:

-   Document classification
-   Column mapping suggestions
-   OCR interpretation
-   Invoice field extraction
-   Narration analysis
-   Risk explanation
-   Exception summary generation
-   Suggested management queries
-   Working paper draft generation

AI must not:

-   Make final fraud determinations.
-   Override source data.
-   Close exceptions automatically.
-   Change financial values without user confirmation.
-   Generate unsupported audit conclusions.
-   Hide low-confidence extraction results.

Every AI result should include:

    AI-generated label
    Confidence
    Reason
    Source document
    Source page or row
    Model version
    Timestamp
    Human approval status

Recommended AI response format:

    {
      "finding": "Potential duplicate invoice",
      "confidence": 0.91,
      "reason": "Same GSTIN, invoice number and amount found in two documents",
      "source_records": ["record_123", "record_456"],
      "requires_human_review": true
    }

------------------------------------------------------------------------

### 2.9 Queue and Job Design

Job types:

    DOCUMENT_SCAN
    DOCUMENT_CLASSIFICATION
    OCR_PROCESSING
    TABLE_EXTRACTION
    DATA_NORMALIZATION
    GST_RECONCILIATION
    BANK_RECONCILIATION
    TAX_RECONCILIATION
    INVOICE_ANALYSIS
    EXPENSE_ANALYSIS
    TRANSACTION_RISK_ANALYSIS
    REPORT_GENERATION
    WORKING_PAPER_GENERATION

Each job must include:

    {
      "job_id": "job_123",
      "firm_id": "firm_123",
      "engagement_id": "eng_123",
      "document_ids": ["doc_1", "doc_2"],
      "attempt": 1,
      "created_by": "user_123"
    }

Requirements:

-   Idempotent jobs
-   Retry with exponential backoff
-   Maximum retry count
-   Progress percentage
-   Failure reason
-   Job cancellation
-   Job history
-   Dead-letter queue

------------------------------------------------------------------------

### 2.10 Security Architecture

#### Tenant Isolation

Every database query must be scoped by:

    firm_id
    engagement_id
    user permissions

Never trust an ID supplied by the frontend without authorization
validation.

#### File Security

-   Private object storage
-   Short-lived signed URLs
-   File type validation
-   File size limits
-   Malware scanning
-   No public buckets
-   Download audit logging
-   Server-side encryption

#### AI Security

-   Do not send unrelated firm data to AI.
-   Send minimum required fields.
-   Mask PAN, bank account numbers and personal data when possible.
-   Store prompt and response metadata.
-   Do not use client data for training without explicit consent.
-   Block prompt injection from document content.
-   Validate structured AI responses.

------------------------------------------------------------------------

### 2.11 Error Handling

Frontend errors should show:

    What happened
    Why it happened
    What the user can do next

Examples:

    The file could not be processed because no recognizable table headers were found.
    Try uploading the original Excel file or map the columns manually.

Backend errors must return consistent responses:

    {
      "error": {
        "code": "DOCUMENT_PARSE_FAILED",
        "message": "The uploaded document could not be parsed",
        "details": {
          "document_id": "doc_123"
        },
        "request_id": "req_123"
      }
    }

------------------------------------------------------------------------

### 2.12 MVP Development Order

#### Phase 1: Foundation

-   Project setup
-   Authentication
-   Firm workspace
-   User roles
-   Client management
-   Engagement management
-   PostgreSQL schema
-   File storage
-   Audit logging

#### Phase 2: Document Pipeline

-   Upload UI
-   Storage integration
-   File processing jobs
-   PDF extraction
-   Excel parsing
-   OCR
-   Document classification
-   Column mapping

#### Phase 3: Existing Reconciliation Modules

-   GST reconciliation
-   Bank reconciliation
-   Reconciliation result tables
-   Match status
-   Export

#### Phase 4: Tax Engine

-   26AS parser
-   AIS parser
-   TDS ledger parser
-   Books parser
-   PAN/TAN normalization
-   Section-wise matching
-   Tax exception generation

#### Phase 5: Risk and Verification

-   Invoice checking
-   Expense checking
-   Journal-entry analysis
-   Transaction risk rules
-   Risk scoring
-   AI explanations

#### Phase 6: Review Workflow

-   Exception management
-   Assignments
-   Comments
-   Evidence
-   Senior review
-   Partner approval
-   Working papers

#### Phase 7: Hardening

-   Security review
-   Performance testing
-   Queue failure handling
-   Tenant-isolation testing
-   Audit-log validation
-   Backup testing
-   Report validation

------------------------------------------------------------------------
