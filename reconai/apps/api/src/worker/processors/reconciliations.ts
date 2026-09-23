import prisma from '../../prisma.js';
import { logger } from '../../logger.js';
import { engine } from '../../services/engineClient.js';
import { toPaise } from '@reconai/shared';
import type { ReconJob } from '../../queues.js';
import type { MatchStatus } from '@reconai/shared';

const CHUNK = 400;

/** Normalize a row for engine input: { index, data } pairs kept keyed by rowIndex. */
function toEngineRows(records: Array<{ rowIndex: number | null; data: unknown }>) {
  return records.map((r) => ({ index: r.rowIndex ?? -1, data: r.data as Record<string, unknown> }));
}

export async function runReconciliation(job: ReconJob): Promise<void> {
  const { runId, firmId } = job;

  const fail = async (message: string) => {
    await prisma.reconRun.update({ where: { id: runId }, data: { status: 'failed', error: message } });
    throw new Error(message);
  };

  try {
    const run = await prisma.reconRun.findFirst({
      where: { id: runId, firmId },
      include: { sourceA: true, sourceB: true, aisSource: true },
    });
    if (!run) return;

    await prisma.reconRun.update({ where: { id: runId }, data: { status: 'running', progress: 10 } });

    const [recordsA, recordsB] = run.type === 'ais_26as'
      ? [await fetchRecords(run.aisSourceId), run.sourceBId ? await fetchRecords(run.sourceBId) : []]
      : [await fetchRecords(run.sourceAId), await fetchRecords(run.sourceBId)];

    const params = (run.config ?? {}) as Record<string, unknown>;
    await prisma.reconRun.update({ where: { id: runId }, data: { progress: 40 } });

    const result = await engine.reconcile({
      runType: run.type as 'gst' | 'bank' | 'ais_26as',
      rowsA: toEngineRows(recordsA),
      rowsB: toEngineRows(recordsB),
      params,
      config: params,
    });

    await prisma.reconRun.update({ where: { id: runId }, data: { progress: 70 } });

    // Map engine rows back to source records via their index.
    const indexA = new Map(recordsA.map((r) => [String(r.rowIndex), r.id]));
    const indexB = new Map(recordsB.map((r) => [String(r.rowIndex), r.id]));
    const amountOf = (row: Record<string, unknown> | undefined, taxTds: number | null | undefined): number | null => {
      if (row?.data) {
        const d = row.data as Record<string, unknown>;
        const a = d.amount;
        if (typeof a === 'number') return toPaise(a);
        if (typeof a === 'string' && a.trim() !== '') return toPaise(parseFloat(a) || 0);
      }
      // 26AS/AIS rows carry TDS in the tax payload, not always in data.amount.
      if (typeof taxTds === 'number') return toPaise(taxTds);
      return null;
    };

    const items: Array<{
      firmId: string;
      runId: string;
      recordAId: string | null;
      recordBId: string | null;
      matchStatus: MatchStatus;
      score: number | undefined;
      reasons: string[];
      amountPaiseA: number | null;
      amountPaiseB: number | null;
      variancePaise: number | null;
    }> = [];
    for (const item of result.items) {
      const aIndex = String((item.recordA as { index?: number | null } | undefined)?.index ?? '');
      const bIndex = String((item.recordB as { index?: number | null } | undefined)?.index ?? '');
      const recordAId = aIndex ? indexA.get(aIndex) : null;
      const recordBId = bIndex ? indexB.get(bIndex) : null;
      const paiseA = amountOf(item.recordA as Record<string, unknown> | undefined, item.tax?.tdsA ?? item.tax?.tds);
      const paiseB = amountOf(item.recordB as Record<string, unknown> | undefined, item.tax?.tdsB ?? item.tax?.tds);
      items.push({
        firmId,
        runId,
        recordAId: recordAId ?? null,
        recordBId: recordBId ?? null,
        matchStatus: item.matchStatus as MatchStatus,
        score: item.score,
        reasons: item.reasons ?? [],
        amountPaiseA: paiseA,
        amountPaiseB: paiseB,
        variancePaise: paiseA !== null && paiseB !== null ? paiseA - paiseB : null,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.reconItem.deleteMany({ where: { runId } });
      for (let i = 0; i < items.length; i += CHUNK) {
        await tx.reconItem.createMany({ data: items.slice(i, i + CHUNK) });
      }
    });

    const metrics = (result.metrics ?? {}) as Record<string, unknown>;
    await prisma.reconRun.update({
      where: { id: runId },
      data: { status: 'completed', progress: 100, metrics: metrics as object },
    });

    await generateExceptions(runId, firmId, run.engagementId, run.clientId, items, metrics, run.type);
    logger.info({ runId, matched: metrics.matchedCount, unmatched: metrics.unmatchedCount }, 'reconciliation completed');
  } catch (e) {
    const message = e instanceof Error ? e.message : 'reconciliation failed';
    logger.error({ runId, err: message }, 'reconciliation failed');
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

/** Derive exceptions from unmatched items + tax-specific findings (capped, deduped, tenant-scoped). */
async function generateExceptions(
  runId: string,
  firmId: string,
  engagementId: string,
  clientId: string,
  items: Array<{
    matchStatus: MatchStatus;
    recordAId: string | null;
    recordBId: string | null;
    variancePaise: number | null;
    amountPaiseA: number | null;
    amountPaiseB: number | null;
  }>,
  metrics: Record<string, unknown>,
  runType?: string,
): Promise<void> {
  if (runType === 'ais_26as') {
    await generateTaxExceptions(runId, firmId, engagementId, clientId, items, metrics);
    return;
  }
  // A-present but B-missing (ITC not available / missing invoice)
  const missingInvoice = items
    .filter((i) => i.matchStatus === 'unmatched' && i.recordAId && !i.recordBId)
    .slice(0, 150);
  // B-present but A-missing (claimed ITC not in books)
  const itcBlocked = items
    .filter((i) => i.matchStatus === 'unmatched' && i.recordBId && !i.recordAId)
    .slice(0, 150);
  // Amount-mismatched pairs
  const mismatches = items
    .filter((i) => i.matchStatus === 'unmatched' && i.recordAId && i.recordBId && (i.variancePaise ?? 0) !== 0)
    .slice(0, 100);

  const rows = [
    ...missingInvoice.map((i) => ({
      firmId, runId, engagementId, clientId,
      kind: 'missing_invoice', severity: 'medium', status: 'open',
      title: 'Purchase entry present in books but missing in GSTR-2B',
      description: 'No matching invoice/entry found on the counterpart side. Vendor may not have filed, or entry is misclassified.',
      references: [{ kind: 'recon_item', id: i.recordAId }] as object,
    })),
    ...itcBlocked.map((i) => ({
      firmId, runId, engagementId, clientId,
      kind: 'itc_not_available', severity: 'high', status: 'open',
      title: 'ITC available in GSTR-2B but not recorded in books',
      description: 'Supplier reported this invoice to the portal, but your books do not show the purchase entry.',
      references: [{ kind: 'recon_item', id: i.recordBId }] as object,
    })),
    ...mismatches.map((i) => ({
      firmId, runId, engagementId, clientId,
      kind: 'amount_mismatch', severity: 'medium', status: 'open',
      title: 'Amount mismatch between books and return',
      description: 'Amounts differ between the two sources for this transaction.',
      references: [{ kind: 'recon_item', id: i.recordAId }] as object,
    })),
  ];

  const duplicates = Number(metrics.duplicates ?? 0);
  if (duplicates > 0) {
    rows.push({
      firmId, runId, engagementId, clientId,
      kind: 'duplicate', severity: 'medium', status: 'open',
      title: `${duplicates} potential duplicate entr${duplicates === 1 ? 'y' : 'ies'} detected`,
      description: 'The matching engine flagged rows that reference the same invoice/reference.',
      references: [{ kind: 'run', id: runId }] as object,
    });
  }

  if (!rows.length) return;
  await prisma.$transaction(async (tx) => {
    await tx.exception.createMany({ data: rows as never });
  });
  logger.info({ runId, exceptions: rows.length }, 'exceptions generated');
}

/** 26AS/AIS tax-specific exceptions (Phase 8). Deterministic severity buckets:
 *  high — TDS booked but missing in 26AS (deductor may not have filed), income
 *         mismatch / section mismatch above a TDS threshold, sizeable unmatched;
 *  medium — 26AS credit not booked in accounts, small TDS amount differences,
 *         duplicates. */
async function generateTaxExceptions(
  runId: string,
  firmId: string,
  engagementId: string,
  clientId: string,
  items: Array<{
    matchStatus: MatchStatus;
    recordAId: string | null;
    recordBId: string | null;
    amountPaiseA: number | null;
    amountPaiseB: number | null;
  }>,
  metrics: Record<string, unknown>,
): Promise<void> {
  const tax = (metrics.tax ?? {}) as Record<string, unknown>;
  const thresholds = (tax.thresholds ?? {}) as Record<string, unknown>;
  const highRiskPaise = Math.round(Number(thresholds.highRiskTds ?? 50000) * 100);
  const ref = (id: string | null) => (id ? [{ kind: 'recon_item', id }] as object : [{ kind: 'run', id: runId }] as object);

  const in26as = items.filter((i) => i.matchStatus === 'unmatched' && i.recordBId && !i.recordAId).slice(0, 150);
  const inBooks = items.filter((i) => i.matchStatus === 'unmatched' && i.recordAId && !i.recordBId).slice(0, 150);
  const income = items.filter((i) => i.matchStatus === 'income_mismatch').slice(0, 100);
  const section = items.filter((i) => i.matchStatus === 'section_mismatch').slice(0, 100);
  const amountDiff = items.filter((i) => i.matchStatus === 'amount_tolerance').slice(0, 100);
  const duplicates = items.filter((i) => i.matchStatus === 'duplicate').slice(0, 100);
  const big = (i: { amountPaiseA: number | null; amountPaiseB: number | null }) =>
    Math.max(i.amountPaiseA ?? 0, i.amountPaiseB ?? 0) >= highRiskPaise;

  const rows: Array<Record<string, unknown>> = [
    ...in26as.map((i) => ({
      firmId, runId, engagementId, clientId,
      kind: 'tax_credit_not_in_26as', severity: big(i) ? 'high' : 'medium', status: 'open',
      title: 'TDS booked in accounts but not reflecting in 26AS',
      description: 'Booked TDS does not appear against this deductor in the 26AS statement. Verify the deductor filed and deposited the TDS — the tax credit may be at risk.',
      references: ref(i.recordBId),
    })),
    ...inBooks.map((i) => ({
      firmId, runId, engagementId, clientId,
      kind: 'tax_credit_missing_in_books', severity: 'medium', status: 'open',
      title: 'TDS deducted per 26AS not booked in accounts',
      description: 'The 26AS statement shows TDS that does not appear in the books for this deductor. Junior accountants may need to book the income / TDS credit.',
      references: ref(i.recordAId),
    })),
    ...income.map((i) => ({
      firmId, runId, engagementId, clientId,
      kind: 'tax_income_mismatch', severity: big(i) ? 'high' : 'medium', status: 'open',
      title: 'Gross income mismatch between books and 26AS',
      description: 'TDS matches but the gross income on the pair differs — a probable data-entry error on income or credit note not captured in 26AS.',
      references: ref(i.recordAId),
    })),
    ...section.map((i) => ({
      firmId, runId, engagementId, clientId,
      kind: 'tax_section_mismatch', severity: big(i) ? 'high' : 'medium', status: 'open',
      title: 'TDS section mismatch between books and 26AS',
      description: 'The TDS section on the book entry differs from the section reflected in 26AS for the same PAN/TAN, amount and period.',
      references: ref(i.recordAId),
    })),
    ...amountDiff.map((i) => ({
      firmId, runId, engagementId, clientId,
      kind: 'tax_tds_amount_diff', severity: 'medium', status: 'open',
      title: 'TDS amount difference on matched pair',
      description: 'TDS amount booked differs from the 26AS figure beyond the configured tolerance.',
      references: ref(i.recordAId),
    })),
    ...duplicates.map((i) => ({
      firmId, runId, engagementId, clientId,
      kind: 'tax_duplicate', severity: 'low', status: 'open',
      title: 'Potential duplicate 26AS/books TDS entry',
      description: 'The engine flagged rows with the same PAN/TAN, section, quarter and amount — likely booked (or filed) twice.',
      references: ref(i.recordAId ?? i.recordBId),
    })),
  ];

  if (!rows.length) return;
  await prisma.$transaction(async (tx) => {
    await tx.exception.createMany({ data: rows as never });
  });
  logger.info({ runId, exceptions: rows.length }, 'TDS exceptions generated');
}