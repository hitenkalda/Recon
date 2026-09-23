# ReconAI --- Product Requirements Document

### 1.1 Product Overview

**ReconAI** is a web-based AI audit and reconciliation assistant for
Indian Chartered Accountant firms. It automates repetitive audit and
articleship work involving:

-   GST reconciliation
-   Bank reconciliation
-   26AS/AIS reconciliation
-   Invoice and expense verification
-   Vendor/customer reconciliation
-   Journal-entry analysis
-   Transaction risk detection
-   Exception management
-   Audit evidence management
-   Audit working papers
-   Senior and partner review

ReconAI does not replace the auditor. It identifies mismatches,
patterns, missing evidence and potential risk areas for auditor review.

------------------------------------------------------------------------

### 1.2 Problem Statement

Indian CA firms rely heavily on manual comparison of:

-   Excel workbooks
-   Bank statements
-   GST data
-   Purchase and sales registers
-   Ledgers
-   Invoices
-   Expense documents
-   26AS/AIS data
-   Journal entries
-   Supporting audit evidence

This creates:

-   High time consumption
-   Repetitive articleship work
-   Human errors
-   Missed exceptions
-   Inconsistent audit documentation
-   Difficult senior review
-   Poor tracking of unresolved issues
-   Delays in audit completion

ReconAI centralizes client documents, automates reconciliation and
creates review-ready audit evidence.

------------------------------------------------------------------------

### 1.3 Goals

#### Primary Goals

1.  Reduce manual reconciliation effort.
2.  Detect mismatches and suspicious transactions.
3.  Create structured exception workflows.
4.  Improve senior and partner review.
5.  Generate standardized audit working papers.
6.  Keep all client data private and access-controlled.
7.  Support Indian accounting, GST and tax workflows.

#### Secondary Goals

1.  Create reusable audit templates.
2.  Track work performed by articles and accountants.
3.  Provide evidence-linked audit conclusions.
4.  Build a data foundation for future Tally and accounting
    integrations.

#### Non-Goals

ReconAI will not:

-   Make final fraud conclusions.
-   Provide legally binding tax advice.
-   File GST returns automatically in the MVP.
-   Replace CA professional judgment.
-   Automatically approve or close high-risk audit exceptions.
-   Act as a general-purpose accounting system.

------------------------------------------------------------------------

### 1.4 Target Users

#### Article / Junior Accountant

Responsibilities:

-   Upload documents
-   Map columns
-   Run reconciliations
-   Review matched and unmatched items
-   Add explanations
-   Request documents
-   Resolve low-risk exceptions

Needs:

-   Simple workflow
-   Clear error messages
-   Bulk actions
-   Excel-like tables
-   Minimal manual data entry

#### Senior / Manager

Responsibilities:

-   Review article work
-   Validate exceptions
-   Assign tasks
-   Approve resolutions
-   Review risk summaries
-   Prepare audit reports

Needs:

-   Exception dashboard
-   Review queues
-   Evidence traceability
-   Filtering by risk and status
-   Commenting and approval controls

#### Partner / CA Reviewer

Responsibilities:

-   Review high-risk findings
-   Approve final working papers
-   Monitor engagement progress
-   Review unresolved exceptions
-   Sign off on audit sections

Needs:

-   Executive summary
-   Risk heatmap
-   Approval workflow
-   Client and engagement overview
-   Complete audit trail

#### Firm Admin

Responsibilities:

-   Manage firm users
-   Configure roles
-   Manage subscriptions
-   Manage security settings
-   Create clients and engagements

------------------------------------------------------------------------

### 1.5 Product Hierarchy

    Firm
     |
     ├── Users
     |
     ├── Clients
     |    |
     |    └── Engagements
     |         |
     |         ├── Documents
     |         ├── Data Sources
     |         ├── Reconciliations
     |         ├── Exceptions
     |         ├── Tasks
     |         ├── Evidence
     |         └── Working Papers

#### Client

Represents a business or taxpayer. Example:

    ABC Private Limited
    PAN: XXXXX1234X
    GSTIN: 27XXXXX1234X1Z5
    Financial Year: FY 2025-26

#### Engagement

Represents a specific audit or review assignment. Examples:

-   Statutory Audit FY 2025-26
-   GST Audit April 2025 - March 2026
-   Internal Audit Q2 FY 2025-26
-   Tax Audit FY 2025-26

All documents and findings must belong to an engagement.

------------------------------------------------------------------------

### 1.6 MVP Scope

#### Included

-   Authentication
-   Firm workspace
-   User and role management
-   Client management
-   Engagement management
-   Document upload
-   PDF, Excel and CSV processing
-   Document categorization
-   GST reconciliation
-   Bank reconciliation
-   26AS/AIS reconciliation
-   Invoice and expense checking
-   Transaction risk analysis
-   Exception creation
-   Exception assignment
-   Exception comments and evidence
-   Status workflow
-   Basic audit reports
-   Working paper generation
-   Audit logs
-   Dashboard and progress tracking

#### Deferred

-   Tally integration
-   WhatsApp notifications
-   Email automation
-   Direct GST portal integration
-   Direct bank API integration
-   Automated tax return filing
-   Advanced fraud investigation
-   Multi-firm benchmarking
-   Mobile application
-   Voice-based audit assistant
-   Digital signatures
-   Advanced custom rule builder

------------------------------------------------------------------------

### 1.7 Functional Requirements

## A. Authentication and Firm Setup

The system must support:

-   Email and password login
-   Password reset
-   Session management
-   Firm creation
-   Firm profile
-   User invitations
-   Role-based access
-   Optional two-factor authentication
-   Account deactivation

#### Roles

\| Role \| Access \| \|---\|---\| \| Firm Admin \| Full firm and
engagement access \| \| Partner \| All engagement data and approvals \|
\| Senior/Manager \| Engagement management and review \| \| Article \|
Assigned clients, documents and tasks \| \| Viewer \| Read-only access
\|

------------------------------------------------------------------------

## B. Client Management

Users must be able to:

-   Create a client
-   Edit client details
-   Archive a client
-   Add PAN
-   Add GSTIN
-   Add TAN
-   Add CIN
-   Add client contacts
-   Add multiple financial years
-   View client history
-   View active engagements

Client fields:

    Client Name
    Legal Name
    Entity Type
    PAN
    GSTIN
    TAN
    CIN
    Registered Address
    State
    Primary Contact
    Email
    Phone
    Industry
    Financial Year
    Assigned Team
    Status

------------------------------------------------------------------------

## C. Engagement Management

Users must be able to:

-   Create an engagement
-   Select audit type
-   Select financial year
-   Assign team members
-   Define period
-   Add materiality settings
-   Track engagement status
-   Close or archive engagement

Engagement statuses:

    Draft
    Active
    Under Review
    Partner Review
    Completed
    Archived

Engagement fields:

    Engagement Name
    Client
    Engagement Type
    Financial Year
    Period Start
    Period End
    Materiality Threshold
    Assigned Partner
    Assigned Senior
    Assigned Articles
    Status
    Due Date

------------------------------------------------------------------------

## D. Document Management

Supported file types:

-   PDF
-   XLSX
-   XLS
-   CSV
-   JPG
-   PNG
-   DOCX

Users must be able to:

-   Upload single or multiple files
-   Upload files using drag and drop
-   Categorize files
-   Tag files
-   View processing status
-   Preview supported documents
-   Download documents
-   Replace a document
-   Archive a document
-   Link documents to exceptions
-   Link documents to transactions
-   View document processing errors

Document categories:

    GST Purchase Register
    GST Sales Register
    GSTR-2B
    GSTR-1
    GSTR-3B
    Bank Statement
    Bank Book
    General Ledger
    Trial Balance
    Purchase Invoice
    Sales Invoice
    Expense Bill
    26AS
    AIS
    TDS Ledger
    Journal Register
    Vendor Ledger
    Customer Ledger
    Other

Document statuses:

    Uploaded
    Processing
    Processed
    Partially Processed
    Failed
    Archived

------------------------------------------------------------------------

## E. Data Extraction and Normalization

The processing engine must:

1.  Detect file type.
2.  Extract tabular data.
3.  Extract text from PDFs.
4.  Run OCR on scanned documents.
5.  Identify document type.
6.  Detect headers and columns.
7.  Normalize dates.
8.  Normalize GSTINs.
9.  Normalize PANs.
10. Normalize invoice numbers.
11. Normalize amounts.
12. Detect duplicate rows.
13. Store raw and normalized data separately.
14. Preserve source references.

Every normalized record must retain:

    Source Document ID
    Source Page Number
    Source Row Number
    Extraction Confidence
    Original Value
    Normalized Value

This is required for audit traceability.

------------------------------------------------------------------------

## F. GST Reconciliation

### Supported Inputs

-   Purchase register
-   Sales register
-   GSTR-2B
-   GSTR-1
-   GSTR-3B
-   Vendor master
-   Customer master
-   GST ledger

### Reconciliation Types

1.  Purchase register versus GSTR-2B
2.  Sales register versus GSTR-1
3.  Books versus GSTR-3B
4.  Input tax credit comparison
5.  Invoice-level matching
6.  Vendor GSTIN matching
7.  Tax amount comparison
8.  Period comparison

### Matching Logic

Primary matching keys:

    GSTIN
    Invoice Number
    Invoice Date
    Taxable Value
    Total Tax

Matching tolerance:

    Exact Match
    Amount Tolerance Match
    Date Tolerance Match
    Partial Match
    Potential Match
    No Match
    Duplicate

### GST Exception Types

-   Invoice missing in GSTR-2B
-   Invoice present in GSTR-2B but missing in books
-   Taxable value mismatch
-   IGST mismatch
-   CGST mismatch
-   SGST mismatch
-   Invoice date mismatch
-   GSTIN mismatch
-   Duplicate invoice
-   Invalid GSTIN
-   Wrong tax period
-   Credit note mismatch
-   Debit note mismatch
-   Potential ineligible ITC
-   Missing supporting invoice

### GST Output

The system must show:

-   Total source records
-   Matched records
-   Partially matched records
-   Unmatched records
-   Duplicate records
-   Total taxable value
-   Total tax value
-   Exception value
-   Match percentage
-   Risk summary

------------------------------------------------------------------------

## G. Bank Reconciliation

### Supported Inputs

-   Bank statement
-   Bank book
-   General ledger
-   Cash book
-   Payment register
-   Receipt register

### Matching Fields

    Transaction Date
    Value Date
    Amount
    Debit/Credit
    Reference Number
    Cheque Number
    UTR
    Description
    Counterparty

### Bank Exception Types

-   Bank transaction missing in books
-   Book transaction missing in bank
-   Amount mismatch
-   Duplicate transaction
-   Unusual transaction
-   Old outstanding item
-   Round-number transaction
-   Weekend or holiday transaction
-   Unknown counterparty
-   Reversal transaction
-   Manual journal against bank
-   Possible personal transaction
-   Suspicious narration

### Bank Output

-   Book balance
-   Bank balance
-   Matched transactions
-   Unmatched transactions
-   Outstanding deposits
-   Outstanding payments
-   Net difference
-   High-risk transactions
-   Reconciliation statement

------------------------------------------------------------------------

## H. 26AS/AIS Reconciliation

This is the next major engine after GST and Bank reconciliation.

### Supported Inputs

-   Form 26AS
-   AIS
-   TIS
-   TDS ledger
-   Sales ledger
-   Interest income ledger
-   Dividend income ledger
-   Salary ledger
-   Contract income ledger
-   Commission income ledger
-   Trial balance

### Reconciliation Types

1.  26AS versus books
2.  AIS versus books
3.  TDS receivable versus 26AS
4.  Income reported in AIS versus income ledger
5.  Tax deducted versus tax credit
6.  Customer-wise TDS reconciliation
7.  Section-wise reconciliation
8.  Financial-year reconciliation
9.  PAN-wise reconciliation

### Matching Fields

    PAN
    Deductor Name
    Deductor TAN
    Section
    Transaction Date
    Quarter
    Gross Amount
    TDS Amount
    Status

### 26AS/AIS Exception Types

-   TDS credit missing in books
-   TDS credit missing in 26AS
-   Amount mismatch
-   Deductor mismatch
-   PAN mismatch
-   Wrong section
-   TDS rate mismatch
-   Duplicate entry
-   Income present in AIS but missing in books
-   Income in books but missing in AIS
-   TDS booked in incorrect period
-   TDS receivable not recoverable
-   Tax credit marked inactive
-   Potential undisclosed income

### 26AS Output

    Total reported income
    Total book income
    Total TDS as per portal
    Total TDS as per books
    Matched amount
    Unmatched amount
    Potential tax credit loss
    Section-wise summary
    Deductor-wise summary
    Exception list

------------------------------------------------------------------------

## I. Invoice Verification

The system must analyze uploaded invoices for:

-   Invoice number
-   Invoice date
-   Vendor/customer name
-   GSTIN
-   PAN
-   Address
-   Taxable amount
-   Tax rate
-   CGST
-   SGST
-   IGST
-   Total amount
-   HSN/SAC
-   Place of supply
-   Duplicate invoice indicators
-   Missing mandatory fields

### Invoice Risk Checks

-   Duplicate invoice number
-   Same invoice uploaded multiple times
-   Invalid GSTIN
-   Tax calculation mismatch
-   Incorrect GST rate
-   Invoice date outside period
-   Vendor mismatch
-   Amount mismatch against ledger
-   Suspicious round amount
-   Missing supporting document
-   Altered or low-quality document
-   Invoice number sequence anomaly

------------------------------------------------------------------------

## J. Expense Verification

The system must compare expense claims against:

-   General ledger
-   Expense register
-   Bank statement
-   Vendor records
-   Uploaded bills
-   Employee claims

### Expense Risk Checks

-   Expense without supporting bill
-   Duplicate bill
-   Personal-looking expense
-   Weekend or holiday expense
-   Excessive round-number expense
-   Unusual vendor
-   High-value expense
-   Expense outside financial period
-   Mismatch between bill and ledger
-   Tax amount mismatch
-   Repeated split transactions
-   Cash expense above configured threshold
-   Missing approval

The system must label these as potential risks, not final conclusions.

------------------------------------------------------------------------

## K. Transaction and Journal Analysis

Supported transaction sources:

-   General ledger
-   Journal register
-   Bank book
-   Cash book
-   Sales register
-   Purchase register
-   Expense register

### Risk Rules

-   Manual journal posted near period end
-   Backdated journal
-   Round-number journal
-   Unusual account combination
-   Large one-time transaction
-   Reversal after period close
-   Same amount repeated frequently
-   Debit and credit imbalance
-   Journal without narration
-   Journal posted by unusual user
-   Related-party-looking transaction
-   Transactions outside business hours
-   High-value cash transaction
-   Suspicious ledger transfers
-   Negative balances
-   Unusual month-end movement

### Risk Score

Each transaction may receive:

    Risk Score: 0-100
    Risk Level: Low / Medium / High / Critical
    Risk Reasons
    Detected Rules
    Supporting Documents
    Reviewer Status

Risk scoring must be explainable. The user must be able to see why an
item received its score.

------------------------------------------------------------------------

## L. Exception Management

Exceptions are the central workflow object.

### Exception Fields

    Exception ID
    Engagement ID
    Module
    Exception Type
    Title
    Description
    Source Records
    Source Documents
    Amount
    Risk Score
    Risk Level
    Assigned User
    Status
    Management Response
    Reviewer Comment
    Resolution Evidence
    Created By
    Created Date
    Updated Date
    Resolved Date
    Approved By

### Exception Statuses

    Open
    Assigned
    In Progress
    Waiting for Client
    Resolved
    Rejected
    Accepted Risk
    Escalated
    Approved
    Closed

### Exception Workflow

    System detects exception
            |
    Exception created
            |
    Senior/article assigned
            |
    Evidence or explanation requested
            |
    User adds response
            |
    Senior reviews
            |
    Resolved / Accepted Risk / Escalated
            |
    Partner approval
            |
    Closed

### Required Features

-   Assign exception
-   Add comments
-   Add internal notes
-   Request client evidence
-   Upload resolution evidence
-   Link related transactions
-   Link related documents
-   Change risk level
-   Change status
-   Approve resolution
-   Reopen exception
-   Maintain complete activity history

------------------------------------------------------------------------

## M. Audit Working Papers

Working papers must be generated from system activity. A working paper
should contain:

    Engagement Details
    Audit Area
    Objective
    Scope
    Source Documents
    Procedures Performed
    Records Tested
    Exceptions Identified
    Management Responses
    Reviewer Comments
    Conclusion
    Prepared By
    Prepared Date
    Reviewed By
    Review Date
    Approval Status

### MVP Working Paper Templates

-   GST reconciliation working paper
-   Bank reconciliation working paper
-   26AS reconciliation working paper
-   Invoice verification working paper
-   Expense verification working paper
-   Journal-entry analysis working paper
-   Exception summary
-   Senior review checklist
-   Partner sign-off summary

### Working Paper Statuses

    Draft
    Prepared
    Submitted for Review
    Review Comments
    Reviewed
    Approved
    Final

------------------------------------------------------------------------

## N. Reports

### Dashboard Reports

-   Engagement completion percentage
-   Total documents
-   Processing status
-   Reconciliation match rate
-   Open exceptions
-   High-risk exceptions
-   Exceptions by module
-   Exceptions by assignee
-   Pending client requests
-   Pending review items

### Export Formats

-   PDF
-   XLSX
-   CSV

### Report Types

-   GST reconciliation report
-   Bank reconciliation report
-   26AS/AIS reconciliation report
-   Transaction risk report
-   Exception report
-   Working paper pack
-   Review status report
-   Client request report

------------------------------------------------------------------------

### 1.8 AI / LLM Requirements

ReconAI should use LLMs only for interpretation, classification, extraction
assistance and explanation. LLMs must not be the authoritative source for
accounting or reconciliation calculations.

#### LLM Provider Strategy

-   Primary LLM: Gemini Flash via Google AI Studio
-   Fallback LLM: Qwen 27B via Groq
-   Use a provider abstraction so either provider can be replaced without
    changing core reconciliation logic.
-   Deterministic matching, financial calculations, duplicate detection and
    risk scoring rules remain code-driven.
-   AI-generated results must retain confidence, source references, model
    version and human approval status.

#### AI Guardrails

-   AI must not make final fraud determinations.
-   AI must not override source data.
-   AI must not close exceptions automatically.
-   AI must not change financial values without user confirmation.
-   Low-confidence results must remain visible.

---

### 1.9 Non-Functional Requirements

#### Security

-   Tenant isolation by firm
-   Encryption in transit
-   Encryption at rest
-   Role-based access control
-   Object-level authorization
-   Secure file download URLs
-   Malware scanning for uploaded files
-   Audit logs
-   Session expiration
-   Password hashing
-   No client data used for model training by default
-   Data deletion workflow
-   Backup and restore process

#### Privacy

-   Client data must be private to the firm.
-   Users must not access clients outside their permission scope.
-   AI prompts must not expose unrelated client data.
-   Sensitive values must be masked where appropriate.
-   All AI-generated findings must retain source references.

#### Performance

Target MVP performance:

    Dashboard load: under 3 seconds
    Standard table load: under 3 seconds
    File upload acknowledgement: under 2 seconds
    Small document processing: under 60 seconds
    Batch processing: asynchronous

#### Reliability

-   Job retries
-   Failed-job visibility
-   Idempotent processing
-   Processing checkpoints
-   Duplicate file detection
-   Error logs
-   Queue monitoring

#### Auditability

Every material action must be logged:

    Login
    File upload
    File deletion
    Data modification
    Reconciliation execution
    Exception status change
    Comment
    Assignment
    Approval
    Report generation

------------------------------------------------------------------------

### 1.9 Success Metrics

#### Product Metrics

-   Reconciliation completion rate
-   Percentage of records auto-matched
-   Average processing time
-   Exceptions detected per engagement
-   Exceptions resolved per engagement
-   Working papers generated
-   Number of active firms
-   Monthly active users
-   Engagement completion rate

#### Business Metrics

-   Trial-to-paid conversion
-   Firm retention
-   Revenue per firm
-   Cost per processed document
-   Support tickets per engagement

#### User Value Metrics

-   Hours saved per engagement
-   Reduction in manual Excel work
-   Senior review time
-   Percentage of exceptions with supporting evidence
-   Percentage of high-risk items reviewed before closure

------------------------------------------------------------------------
