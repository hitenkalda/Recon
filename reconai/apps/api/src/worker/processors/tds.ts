import prisma from '../../prisma.js';
import { logger } from '../../logger.js';
import { engine, type ReconRow } from '../../services/engineClient.js';
import type { TdsJob } from '../../queues.js';

const CHUNK = 400;

/** Normalize a row for engine input: { index, data } pairs keyed by rowIndex. */
function toEngineRows(records: Array<{ rowIndex: number | null; data: unknown }>): ReconRow[] {
  return records.map((r) => ({ index: r.rowIndex ?? -1, data: r.data as Record<string, unknown> }));
}

/** Engine returns YYYY-MM-DD for dates; store as Local-midnight Date so the day survives round-trips. */
function toDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T00:00:00`);
}

interface TdsResultRow {
  documentIndex: number | null;
  ledger: string;
  date: string | null;
  due: string | null;
  depDate: string | null;
  [key: string]: unknown;
}

export async function analyzeTds(job: TdsJob): Promise<void> {
  const { runId, firmId } = job;

  const fail = async (message: string) => {
    await prisma.tdsChecklistRun.update({ where: { id: runId }, data: { status: 'failed', error: message } });
    throw new Error(message);
  };

  try {
    const run = await prisma.tdsChecklistRun.findFirst({
      where: { id: runId, firmId },
      include: {
        ledgers: { orderBy: { position: 'asc' } },
        payableDoc: true,
      },
    });
    if (!run) return;

    await prisma.tdsChecklistRun.update({ where: { id: runId }, data: { status: 'running', progress: 10 } });

    // Load the source records for every configured expense ledger document.
    const docRequests = run.ledgers.map(async (lg) => {
      const records = await prisma.sourceRecord.findMany({
        where: { documentId: lg.documentId },
        select: { id: true, rowIndex: true, data: true },
        orderBy: { rowIndex: 'asc' },
      });
      return { led: lg, records };
    });
    const perLedger = await Promise.all(docRequests);

    const payableRecords = run.payableDocId
      ? await prisma.sourceRecord.findMany({
          where: { documentId: run.payableDocId },
          select: { id: true, rowIndex: true, data: true },
          orderBy: { rowIndex: 'asc' },
        })
      : [];

    const config = (run.config ?? {}) as Record<string, unknown>;
    const financialYear = (config.financialYear ?? null) as { from?: number; to?: number } | null;

    await prisma.tdsChecklistRun.update({ where: { id: runId }, data: { progress: 40 } });

    const result = await engine.analyzeTds({
      ledgers: perLedger.map(({ led, records }) => ({
        name: led.name,
        section: led.section,
        tdsCol: led.tdsCol ?? undefined,
        amountCol: led.amountCol ?? undefined,
        rows: toEngineRows(records),
      })),
      payableRows: toEngineRows(payableRecords),
      payableAmountCol: undefined,
      financialYear: financialYear ?? undefined,
      config,
    });

    await prisma.tdsChecklistRun.update({ where: { id: runId }, data: { progress: 70 } });

    // Map engine row indices back to source records per ledger.
    const ledgerIds = new Map<string, string>();
    const indexToRecord = new Map(perLedger.map(({ led, records }) => {
      ledgerIds.set(led.name, led.id);
      return [led.name, new Map(records.map((r) => [String(r.rowIndex), r.id]))] as const;
    }));

    const rows: Array<{
      firmId: string;
      runId: string;
      ledgerId: string | null;
      sourceRecordId: string | null;
      section: string;
      sectionKey: string;
      sectionName: string;
      party: string;
      partyType: string;
      date: Date | null;
      voucher: string | null;
      narration: string | null;
      gross: number;
      cumulative: number;
      rate: number;
      tdsReq: number;
      tdsDed: number;
      diff: number;
      dedStatus: string;
      dedKey: string;
      remark: string | null;
      quarter: string | null;
      due: Date | null;
      depDate: Date | null;
      depAmt: number;
      depStatus: string;
      daysLate: number | null;
      interest: number;
    }> = (result.results as unknown as TdsResultRow[]).map((r) => ({
      firmId,
      runId,
      ledgerId: ledgerIds.get(r.ledger) ?? null,
      sourceRecordId: (indexToRecord.get(r.ledger)?.get(String(r.documentIndex)) ?? null) as string | null,
      section: String(r.section ?? ''),
      sectionKey: String(r.sectionKey ?? ''),
      sectionName: String(r.sectionName ?? ''),
      party: String(r.party ?? ''),
      partyType: String(r.partyType ?? ''),
      date: toDate(r.date),
      voucher: r.voucher ? String(r.voucher) : null,
      narration: r.narration ? String(r.narration) : null,
      gross: Number(r.gross ?? 0),
      cumulative: Number(r.cumulative ?? 0),
      rate: Number(r.rate ?? 0),
      tdsReq: Number(r.tdsReq ?? 0),
      tdsDed: Number(r.tdsDed ?? 0),
      diff: Number(r.diff ?? 0),
      dedStatus: String(r.dedStatus ?? ''),
      dedKey: String(r.dedKey ?? ''),
      remark: r.remark ? String(r.remark) : null,
      quarter: r.quarter ? String(r.quarter) : null,
      due: toDate(r.due as string | null),
      depDate: toDate(r.depDate as string | null),
      depAmt: Number(r.depAmt ?? 0),
      depStatus: String(r.depStatus ?? ''),
      daysLate: r.daysLate != null ? Number(r.daysLate) : null,
      interest: Number(r.interest ?? 0),
    }));

    await prisma.$transaction(async (tx) => {
      await tx.tdsChecklistResult.deleteMany({ where: { runId } });
      for (let i = 0; i < rows.length; i += CHUNK) {
        await tx.tdsChecklistResult.createMany({ data: rows.slice(i, i + CHUNK) });
      }
    });

    const metrics = {
      summary: result.summary,
      sectionSummary: result.sectionSummary,
      monthRecon: result.monthRecon,
      monthReconMeta: result.monthReconMeta,
    } as Record<string, unknown>;
    await prisma.tdsChecklistRun.update({
      where: { id: runId },
      data: { status: 'completed', progress: 100, metrics: metrics as object },
    });

    await generateExceptions(runId, firmId, run.engagementId, run.clientId, rows);
    logger.info(
      { runId, transactions: result.summary.transactionCount, short: result.summary.shortAmount },
      'TDS checklist completed',
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'TDS checklist analysis failed';
    logger.error({ runId, err: message }, 'TDS checklist analysis failed');
    await fail(message);
  }
}

/**
 * Derive exceptions from the TDS findings (capped ~250, tenant-scoped).
 *
 * Severity mapping (deterministic — no AI involved):
 *   NOT DEDUCTED / NOT DEPOSITED           → high
 *   SHORT DEDUCTION / PARTIALLY DEPOSITED / LATE DEPOSIT → medium
 *   EXCESS DEDUCTION                       → low
 * The auditor confirms each from the UI (Phase F), so the inbox stays actionable.
 */
async function generateExceptions(
  runId: string,
  firmId: string,
  engagementId: string,
  clientId: string,
  results: Array<{
    id?: string;
    dedStatus: string;
    depStatus: string;
    party: string;
    section: string;
    ledgerId: string | null;
    sourceRecordId: string | null;
    tdsReq: number;
    tdsDed: number;
    gross: number;
  }>,
): Promise<void> {
  const high = results
    .filter((r) => r.dedStatus === 'NOT DEDUCTED' || r.depStatus === 'NOT DEPOSITED')
    .slice(0, 100);
  const medium = results
    .filter((r) =>
      (r.dedStatus === 'SHORT DEDUCTION' || r.depStatus === 'PARTIALLY DEPOSITED' || r.depStatus === 'LATE DEPOSIT'))
    .slice(0, 120);
  const excess = results.filter((r) => r.dedStatus === 'EXCESS DEDUCTION').slice(0, 30);

  const refs = (resultId: string | null) => [
    ...(resultId ? [{ kind: 'tds_result', id: resultId }] : []),
    { kind: 'tds_run', id: runId },
  ];

  const rows = [
    ...high.map((r) => ({
      firmId, engagementId, clientId, tdsChecklistRunId: runId,
      kind: 'tds_not_deducted', severity: 'high', status: 'open',
      title: `TDS not deducted — ${r.party} (${r.section})`,
      description: `TDS of ${r.tdsReq.toFixed(2)} was required on a payment of ${r.gross.toFixed(2)} but was not deducted. Note: the threshold-crossing rule charges TDS on the full cumulative amount.`,
      references: refs(r.sourceRecordId),
    })),
    ...medium.map((r) => {
      const isDepositIssue = r.depStatus === 'LATE DEPOSIT' || r.depStatus === 'PARTIALLY DEPOSITED';
      return {
        firmId, engagementId, clientId, tdsChecklistRunId: runId,
        kind: isDepositIssue ? 'tds_deposit_short' : 'tds_short_deduction',
        severity: 'medium', status: 'open',
        title: isDepositIssue
          ? `TDS deposit issue — ${r.party} (${r.section})`
          : `TDS short-deducted — ${r.party} (${r.section})`,
        description: isDepositIssue
          ? `Deposit status for ${r.party}: ${r.depStatus}. Deducted ${r.tdsDed.toFixed(2)} vs required ${r.tdsReq.toFixed(2)}. Confirm the challan deposit and interest.`
          : `Deducted ${r.tdsDed.toFixed(2)} vs required ${r.tdsReq.toFixed(2)} for ${r.party} — short by ${(r.tdsReq - r.tdsDed).toFixed(2)}.`,
        references: refs(r.sourceRecordId),
      };
    }),
    ...excess.map((r) => ({
      firmId, engagementId, clientId, tdsChecklistRunId: runId,
      kind: 'tds_excess_deduction', severity: 'low', status: 'open',
      title: `Possible excess TDS deducted — ${r.party} (${r.section})`,
      description: `Deducted ${r.tdsDed.toFixed(2)} vs required ${r.tdsReq.toFixed(2)} for ${r.party} — excess of ${(r.tdsDed - r.tdsReq).toFixed(2)}. Verify rate/threshold application.`,
      references: refs(r.sourceRecordId),
    })),
  ];

  if (!rows.length) return;
  await prisma.$transaction(async (tx) => {
    await tx.exception.createMany({ data: rows as never });
  });
  logger.info({ runId, exceptions: rows.length }, 'TDS exceptions generated');
}