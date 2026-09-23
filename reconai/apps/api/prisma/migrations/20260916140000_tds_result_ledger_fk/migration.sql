-- Materialize the TdsChecklistResult.ledgerId back-relation into an FK.
-- (The column and its index already exist; this adds referential integrity.)
-- AddForeignKey
ALTER TABLE "TdsChecklistResult" ADD CONSTRAINT "TdsChecklistResult_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "TdsChecklistLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;