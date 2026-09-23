-- AlterTable
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "IndividualProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "credits" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndividualProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualPlanChange" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "fromPlan" TEXT NOT NULL,
    "toPlan" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualPlanChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualRecord" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndividualRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualDocument" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "sha256" TEXT,
    "category" TEXT,
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

    CONSTRAINT "IndividualDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualSourceRecord" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "IndividualSourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualProcessingJob" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT,
    "error" TEXT,
    "output" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualReconRun" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
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

    CONSTRAINT "IndividualReconRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualReconItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
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

    CONSTRAINT "IndividualReconItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualException" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "runId" TEXT,
    "recordId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "resolution" TEXT,
    "createdById" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "references" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndividualException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualReport" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "recordId" TEXT,
    "runId" TEXT,
    "format" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "size" BIGINT,
    "generatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndividualUsageLog" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT,
    "creditsUsed" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'consumed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndividualUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IndividualProfile_userId_key" ON "IndividualProfile"("userId");

-- CreateIndex
CREATE INDEX "IndividualProfile_userId_idx" ON "IndividualProfile"("userId");

-- CreateIndex
CREATE INDEX "IndividualPlanChange_profileId_idx" ON "IndividualPlanChange"("profileId");

-- CreateIndex
CREATE INDEX "IndividualPlanChange_createdAt_idx" ON "IndividualPlanChange"("createdAt");

-- CreateIndex
CREATE INDEX "IndividualRecord_profileId_idx" ON "IndividualRecord"("profileId");

-- CreateIndex
CREATE INDEX "IndividualRecord_profileId_status_idx" ON "IndividualRecord"("profileId", "status");

-- CreateIndex
CREATE INDEX "IndividualRecord_profileId_type_idx" ON "IndividualRecord"("profileId", "type");

-- CreateIndex
CREATE INDEX "IndividualRecord_isDeleted_idx" ON "IndividualRecord"("isDeleted");

-- CreateIndex
CREATE INDEX "IndividualDocument_profileId_idx" ON "IndividualDocument"("profileId");

-- CreateIndex
CREATE INDEX "IndividualDocument_recordId_idx" ON "IndividualDocument"("recordId");

-- CreateIndex
CREATE INDEX "IndividualDocument_status_idx" ON "IndividualDocument"("status");

-- CreateIndex
CREATE INDEX "IndividualDocument_sha256_idx" ON "IndividualDocument"("sha256");

-- CreateIndex
CREATE INDEX "IndividualSourceRecord_documentId_idx" ON "IndividualSourceRecord"("documentId");

-- CreateIndex
CREATE INDEX "IndividualSourceRecord_documentId_validationStatus_idx" ON "IndividualSourceRecord"("documentId", "validationStatus");

-- CreateIndex
CREATE INDEX "IndividualProcessingJob_profileId_idx" ON "IndividualProcessingJob"("profileId");

-- CreateIndex
CREATE INDEX "IndividualProcessingJob_documentId_idx" ON "IndividualProcessingJob"("documentId");

-- CreateIndex
CREATE INDEX "IndividualProcessingJob_state_idx" ON "IndividualProcessingJob"("state");

-- CreateIndex
CREATE INDEX "IndividualReconRun_profileId_idx" ON "IndividualReconRun"("profileId");

-- CreateIndex
CREATE INDEX "IndividualReconRun_recordId_idx" ON "IndividualReconRun"("recordId");

-- CreateIndex
CREATE INDEX "IndividualReconRun_status_idx" ON "IndividualReconRun"("status");

-- CreateIndex
CREATE INDEX "IndividualReconRun_createdAt_idx" ON "IndividualReconRun"("createdAt");

-- CreateIndex
CREATE INDEX "IndividualReconItem_runId_idx" ON "IndividualReconItem"("runId");

-- CreateIndex
CREATE INDEX "IndividualReconItem_profileId_idx" ON "IndividualReconItem"("profileId");

-- CreateIndex
CREATE INDEX "IndividualReconItem_runId_matchStatus_idx" ON "IndividualReconItem"("runId", "matchStatus");

-- CreateIndex
CREATE INDEX "IndividualException_profileId_idx" ON "IndividualException"("profileId");

-- CreateIndex
CREATE INDEX "IndividualException_recordId_idx" ON "IndividualException"("recordId");

-- CreateIndex
CREATE INDEX "IndividualException_status_idx" ON "IndividualException"("status");

-- CreateIndex
CREATE INDEX "IndividualException_severity_idx" ON "IndividualException"("severity");

-- CreateIndex
CREATE INDEX "IndividualReport_profileId_idx" ON "IndividualReport"("profileId");

-- CreateIndex
CREATE INDEX "IndividualReport_recordId_idx" ON "IndividualReport"("recordId");

-- CreateIndex
CREATE INDEX "IndividualReport_runId_idx" ON "IndividualReport"("runId");

-- CreateIndex
CREATE INDEX "IndividualUsageLog_profileId_idx" ON "IndividualUsageLog"("profileId");

-- CreateIndex
CREATE INDEX "IndividualUsageLog_userId_idx" ON "IndividualUsageLog"("userId");

-- CreateIndex
CREATE INDEX "IndividualUsageLog_createdAt_idx" ON "IndividualUsageLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAccount_googleId_key" ON "GoogleAccount"("googleId");

-- CreateIndex
CREATE INDEX "GoogleAccount_googleId_idx" ON "GoogleAccount"("googleId");

-- CreateIndex
CREATE INDEX "GoogleAccount_userId_idx" ON "GoogleAccount"("userId");

-- AddForeignKey
ALTER TABLE "IndividualProfile" ADD CONSTRAINT "IndividualProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualPlanChange" ADD CONSTRAINT "IndividualPlanChange_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "IndividualProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualRecord" ADD CONSTRAINT "IndividualRecord_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "IndividualProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualDocument" ADD CONSTRAINT "IndividualDocument_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "IndividualProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualDocument" ADD CONSTRAINT "IndividualDocument_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "IndividualRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualSourceRecord" ADD CONSTRAINT "IndividualSourceRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "IndividualDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualProcessingJob" ADD CONSTRAINT "IndividualProcessingJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "IndividualDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualReconRun" ADD CONSTRAINT "IndividualReconRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "IndividualProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualReconRun" ADD CONSTRAINT "IndividualReconRun_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "IndividualRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualReconRun" ADD CONSTRAINT "IndividualReconRun_sourceAId_fkey" FOREIGN KEY ("sourceAId") REFERENCES "IndividualDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualReconRun" ADD CONSTRAINT "IndividualReconRun_sourceBId_fkey" FOREIGN KEY ("sourceBId") REFERENCES "IndividualDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualReconRun" ADD CONSTRAINT "IndividualReconRun_aisSourceId_fkey" FOREIGN KEY ("aisSourceId") REFERENCES "IndividualDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualReconItem" ADD CONSTRAINT "IndividualReconItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IndividualReconRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualReconItem" ADD CONSTRAINT "IndividualReconItem_recordAId_fkey" FOREIGN KEY ("recordAId") REFERENCES "IndividualSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualReconItem" ADD CONSTRAINT "IndividualReconItem_recordBId_fkey" FOREIGN KEY ("recordBId") REFERENCES "IndividualSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualException" ADD CONSTRAINT "IndividualException_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "IndividualProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualException" ADD CONSTRAINT "IndividualException_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IndividualReconRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualException" ADD CONSTRAINT "IndividualException_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "IndividualRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualReport" ADD CONSTRAINT "IndividualReport_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "IndividualProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualReport" ADD CONSTRAINT "IndividualReport_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "IndividualRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualReport" ADD CONSTRAINT "IndividualReport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "IndividualReconRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndividualUsageLog" ADD CONSTRAINT "IndividualUsageLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "IndividualProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleAccount" ADD CONSTRAINT "GoogleAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
