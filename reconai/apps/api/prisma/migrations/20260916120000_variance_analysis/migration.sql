-- CreateTable
CREATE TABLE "VarianceAnalysisRun" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "priorDocId" TEXT,
    "currentDocId" TEXT,
    "metrics" JSONB,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VarianceAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VarianceAnalysisResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "particulars" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priorRecordId" TEXT,
    "currentRecordId" TEXT,
    "priorClosing" DOUBLE PRECISION,
    "currentClosing" DOUBLE PRECISION,
    "variance" DOUBLE PRECISION,
    "varPct" DOUBLE PRECISION,
    "obMismatch" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VarianceAnalysisResult_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Exception" ADD COLUMN "varianceAnalysisRunId" TEXT;

-- CreateIndex
CREATE INDEX "VarianceAnalysisRun_firmId_idx" ON "VarianceAnalysisRun"("firmId");

-- CreateIndex
CREATE INDEX "VarianceAnalysisRun_engagementId_idx" ON "VarianceAnalysisRun"("engagementId");

-- CreateIndex
CREATE INDEX "VarianceAnalysisRun_clientId_idx" ON "VarianceAnalysisRun"("clientId");

-- CreateIndex
CREATE INDEX "VarianceAnalysisRun_status_idx" ON "VarianceAnalysisRun"("status");

-- CreateIndex
CREATE INDEX "VarianceAnalysisResult_runId_idx" ON "VarianceAnalysisResult"("runId");

-- CreateIndex
CREATE INDEX "VarianceAnalysisResult_firmId_idx" ON "VarianceAnalysisResult"("firmId");

-- CreateIndex
CREATE INDEX "VarianceAnalysisResult_runId_category_idx" ON "VarianceAnalysisResult"("runId", "category");

-- CreateIndex
CREATE INDEX "VarianceAnalysisResult_priorRecordId_idx" ON "VarianceAnalysisResult"("priorRecordId");

-- CreateIndex
CREATE INDEX "VarianceAnalysisResult_currentRecordId_idx" ON "VarianceAnalysisResult"("currentRecordId");

-- AddForeignKey
ALTER TABLE "VarianceAnalysisRun" ADD CONSTRAINT "VarianceAnalysisRun_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianceAnalysisRun" ADD CONSTRAINT "VarianceAnalysisRun_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianceAnalysisRun" ADD CONSTRAINT "VarianceAnalysisRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianceAnalysisRun" ADD CONSTRAINT "VarianceAnalysisRun_priorDocId_fkey" FOREIGN KEY ("priorDocId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianceAnalysisRun" ADD CONSTRAINT "VarianceAnalysisRun_currentDocId_fkey" FOREIGN KEY ("currentDocId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianceAnalysisResult" ADD CONSTRAINT "VarianceAnalysisResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "VarianceAnalysisRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianceAnalysisResult" ADD CONSTRAINT "VarianceAnalysisResult_priorRecordId_fkey" FOREIGN KEY ("priorRecordId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianceAnalysisResult" ADD CONSTRAINT "VarianceAnalysisResult_currentRecordId_fkey" FOREIGN KEY ("currentRecordId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_varianceAnalysisRunId_fkey" FOREIGN KEY ("varianceAnalysisRunId") REFERENCES "VarianceAnalysisRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;