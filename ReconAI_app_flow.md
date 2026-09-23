# ReconAI --- Application Flow

# 3. Application Flow

## 3.1 First-Time Firm Setup

    Landing Page
        |
    Sign Up
        |
    Create Firm
        |
    Enter Firm Details
        |
    Invite Team Members
        |
    Select Subscription
        |
    Workspace Dashboard

### Screens

    /signup
    /create-firm
    /invite-team
    /billing
    /dashboard

------------------------------------------------------------------------

## 3.2 Main Navigation

    Dashboard
    Clients
    Engagements
    Documents
    Reconciliations
    Exceptions
    Tasks
    Working Papers
    Reports
    Team
    Settings

------------------------------------------------------------------------

## 3.3 Dashboard Flow

    Dashboard
     |
     ├── Active engagements
     ├── Open exceptions
     ├── High-risk items
     ├── Pending reviews
     ├── Client requests
     ├── Processing jobs
     └── Recent activity

Dashboard cards:

    Active Clients
    Active Engagements
    Documents Processing
    Open Exceptions
    High-Risk Exceptions
    Pending Reviews
    Completion Percentage

------------------------------------------------------------------------

## 3.4 Client Creation Flow

    Clients
       |
    Add Client
       |
    Enter Legal Details
       |
    Enter PAN/GSTIN/TAN
       |
    Add Contact
       |
    Save Client
       |
    Create Engagement

Validation:

-   PAN format
-   GSTIN format
-   TAN format
-   Duplicate client detection
-   Required legal name
-   Required entity type

------------------------------------------------------------------------

## 3.5 Engagement Creation Flow

    Client Profile
        |
    Create Engagement
        |
    Select Engagement Type
        |
    Select Financial Year
        |
    Set Period
        |
    Set Materiality Threshold
        |
    Assign Partner
        |
    Assign Senior
        |
    Assign Articles
        |
    Create Engagement

After creation, the system opens the engagement overview.

------------------------------------------------------------------------

## 3.6 Engagement Overview Flow

    Engagement Overview
     |
     ├── Setup Checklist
     ├── Documents
     ├── Reconciliations
     ├── Risk Analysis
     ├── Exceptions
     ├── Working Papers
     ├── Reports
     └── Activity Log

### Setup Checklist

    Client details completed
    Team assigned
    Required documents uploaded
    Documents processed
    GST reconciliation completed
    Bank reconciliation completed
    26AS/AIS reconciliation completed
    Exceptions reviewed
    Working papers submitted
    Partner approval completed

------------------------------------------------------------------------

## 3.7 Document Upload Flow

    Documents
        |
    Upload Documents
        |
    Select Files
        |
    Select Category
        |
    Upload
        |
    Processing Queue
        |
    Document Preview
        |
    Confirm Classification
        |
    Map Columns if Required
        |
    Data Ready

### Upload states

    Uploading
    Scanning
    Processing
    Needs Mapping
    Ready
    Failed

If mapping fails:

    Processing Failed
        |
    Review Detected Columns
        |
    Map Required Fields
        |
    Save Mapping
        |
    Reprocess

------------------------------------------------------------------------

## 3.8 GST Reconciliation Flow

    Reconciliations
        |
    Select GST Reconciliation
        |
    Select Source A
        |
    Select Source B
        |
    Configure Matching Rules
        |
    Run Reconciliation
        |
    Processing Progress
        |
    Summary Dashboard
        |
    Matched / Partial / Unmatched / Duplicate Tabs
        |
    Open Exception
        |
    Assign or Resolve
        |
    Export Report

### GST result page

    Summary
    Matched
    Partial Match
    Unmatched
    Duplicates
    Tax Differences
    Exceptions

Each row should show:

    Invoice Number
    GSTIN
    Invoice Date
    Taxable Value
    Tax Amount
    Source A Value
    Source B Value
    Difference
    Match Status
    Risk
    Action

------------------------------------------------------------------------

## 3.9 Bank Reconciliation Flow

    Reconciliations
        |
    Bank Reconciliation
        |
    Select Bank Statement
        |
    Select Bank Book/Ledger
        |
    Configure Date and Amount Tolerance
        |
    Run
        |
    View Reconciliation Summary
        |
    Review Matched Transactions
        |
    Review Outstanding Items
        |
    Review Risky Transactions
        |
    Create Exceptions
        |
    Generate Bank Working Paper

------------------------------------------------------------------------

## 3.10 26AS/AIS Reconciliation Flow

    Reconciliations
        |
    26AS/AIS Reconciliation
        |
    Upload 26AS or AIS
        |
    Upload TDS Ledger
        |
    Upload Income Ledger
        |
    Upload Trial Balance if Required
        |
    Map PAN/TAN and Period
        |
    Run Reconciliation
        |
    View Tax Summary
        |
    Review Section-wise Results
        |
    Review Deductor-wise Results
        |
    Review Unmatched TDS
        |
    Create Exceptions
        |
    Generate Tax Working Paper

### Tax result tabs

    Overview
    Matched
    TDS Missing in Books
    TDS Missing in 26AS
    Income Mismatch
    Section Mismatch
    Duplicates
    High Risk

------------------------------------------------------------------------

## 3.11 Invoice Verification Flow

    Invoice Verification
        |
    Select Invoice Documents
        |
    Select Purchase/Sales Ledger
        |
    Run Verification
        |
    View Extracted Fields
        |
    Review Validation Errors
        |
    Review Duplicate Indicators
        |
    Review Ledger Comparison
        |
    Create Exceptions
        |
    Export Invoice Review Report

------------------------------------------------------------------------

## 3.12 Expense Verification Flow

    Expense Verification
        |
    Select Expense Ledger
        |
    Select Expense Bills
        |
    Select Bank/Cash Source
        |
    Run Verification
        |
    Review Supported Expenses
        |
    Review Missing Bills
        |
    Review Duplicate Bills
        |
    Review Risky Expenses
        |
    Request Evidence
        |
    Resolve or Escalate

------------------------------------------------------------------------

## 3.13 Transaction Risk Analysis Flow

    Risk Analysis
        |
    Select Data Source
        |
    Select Analysis Period
        |
    Select Risk Rules
        |
    Run Analysis
        |
    Risk Dashboard
        |
    Low / Medium / High / Critical
        |
    Open Transaction
        |
    View Risk Reasons
        |
    View Related Documents
        |
    Create Exception
        |
    Assign Reviewer

### Transaction detail page

    Transaction information
    Ledger context
    Related entries
    Related documents
    Risk score
    Triggered rules
    AI explanation
    Comments
    Exception status
    Audit history

------------------------------------------------------------------------

## 3.14 Exception Resolution Flow

    Exception Queue
        |
    Filter by Module, Risk, Status, Assignee
        |
    Open Exception
        |
    Review Source Records
        |
    Review Supporting Documents
        |
    Add Comment
        |
    Request Client Evidence or Explanation
        |
    Upload Evidence
        |
    Select Resolution

### Resolution options

    Resolved - Valid Difference
    Resolved - Data Error
    Resolved - Timing Difference
    Resolved - Duplicate Removed
    Accepted Risk
    Not an Exception
    Escalate to Senior
    Escalate to Partner

For high-risk exceptions:

    Article Resolution
        |
    Senior Review
        |
    Partner Approval
        |
    Closed

High-risk exceptions should not be closed by an Article alone.

------------------------------------------------------------------------

## 3.15 Working Paper Flow

    Working Papers
        |
    Select Audit Area
        |
    Generate Draft
        |
    Review Source Links
        |
    Add Procedures Performed
        |
    Add Conclusion
        |
    Attach Exceptions
        |
    Submit for Senior Review
        |
    Senior Adds Comments
        |
    Article Revises
        |
    Senior Approves
        |
    Partner Reviews
        |
    Final Working Paper

------------------------------------------------------------------------

## 3.16 Senior Review Flow

    Senior Dashboard
        |
    Review Queue
        |
    Select Engagement
        |
    Review Reconciliation Summaries
        |
    Review High-Risk Exceptions
        |
    Review Unresolved Items
        |
    Review Working Papers
        |
    Add Review Notes
        |
    Approve / Return for Changes

------------------------------------------------------------------------

## 3.17 Partner Review Flow

    Partner Dashboard
        |
    Engagement Summary
        |
    Risk Heatmap
        |
    Unresolved Exceptions
        |
    Material Exceptions
        |
    Working Paper Pack
        |
    Partner Comments
        |
    Approve Engagement
        |
    Mark Completed

------------------------------------------------------------------------
