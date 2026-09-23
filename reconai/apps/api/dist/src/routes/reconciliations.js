import { Router } from 'express';
import { createRunSchema, runQuerySchema, reconItemUpdateSchema, MatchStatus, ReconType, monthsRange, } from '@reconai/shared';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound, BadRequest } from '../lib/http.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import { enqueueReconJob } from '../queues.js';
const router = Router();
router.use(requireAuth);
/** POST /api/reconciliations — create + launch a run (senior+). */
router.post('/', requireCapability('reconciliation.run'), asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const { type, data } = parseBody(createRunSchema, req.body);
    const base = data;
    const [client, engagement] = await Promise.all([
        prisma.client.findFirst({ where: { id: base.clientId, firmId: me.firmId, isDeleted: false } }),
        prisma.engagement.findFirst({ where: { id: base.engagementId, firmId: me.firmId, clientId: base.clientId, isDeleted: false } }),
    ]);
    if (!client)
        throw NotFound('Client not found');
    if (!engagement)
        throw NotFound('Engagement not found');
    const period = monthsRange.parse(data.period);
    const params = data.params ?? {};
    const createdById = me.userId;
    const { config, sourceAId, sourceBId, aisSourceId } = runDocuments(type, data);
    const run = await prisma.reconRun.create({
        data: {
            firmId: me.firmId,
            engagementId: engagement.id,
            clientId: client.id,
            type,
            status: 'queued',
            config: { ...params, ...config },
            sourceAId: sourceAId ?? null,
            sourceBId: sourceBId ?? null,
            aisSourceId: aisSourceId ?? null,
            periodFrom: new Date(`${period.from}-01T00:00:00.000Z`),
            periodTo: new Date(`${period.to}-01T00:00:00.000Z`),
            createdById,
        },
    });
    // ensure every referenced document belongs to the same firm + engagement
    const docIds = [sourceAId, sourceBId, aisSourceId].filter(Boolean);
    const owned = await prisma.document.count({
        where: { id: { in: docIds }, firmId: me.firmId, engagementId: engagement.id },
    });
    if (docIds.length !== owned) {
        await prisma.reconRun.delete({ where: { id: run.id } });
        throw BadRequest('One of the selected documents does not belong to this engagement');
    }
    await enqueueReconJob({ runId: run.id, firmId: me.firmId });
    logAudit(req, { action: 'reconcile', entityType: 'recon_run', entityId: run.id, detail: { type } });
    res.status(201).json(bigintToJson(run));
}));
/** Guard document ownership at creation time. */
function runDocuments(type, data) {
    let docIds = [];
    let config = {};
    if (type === ReconType.GST) {
        docIds = [data.purchaseLedgerDocumentId, data.gstr2bDocumentId];
        config = { source: { books: 'purchase', portal: 'gstr_2b' } };
    }
    else if (type === ReconType.Bank) {
        docIds = [data.bankStatementDocumentId, data.bookLedgerDocumentId];
        if (data.bankAccount)
            config = { bank: data.bankAccount };
    }
    else if (type === ReconType.AIS26AS) {
        docIds = [data.ais26asDocumentId];
        if (data.booksDocumentId)
            docIds.push(data.booksDocumentId);
        config = { tan: data.tan };
    }
    return {
        config,
        sourceAId: docIds[0] ?? null,
        sourceBId: docIds[1] ?? null,
        aisSourceId: type === ReconType.AIS26AS ? docIds[0] ?? null : null,
    };
}
/** GET /api/reconciliations — list runs. */
router.get('/', requireCapability('reconciliation.read'), asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const q = parseBody(runQuerySchema, {
        engagementId: req.query.engagementId,
        clientId: req.query.clientId,
        type: req.query.type,
        page: req.query.page ?? 1,
        pageSize: req.query.pageSize ?? 50,
    });
    const where = { firmId: me.firmId };
    if (q.engagementId)
        where.engagementId = q.engagementId;
    if (q.clientId)
        where.clientId = q.clientId;
    if (q.type)
        where.type = q.type;
    const [items, total] = await Promise.all([
        prisma.reconRun.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
            include: {
                client: { select: { id: true, name: true, gstin: true, pan: true } },
                engagement: { select: { id: true, title: true } },
                _count: { select: { items: true, exceptions: true } },
            },
        }),
        prisma.reconRun.count({ where }),
    ]);
    res.json(bigintToJson({ items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.ceil(total / q.pageSize) }));
}));
/** GET /api/reconciliations/:id — overview + metrics + item feed. */
router.get('/:id', requireCapability('reconciliation.read'), asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const run = await prisma.reconRun.findFirst({
        where: { id: req.params.id, firmId: me.firmId },
        include: {
            client: { select: { id: true, name: true, gstin: true, pan: true } },
            engagement: { select: { id: true, title: true, status: true } },
            sourceA: { select: { id: true, originalName: true, category: true } },
            sourceB: { select: { id: true, originalName: true, category: true } },
            aisSource: { select: { id: true, originalName: true, category: true } },
            _count: { select: { exceptions: true, items: true } },
        },
    });
    if (!run)
        throw NotFound('Reconciliation not found');
    const status = req.query.status || 'all';
    const page = Number(req.query.page ?? 1);
    const pageSize = Math.min(Number(req.query.pageSize ?? 50), 200);
    const itemWhere = { runId: run.id, deleted: false };
    if (status !== 'all')
        itemWhere.matchStatus = status;
    const [items, itemTotal, statusCounts] = await Promise.all([
        prisma.reconItem.findMany({
            where: itemWhere,
            orderBy: { createdAt: 'asc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { recordA: true, recordB: true, aiConsults: { orderBy: { createdAt: 'desc' }, take: 3 } },
        }),
        prisma.reconItem.count({ where: itemWhere }),
        prisma.reconItem
            .groupBy({ by: ['matchStatus'], where: { runId: run.id, deleted: false }, _count: true })
            .then((rows) => Object.fromEntries(rows.map((r) => [r.matchStatus, r._count]))),
    ]);
    res.json(bigintToJson({
        ...run,
        statusCounts,
        items,
        itemTotal,
        page,
        pageSize,
    }));
}));
/** PATCH /api/reconciliations/:id/items/:itemId — manual match / unmatch / flag. */
router.patch('/:id/items/:itemId', requireCapability('reconciliation.override'), asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const input = parseBody(reconItemUpdateSchema, {
        runId: req.params.id,
        itemId: req.params.itemId,
        action: req.body.action,
        targetItemId: req.body.targetItemId,
        note: req.body.note,
    });
    const run = await prisma.reconRun.findFirst({ where: { id: input.runId, firmId: me.firmId } });
    if (!run)
        throw NotFound('Reconciliation not found');
    if (run.status === 'running')
        throw BadRequest('Wait for the run to finish before editing items');
    const item = await prisma.reconItem.findFirst({ where: { id: input.itemId, runId: run.id } });
    if (!item)
        throw NotFound('Item not found');
    let update = {};
    switch (input.action) {
        case 'manual_match': {
            if (!input.targetItemId)
                throw BadRequest('manual_match requires targetItemId');
            const target = await prisma.reconItem.findFirst({ where: { id: input.targetItemId, runId: run.id } });
            if (!target)
                throw NotFound('Target item not found');
            update = {
                matchStatus: MatchStatus.Manual,
                score: 1,
                reasons: ['manually matched'],
                recordAId: target.recordAId,
                recordBId: target.recordBId,
            };
            break;
        }
        case 'unmatch':
            update = { matchStatus: MatchStatus.Unmatched, score: 0, reasons: ['unmatched by user'] };
            break;
        case 'apply_ai':
            update = { matchStatus: MatchStatus.AiAssisted, score: Math.max(item.score, 0.8), reasons: ['ai suggestion applied'] };
            break;
        case 'reject_ai':
            update = { matchStatus: MatchStatus.Unmatched, score: 0, reasons: ['ai suggestion rejected'] };
            break;
        case 'flag_exception':
            update = { /* keep status; the exception route handles creation */};
            break;
    }
    const updated = await prisma.reconItem.update({ where: { id: item.id }, data: update });
    logAudit(req, { action: 'update', entityType: 'recon_item', entityId: item.id, detail: { action: input.action, runId: run.id } });
    res.json(bigintToJson(updated));
}));
/** POST /api/reconciliations/:id/cancel */
router.post('/:id/cancel', requireCapability('reconciliation.cancel'), asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const run = await prisma.reconRun.findFirst({ where: { id: req.params.id, firmId: me.firmId } });
    if (!run)
        throw NotFound('Reconciliation not found');
    if (run.status === 'completed' || run.status === 'cancelled')
        throw BadRequest('Run already finished');
    const updated = await prisma.reconRun.update({ where: { id: run.id }, data: { status: 'cancelled' } });
    logAudit(req, { action: 'update', entityType: 'recon_run', entityId: run.id, detail: { status: 'cancelled' } });
    res.json(bigintToJson(updated));
}));
export default router;
//# sourceMappingURL=reconciliations.js.map