-- CreateTable
CREATE TABLE "TdsChecklistRun" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "payableDocId" TEXT,
    "metrics" JSONB,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TdsChecklistRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TdsChecklistLedger" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "tdsCol" TEXT,
    "amountCol" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TdsChecklistLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TdsChecklistResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "ledgerId" TEXT,
    "sourceRecordId" TEXT,
    "section" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "voucher" TEXT,
    "narration" TEXT,
    "gross" DOUBLE PRECISION NOT NULL,
    "cumulative" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "tdsReq" DOUBLE PRECISION NOT NULL,
    "tdsDed" DOUBLE PRECISION NOT NULL,
    "diff" DOUBLE PRECISION NOT NULL,
    "dedStatus" TEXT NOT NULL,
    "dedKey" TEXT NOT NULL,
    "remark" TEXT,
    "quarter" TEXT,
    "due" TIMESTAMP(3),
    "depDate" TIMESTAMP(3),
    "depAmt" DOUBLE PRECISION NOT NULL,
    "depStatus" TEXT NOT NULL,
    "daysLate" INTEGER,
    "interest" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TdsChecklistResult_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Exception" ADD COLUMN "tdsChecklistRunId" TEXT;

-- CreateIndex
CREATE INDEX "TdsChecklistRun_firmId_idx" ON "TdsChecklistRun"("firmId");

-- CreateIndex
CREATE INDEX "TdsChecklistRun_engagementId_idx" ON "TdsChecklistRun"("engagementId");

-- CreateIndex
CREATE INDEX "TdsChecklistRun_clientId_idx" ON "TdsChecklistRun"("clientId");

-- CreateIndex
CREATE INDEX "TdsChecklistRun_status_idx" ON "TdsChecklistRun"("status");

-- CreateIndex
CREATE INDEX "TdsChecklistLedger_runId_idx" ON "TdsChecklistLedger"("runId");

-- CreateIndex
CREATE INDEX "TdsChecklistLedger_documentId_idx" ON "TdsChecklistLedger"("documentId");

-- CreateIndex
CREATE INDEX "TdsChecklistResult_runId_idx" ON "TdsChecklistResult"("runId");

-- CreateIndex
CREATE INDEX "TdsChecklistResult_firmId_idx" ON "TdsChecklistResult"("firmId");

-- CreateIndex
CREATE INDEX "TdsChecklistResult_runId_dedKey_idx" ON "TdsChecklistResult"("runId", "dedKey");

-- CreateIndex
CREATE INDEX "TdsChecklistResult_ledgerId_idx" ON "TdsChecklistResult"("ledgerId");

-- CreateIndex
CREATE INDEX "TdsChecklistResult_sourceRecordId_idx" ON "TdsChecklistResult"("sourceRecordId");

-- AddForeignKey
ALTER TABLE "TdsChecklistRun" ADD CONSTRAINT "TdsChecklistRun_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsChecklistRun" ADD CONSTRAINT "TdsChecklistRun_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsChecklistRun" ADD CONSTRAINT "TdsChecklistRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsChecklistRun" ADD CONSTRAINT "TdsChecklistRun_payableDocId_fkey" FOREIGN KEY ("payableDocId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsChecklistLedger" ADD CONSTRAINT "TdsChecklistLedger_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TdsChecklistRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsChecklistLedger" ADD CONSTRAINT "TdsChecklistLedger_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsChecklistResult" ADD CONSTRAINT "TdsChecklistResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TdsChecklistRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsChecklistResult" ADD CONSTRAINT "TdsChecklistResult_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "SourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_tdsChecklistRunId_fkey" FOREIGN KEY ("tdsChecklistRunId") REFERENCES "TdsChecklistRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;