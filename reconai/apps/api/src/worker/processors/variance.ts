import prisma from '../../prisma.js';
import { logger } from '../../logger.js';
import { engine } from '../../services/engineClient.js';
import type { VarianceJob } from '../../queues.js';

const CHUNK = 400;

/** Normalize a row for engine input: { index, data } pairs keyed by rowIndex. */
function toEngineRows(records: Array<{ rowIndex: number | null; data: unknown }>) {
  return records.map((r) => ({ index: r.rowIndex ?? -1, data: r.data as Record<string, unknown> }));
}

export interface VarianceEngineResult {
  results: Array<{
    particulars: string;
    category: string;
    priorClosing: number | null;
    currentClosing: number | null;
    variance: number | null;
    varPct: number | null;
    obMismatch: number | null;
    priorIndex: number | null;
    currentIndex: number | null;
  }>;
  obReconciliation: Array<{ particulars: string; opening: number | null; priorClosing: number | null; mismatch: number | null }>;
  summary: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export async function analyzeVariance(job: VarianceJob): Promise<void> {
  const { runId, firmId } = job;

  const fail = async (message: string) => {
    await prisma.varianceAnalysisRun.update({ where: { id: runId }, data: { status: 'failed', error: message } });
    throw new Error(message);
  };

  try {
    const run = await prisma.varianceAnalysisRun.findFirst({
      where: { id: runId, firmId },
      include: { priorDoc: true, currentDoc: true },
    });
    if (!run) return;

    await prisma.varianceAnalysisRun.update({ where: { id: runId }, data: { status: 'running', progress: 10 } });

    const recordsPrior = await fetchRecords(run.priorDocId);
    const recordsCurrent = await fetchRecords(run.currentDocId);
    const config = (run.config ?? {}) as Record<string, unknown>;

    await prisma.varianceAnalysisRun.update({ where: { id: runId }, data: { progress: 40 } });

    const result = await engine.analyzeVariance({
      rowsA: toEngineRows(recordsPrior),
      rowsB: toEngineRows(recordsCurrent),
      config,
    });

    await prisma.varianceAnalysisRun.update({ where: { id: runId }, data: { progress: 70 } });

    // Map engine row indices back to source records.
    const indexPrior = new Map(recordsPrior.map((r) => [String(r.rowIndex), r.id]));
    const indexCurrent = new Map(recordsCurrent.map((r) => [String(r.rowIndex), r.id]));

    const results = result.results.map((r) => ({
      firmId,
      runId,
      particulars: r.particulars,
      category: r.category,
      priorRecordId: r.priorIndex != null ? indexPrior.get(String(r.priorIndex)) ?? null : null,
      currentRecordId: r.currentIndex != null ? indexCurrent.get(String(r.currentIndex)) ?? null : null,
      priorClosing: r.priorClosing,
      currentClosing: r.currentClosing,
      variance: r.variance,
      varPct: r.varPct,
      obMismatch: r.obMismatch,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.varianceAnalysisResult.deleteMany({ where: { runId } });
      for (let i = 0; i < results.length; i += CHUNK) {
        await tx.varianceAnalysisResult.createMany({ data: results.slice(i, i + CHUNK) });
      }
    });

    const summary = { ...result.summary } as Record<string, unknown>;
    await prisma.varianceAnalysisRun.update({
      where: { id: runId },
      data: { status: 'completed', progress: 100, metrics: summary as object },
    });

    await generateExceptions(runId, firmId, run.engagementId, run.clientId, results);
    logger.info(
      { runId, detailed: summary.detailedReview, quick: summary.quickReview, newLedgers: summary.newLedgers },
      'variance analysis completed',
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'variance analysis failed';
    logger.error({ runId, err: message }, 'variance analysis failed');
    await fail(message);
  }
}

async function fetchRecords(documentId: string | null | undefined) {
  if (!documentId) return [];
  return prisma.sourceRecord.findMany({
    where: { documentId },
    select: { id: true, rowIndex: true, data: true },
    orderBy: { rowIndex: 'asc' },
  });
}

/**
 * Derive exceptions from the variance findings (capped ~250, tenant-scoped).
 *
 * Severity mapping (deterministic — no AI involved):
 *   detailed_review with |varPct| ≥ 50 → high
 *   other detailed_review               → medium
 *   opening-balance mismatch            → medium
 *   dropped ledger                      → medium
 * Quick Review (10–20%) and within-threshold results are NOT auto-created —
 * the auditor flags those from the UI (Phase F), so the exception inbox stays
 * actionable rather than flooded.
 */
async function generateExceptions(
  runId: string,
  firmId: string,
  engagementId: string,
  clientId: string,
  results: Array<{
    particulars: string;
    category: string;
    varPct: number | null;
    obMismatch: number | null;
    currentRecordId: string | null;
    priorRecordId: string | null;
  }>,
): Promise<void> {
  const high = results
    .filter((r) => r.category === 'detailed_review' && r.varPct != null && Math.abs(r.varPct) >= 50)
    .slice(0, 100);
  const mediumDetailed = results
    .filter((r) => r.category === 'detailed_review' && !(r.varPct != null && Math.abs(r.varPct) >= 50))
    .slice(0, 80);
  const dropped = results.filter((r) => r.category === 'dropped').slice(0, 40);
  const obMismatches = results
    .filter((r) => r.obMismatch != null && r.obMismatch > 0)
    .slice(0, 30);

  const refs = (resultId: string) => [
    { kind: 'variance_result', id: resultId },
    { kind: 'variance_run', id: runId },
  ];

  const rows = [
    ...high.map((r) => ({
      firmId, engagementId, clientId, varianceAnalysisRunId: runId,
      kind: 'variance_high', severity: 'high', status: 'open',
      title: `Large variance on ${r.particulars}`,
      description: `P&L variance of ${Math.abs(r.varPct ?? 0).toFixed(1)}% crosses the 50% threshold. Requires detailed review and senior/partner sign-off.`,
      references: refs(r.currentRecordId ?? ''),
    })),
    ...mediumDetailed.map((r) => ({
      firmId, engagementId, clientId, varianceAnalysisRunId: runId,
      kind: 'variance_detailed', severity: 'medium', status: 'open',
      title: `Variance above 20% on ${r.particulars}`,
      description: `P&L variance of ${Math.abs(r.varPct ?? 0).toFixed(1)}% requires detailed review.`,
      references: refs(r.currentRecordId ?? ''),
    })),
    ...dropped.map((r) => ({
      firmId, engagementId, clientId, varianceAnalysisRunId: runId,
      kind: 'ledger_dropped', severity: 'medium', status: 'open',
      title: `Ledger ${r.particulars} absent in current TB`,
      description: 'This ledger appeared in the prior trial balance but not in the current one. Confirm it was merged, renamed, or genuinely discontinued.',
      references: refs(r.currentRecordId ?? r.priorRecordId ?? ''),
    })),
    ...obMismatches.map((r) => ({
      firmId, engagementId, clientId, varianceAnalysisRunId: runId,
      kind: 'ob_mismatch', severity: 'medium', status: 'open',
      title: `Opening balance mismatch on ${r.particulars}`,
      description: `Current opening balance differs from the prior closing balance by ${(r.obMismatch ?? 0).toFixed(2)}.`,
      references: refs(r.currentRecordId ?? r.priorRecordId ?? ''),
    })),
  ];

  if (!rows.length) return;
  await prisma.$transaction(async (tx) => {
    await tx.exception.createMany({ data: rows as never });
  });
  logger.info({ runId, exceptions: rows.length }, 'variance exceptions generated');
}