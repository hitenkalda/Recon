import prisma from '../../prisma.js';
import { logger } from '../../logger.js';
import { engine } from '../../services/engineClient.js';
import { toPaise } from '@reconai/shared';
const CHUNK = 400;
/** Normalize a row for engine input: { index, data } pairs kept keyed by rowIndex. */
function toEngineRows(records) {
    return records.map((r) => ({ index: r.rowIndex ?? -1, data: r.data }));
}
export async function runReconciliation(job) {
    const { runId, firmId } = job;
    const fail = async (message) => {
        await prisma.reconRun.update({ where: { id: runId }, data: { status: 'failed', error: message } });
        throw new Error(message);
    };
    try {
        const run = await prisma.reconRun.findFirst({
            where: { id: runId, firmId },
            include: { sourceA: true, sourceB: true, aisSource: true },
        });
        if (!run)
            return;
        await prisma.reconRun.update({ where: { id: runId }, data: { status: 'running', progress: 10 } });
        const [recordsA, recordsB] = run.type === 'ais_26as'
            ? [await fetchRecords(run.aisSourceId), run.sourceBId ? await fetchRecords(run.sourceBId) : []]
            : [await fetchRecords(run.sourceAId), await fetchRecords(run.sourceBId)];
        const params = (run.config ?? {});
        await prisma.reconRun.update({ where: { id: runId }, data: { progress: 40 } });
        const result = await engine.reconcile({
            runType: run.type,
            rowsA: toEngineRows(recordsA),
            rowsB: toEngineRows(recordsB),
            params,
            config: params,
        });
        await prisma.reconRun.update({ where: { id: runId }, data: { progress: 70 } });
        // Map engine rows back to source records via their index.
        const indexA = new Map(recordsA.map((r) => [String(r.rowIndex), r.id]));
        const indexB = new Map(recordsB.map((r) => [String(r.rowIndex), r.id]));
        const amountOf = (row) => {
            if (!row?.data)
                return null;
            const a = row.data.amount;
            if (typeof a === 'number')
                return toPaise(a);
            if (typeof a === 'string')
                return toPaise(parseFloat(a) || 0);
            const a2 = row.amount;
            if (typeof a2 === 'number')
                return toPaise(a2);
            return null;
        };
        const items = [];
        for (const item of result.items) {
            const aIndex = String(item.recordA?.index ?? '');
            const bIndex = String(item.recordB?.index ?? '');
            const recordAId = aIndex ? indexA.get(aIndex) : null;
            const recordBId = bIndex ? indexB.get(bIndex) : null;
            const paiseA = amountOf(item.recordA);
            const paiseB = amountOf(item.recordB);
            items.push({
                firmId,
                runId,
                recordAId: recordAId ?? null,
                recordBId: recordBId ?? null,
                matchStatus: item.matchStatus,
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
        const metrics = (result.metrics ?? {});
        await prisma.reconRun.update({
            where: { id: runId },
            data: { status: 'completed', progress: 100, metrics: metrics },
        });
        await generateExceptions(runId, firmId, run.engagementId, run.clientId, items, metrics);
        logger.info({ runId, matched: metrics.matchedCount, unmatched: metrics.unmatchedCount }, 'reconciliation completed');
    }
    catch (e) {
        const message = e instanceof Error ? e.message : 'reconciliation failed';
        logger.error({ runId, err: message }, 'reconciliation failed');
        await fail(message);
    }
}
async function fetchRecords(documentId) {
    if (!documentId)
        return [];
    return prisma.sourceRecord.findMany({
        where: { documentId },
        select: { id: true, rowIndex: true, data: true },
        orderBy: { rowIndex: 'asc' },
    });
}
/** Derive exceptions from unmatched items (capped, deduped, tenant-scoped). */
async function generateExceptions(runId, firmId, engagementId, clientId, items, metrics) {
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
            references: [{ kind: 'recon_item', id: i.recordAId }],
        })),
        ...itcBlocked.map((i) => ({
            firmId, runId, engagementId, clientId,
            kind: 'itc_not_available', severity: 'high', status: 'open',
            title: 'ITC available in GSTR-2B but not recorded in books',
            description: 'Supplier reported this invoice to the portal, but your books do not show the purchase entry.',
            references: [{ kind: 'recon_item', id: i.recordBId }],
        })),
        ...mismatches.map((i) => ({
            firmId, runId, engagementId, clientId,
            kind: 'amount_mismatch', severity: 'medium', status: 'open',
            title: 'Amount mismatch between books and return',
            description: 'Amounts differ between the two sources for this transaction.',
            references: [{ kind: 'recon_item', id: i.recordAId }],
        })),
    ];
    const duplicates = Number(metrics.duplicates ?? 0);
    if (duplicates > 0) {
        rows.push({
            firmId, runId, engagementId, clientId,
            kind: 'duplicate', severity: 'medium', status: 'open',
            title: `${duplicates} potential duplicate entr${duplicates === 1 ? 'y' : 'ies'} detected`,
            description: 'The matching engine flagged rows that reference the same invoice/reference.',
            references: [{ kind: 'run', id: runId }],
        });
    }
    if (!rows.length)
        return;
    await prisma.$transaction(async (tx) => {
        await tx.exception.createMany({ data: rows });
    });
    logger.info({ runId, exceptions: rows.length }, 'exceptions generated');
}
//# sourceMappingURL=reconciliations.js.map