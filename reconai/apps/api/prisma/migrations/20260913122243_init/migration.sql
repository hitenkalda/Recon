-- CreateTable
CREATE TABLE "Firm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "tan" TEXT,
    "address" TEXT,
    "settings" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmMember" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirmMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "tan" TEXT,
    "cin" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "contacts" JSONB,
    "tags" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Engagement" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "financialYear" JSONB,
    "scope" JSONB,
    "taxBase" JSONB,
    "conclusion" TEXT,
    "createdById" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementMember" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetupChecklistItem" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetupChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "category" TEXT,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "sha256" TEXT,
    "uploadedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "failureReason" TEXT,
    "columns" JSONB,
    "mapping" JSONB,
    "pageCount" INTEGER,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "virusScanResult" TEXT,
    "isDuplicateOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceRecord" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "rowIndex" INTEGER,
    "page" INTEGER,
    "data" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validationStatus" TEXT NOT NULL DEFAULT 'valid',
    "warnings" JSONB,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "queueJobId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT,
    "error" TEXT,
    "output" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconRun" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "config" JSONB,
    "sourceAId" TEXT,
    "sourceBId" TEXT,
    "aisSourceId" TEXT,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconItem" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "recordAId" TEXT,
    "recordBId" TEXT,
    "matchStatus" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasons" JSONB,
    "amountPaiseA" BIGINT,
    "amountPaiseB" BIGINT,
    "variancePaise" BIGINT,
    "dateA" TIMESTAMP(3),
    "dateB" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConsult" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "runId" TEXT,
    "itemId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "status" TEXT NOT NULL DEFAULT 'suggested',
    "confidence" DOUBLE PRECISION,
    "requesterId" TEXT,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiConsult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "runId" TEXT,
    "engagementId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "resolution" TEXT,
    "createdById" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "references" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionComment" (
    "id" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExceptionComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionEvidence" (
    "id" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'document',
    "text" TEXT,
    "documentId" TEXT,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExceptionEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionActivity" (
    "id" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExceptionActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskFinding" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "runId" TEXT,
    "sourceRecordId" TEXT,
    "tag" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL,
    "evidence" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingPaper" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "deliverable" TEXT NOT NULL,
    "runId" TEXT,
    "procedures" JSONB,
    "conclusion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewerNote" TEXT,
    "createdById" TEXT,
    "seniorSignedById" TEXT,
    "partnerSignedById" TEXT,
    "evidenceHash" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkingPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "workingPaperId" TEXT,
    "format" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "size" BIGINT,
    "generatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Firm_name_idx" ON "Firm"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "FirmMember_userId_idx" ON "FirmMember"("userId");

-- CreateIndex
CREATE INDEX "FirmMember_firmId_idx" ON "FirmMember"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "FirmMember_firmId_userId_key" ON "FirmMember"("firmId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_firmId_idx" ON "Invitation"("firmId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Client_firmId_idx" ON "Client"("firmId");

-- CreateIndex
CREATE INDEX "Client_gstin_idx" ON "Client"("gstin");

-- CreateIndex
CREATE INDEX "Client_pan_idx" ON "Client"("pan");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_isDeleted_idx" ON "Client"("isDeleted");

-- CreateIndex
CREATE INDEX "Engagement_firmId_idx" ON "Engagement"("firmId");

-- CreateIndex
CREATE INDEX "Engagement_clientId_idx" ON "Engagement"("clientId");

-- CreateIndex
CREATE INDEX "Engagement_status_idx" ON "Engagement"("status");

-- CreateIndex
CREATE INDEX "Engagement_isDeleted_idx" ON "Engagement"("isDeleted");

-- CreateIndex
CREATE INDEX "EngagementMember_userId_idx" ON "EngagementMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementMember_engagementId_userId_key" ON "EngagementMember"("engagementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SetupChecklistItem_engagementId_key_key" ON "SetupChecklistItem"("engagementId", "key");

-- CreateIndex
CREATE INDEX "Document_firmId_idx" ON "Document"("firmId");

-- CreateIndex
CREATE INDEX "Document_engagementId_idx" ON "Document"("engagementId");

-- CreateIndex
CREATE INDEX "Document_clientId_idx" ON "Document"("clientId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_sha256_idx" ON "Document"("sha256");

-- CreateIndex
CREATE INDEX "SourceRecord_firmId_idx" ON "SourceRecord"("firmId");

-- CreateIndex
CREATE INDEX "SourceRecord_documentId_idx" ON "SourceRecord"("documentId");

-- CreateIndex
CREATE INDEX "SourceRecord_documentId_validationStatus_idx" ON "SourceRecord"("documentId", "validationStatus");

-- CreateIndex
CREATE INDEX "ProcessingJob_firmId_idx" ON "ProcessingJob"("firmId");

-- CreateIndex
CREATE INDEX "ProcessingJob_documentId_idx" ON "ProcessingJob"("documentId");

-- CreateIndex
CREATE INDEX "ProcessingJob_state_idx" ON "ProcessingJob"("state");

-- CreateIndex
CREATE INDEX "ReconRun_firmId_idx" ON "ReconRun"("firmId");

-- CreateIndex
CREATE INDEX "ReconRun_engagementId_idx" ON "ReconRun"("engagementId");

-- CreateIndex
CREATE INDEX "ReconRun_clientId_idx" ON "ReconRun"("clientId");

-- CreateIndex
CREATE INDEX "ReconRun_status_idx" ON "ReconRun"("status");

-- CreateIndex
CREATE INDEX "ReconItem_firmId_idx" ON "ReconItem"("firmId");

-- CreateIndex
CREATE INDEX "ReconItem_runId_idx" ON "ReconItem"("runId");

-- CreateIndex
CREATE INDEX "ReconItem_runId_matchStatus_idx" ON "ReconItem"("runId", "matchStatus");

-- CreateIndex
CREATE INDEX "ReconItem_recordAId_idx" ON "ReconItem"("recordAId");

-- CreateIndex
CREATE INDEX "ReconItem_recordBId_idx" ON "ReconItem"("recordBId");

-- CreateIndex
CREATE INDEX "AiConsult_firmId_idx" ON "AiConsult"("firmId");

-- CreateIndex
CREATE INDEX "AiConsult_runId_idx" ON "AiConsult"("runId");

-- CreateIndex
CREATE INDEX "AiConsult_itemId_idx" ON "AiConsult"("itemId");

-- CreateIndex
CREATE INDEX "AiConsult_status_idx" ON "AiConsult"("status");

-- CreateIndex
CREATE INDEX "Exception_firmId_idx" ON "Exception"("firmId");

-- CreateIndex
CREATE INDEX "Exception_engagementId_idx" ON "Exception"("engagementId");

-- CreateIndex
CREATE INDEX "Exception_clientId_idx" ON "Exception"("clientId");

-- CreateIndex
CREATE INDEX "Exception_status_idx" ON "Exception"("status");

-- CreateIndex
CREATE INDEX "Exception_severity_idx" ON "Exception"("severity");

-- CreateIndex
CREATE INDEX "ExceptionComment_exceptionId_idx" ON "ExceptionComment"("exceptionId");

-- CreateIndex
CREATE INDEX "ExceptionEvidence_exceptionId_idx" ON "ExceptionEvidence"("exceptionId");

-- CreateIndex
CREATE INDEX "ExceptionActivity_exceptionId_idx" ON "ExceptionActivity"("exceptionId");

-- CreateIndex
CREATE INDEX "RiskFinding_firmId_idx" ON "RiskFinding"("firmId");

-- CreateIndex
CREATE INDEX "RiskFinding_engagementId_idx" ON "RiskFinding"("engagementId");

-- CreateIndex
CREATE INDEX "RiskFinding_sourceRecordId_idx" ON "RiskFinding"("sourceRecordId");

-- CreateIndex
CREATE INDEX "RiskFinding_tag_idx" ON "RiskFinding"("tag");

-- CreateIndex
CREATE INDEX "WorkingPaper_firmId_idx" ON "WorkingPaper"("firmId");

-- CreateIndex
CREATE INDEX "WorkingPaper_engagementId_idx" ON "WorkingPaper"("engagementId");

-- CreateIndex
CREATE INDEX "WorkingPaper_status_idx" ON "WorkingPaper"("status");

-- CreateIndex
CREATE INDEX "Report_firmId_idx" ON "Report"("firmId");

-- CreateIndex
CREATE INDEX "Report_engagementId_idx" ON "Report"("engagementId");

-- CreateIndex
CREATE INDEX "AuditLog_firmId_idx" ON "AuditLog"("firmId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_firmId_idx" ON "Notification"("firmId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- AddForeignKey
ALTER TABLE "FirmMember" ADD CONSTRAINT "FirmMember_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmMember" ADD CONSTRAINT "FirmMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementMember" ADD CONSTRAINT "EngagementMember_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementMember" ADD CONSTRAINT "EngagementMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetupChecklistItem" ADD CONSTRAINT "SetupChecklistItem_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceRecord" ADD CONSTRAINT "SourceRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconRun" ADD CONSTRAINT "ReconRun_sourceAId_fkey" FOREIGN KEY ("sourceAId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconRun" ADD CONSTRAINT "ReconRun_sourceBId_fkey" FOREIGN KEY ("sourceBId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconRun" ADD CONSTRAINT "ReconRun_aisSourceId_fkey" FOREIGN KEY ("aisSourceId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconRun" ADD CONSTRAINT "ReconRun_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconRun" ADD CONSTRAINT "ReconRun_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconRun" ADD CONSTRAINT "ReconRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconItem" ADD CONSTRAINT "ReconItem_recordAId_fkey" FOREIGN KEY ("recordAId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconItem" ADD CONSTRAINT "ReconItem_recordBId_fkey" FOREIGN KEY ("recordBId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconItem" ADD CONSTRAINT "ReconItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConsult" ADD CONSTRAINT "AiConsult_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ReconItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionComment" ADD CONSTRAINT "ExceptionComment_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "Exception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionEvidence" ADD CONSTRAINT "ExceptionEvidence_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "Exception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionActivity" ADD CONSTRAINT "ExceptionActivity_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "Exception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingPaper" ADD CONSTRAINT "WorkingPaper_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingPaper" ADD CONSTRAINT "WorkingPaper_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingPaper" ADD CONSTRAINT "WorkingPaper_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingPaper" ADD CONSTRAINT "WorkingPaper_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_workingPaperId_fkey" FOREIGN KEY ("workingPaperId") REFERENCES "WorkingPaper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
