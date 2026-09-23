import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound, BadRequest } from '../lib/http.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import { enqueueVarianceJob, type VarianceJob } from '../queues.js';
import { engine } from '../services/engineClient.js';
import { objectKey, presignedGetUrl, putBytes } from '../storage/storage.js';

const router = Router();
router.use(requireAuth);

const varianceCreateSchema = z.object({
  engagementId: z.string().min(1),
  clientId: z.string().min(1),
  priorDocumentId: z.string().optional(), // prior-period TB
  currentDocumentId: z.string().optional(), // current-period TB
  config: z.object({
    plKeywords: z.array(z.string()).optional(),
    plAllLedgers: z.boolean().optional(),
    quickThreshold: z.number().positive().optional(),
    detailedThreshold: z.number().positive().optional(),
    obTolerance: z.number().nonnegative().optional(),
  }).optional(),
});

const varianceQuerySchema = z.object({
  engagementId: z.string().optional(),
  clientId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/** POST /api/variance — create + launch a TB/P&L variance run (senior+). */
router.post('/', requireCapability('reconciliation.run'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const data = parseBody(varianceCreateSchema, req.body);

  const client = await prisma.client.findFirst({ where: { id: data.clientId, firmId: me.firmId, isDeleted: false } });
  if (!client) throw NotFound('Client not found');
  const engagement = await prisma.engagement.findFirst({
    where: { id: data.engagementId, firmId: me.firmId, clientId: client.id, isDeleted: false },
  });
  if (!engagement) throw NotFound('Engagement not found');

  const priorDocumentId = data.priorDocumentId ?? null;
  const currentDocumentId = data.currentDocumentId ?? null;
  const docIds = [priorDocumentId, currentDocumentId].filter(Boolean) as string[];
  if (docIds.length) {
    const owned = await prisma.document.count({
      where: { id: { in: docIds }, firmId: me.firmId, engagementId: engagement.id },
    });
    if (docIds.length !== owned) throw BadRequest('One of the selected documents does not belong to this engagement');
  }

  const run = await prisma.varianceAnalysisRun.create({
    data: {
      firmId: me.firmId,
      engagementId: engagement.id,
      clientId: client.id,
      status: 'queued',
      progress: 0,
      config: (data.config ?? {}) as object,
      priorDocId: priorDocumentId,
      currentDocId: currentDocumentId,
      createdById: me.userId,
    },
  });

  await enqueueVarianceJob({ runId: run.id, firmId: me.firmId } satisfies VarianceJob);
  logAudit(req, { action: 'reconcile', entityType: 'variance_run', entityId: run.id, detail: { client: client.id } });
  res.status(201).json(bigintToJson(run));
}));

/** GET /api/variance — list runs. */
router.get('/', requireCapability('reconciliation.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const q = parseBody(varianceQuerySchema, {
    engagementId: req.query.engagementId,
    clientId: req.query.clientId,
    page: req.query.page ?? 1,
    pageSize: req.query.pageSize ?? 50,
  });
  const where: Record<string, unknown> = { firmId: me.firmId };
  if (q.engagementId) where.engagementId = q.engagementId;
  if (q.clientId) where.clientId = q.clientId;

  const [items, total] = await Promise.all([
    prisma.varianceAnalysisRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        client: { select: { id: true, name: true, gstin: true, pan: true } },
        engagement: { select: { id: true, title: true } },
        _count: { select: { results: true, exceptions: true } },
      },
    }),
    prisma.varianceAnalysisRun.count({ where }),
  ]);
  res.json(bigintToJson({ items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.ceil(total / q.pageSize) }));
}));

/** GET /api/variance/:id — overview + metrics + category counts. */
router.get('/:id', requireCapability('reconciliation.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const run = await prisma.varianceAnalysisRun.findFirst({
    where: { id: req.params.id, firmId: me.firmId },
    include: {
      client: { select: { id: true, name: true, gstin: true, pan: true } },
      engagement: { select: { id: true, title: true, status: true } },
      priorDoc: { select: { id: true, originalName: true, category: true } },
      currentDoc: { select: { id: true, originalName: true, category: true } },
      _count: { select: { results: true, exceptions: true } },
    },
  });
  if (!run) throw NotFound('Variance run not found');

  const statusCounts = await prisma.varianceAnalysisResult
    .groupBy({ by: ['category'], where: { runId: run.id }, _count: true })
    .then((rows) => Object.fromEntries(rows.map((r) => [r.category, r._count])));

  res.json(bigintToJson({ ...run, statusCounts }));
}));

/** GET /api/variance/:id/results — paginated findings, filterable by category. */
router.get('/:id/results', requireCapability('reconciliation.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const run = await prisma.varianceAnalysisRun.findFirst({ where: { id: req.params.id, firmId: me.firmId }, select: { id: true } });
  if (!run) throw NotFound('Variance run not found');

  const category = (req.query.category as string) ?? 'all';
  const obOnly = req.query.obMismatch === 'true';
  const page = Number(req.query.page ?? 1);
  const pageSize = Math.min(Number(req.query.pageSize ?? 100), 200);
  const where: Record<string, unknown> = { runId: run.id };
  if (category !== 'all') where.category = category;
  if (obOnly) where.obMismatch = { gt: 0 };

  const [items, total] = await Promise.all([
    prisma.varianceAnalysisResult.findMany({
      where,
      orderBy: [{ category: 'asc' }, { variance: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        priorRecord: { select: { id: true, documentId: true, rowIndex: true } },
        currentRecord: { select: { id: true, documentId: true, rowIndex: true } },
      },
    }),
    prisma.varianceAnalysisResult.count({ where }),
  ]);
  res.json(bigintToJson({ items, total, page, pageSize }));
}));

/** GET /api/variance/:id/export — persist a real 7-sheet XLSX to MinIO and return its URL. */
router.get('/:id/export', requireCapability('reports.generate'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const run = await prisma.varianceAnalysisRun.findFirst({
    where: { id: req.params.id, firmId: me.firmId },
    include: { client: { select: { name: true } }, engagement: { select: { id: true } } },
  });
  if (!run) throw NotFound('Variance run not found');
  if (run.status !== 'completed') throw BadRequest('Run must be completed before exporting');
  if (!run.priorDocId) throw BadRequest('This run has no prior-period document to compare');

  const toEngineRows = (records: Array<{ rowIndex: number | null; data: unknown }>) =>
    records.map((r) => ({ index: r.rowIndex ?? -1, data: r.data as Record<string, unknown> }));
  const recordsPrior = await prisma.sourceRecord.findMany({
    where: { documentId: run.priorDocId },
    select: { rowIndex: true, data: true },
    orderBy: { rowIndex: 'asc' },
  });
  const recordsCurrent = run.currentDocId
    ? await prisma.sourceRecord.findMany({
        where: { documentId: run.currentDocId },
        select: { rowIndex: true, data: true },
        orderBy: { rowIndex: 'asc' },
      })
    : [];

  const exportResult = await engine.varianceExport({
    rowsA: toEngineRows(recordsPrior),
    rowsB: toEngineRows(recordsCurrent),
    config: { clientName: run.client.name ?? 'Client', ...((run.config ?? {}) as Record<string, unknown>) },
  });

  const buffer = Buffer.from(exportResult.data, 'base64');
  const key = objectKey(me.firmId, run.engagementId, `variance-${run.id.slice(-6)}.xlsx`);
  await putBytes(key, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const report = await prisma.report.create({
    data: {
      firmId: me.firmId,
      engagementId: run.engagementId,
      format: 'xlsx',
      storagePath: key,
      size: BigInt(buffer.length),
      generatedById: me.userId,
    },
  });
  const url = await presignedGetUrl(key, 300);
  logAudit(req, { action: 'export', entityType: 'variance_run', entityId: run.id, detail: { format: 'xlsx' } });
  res.json(bigintToJson({ report, url, size: buffer.length, summary: exportResult.summary }));
}));

/** POST /api/variance/:id/cancel */
router.post('/:id/cancel', requireCapability('reconciliation.cancel'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const run = await prisma.varianceAnalysisRun.findFirst({ where: { id: req.params.id, firmId: me.firmId } });
  if (!run) throw NotFound('Variance run not found');
  if (run.status === 'completed' || run.status === 'cancelled') throw BadRequest('Run already finished');

  const updated = await prisma.varianceAnalysisRun.update({ where: { id: run.id }, data: { status: 'cancelled' } });
  logAudit(req, { action: 'update', entityType: 'variance_run', entityId: run.id, detail: { status: 'cancelled' } });
  res.json(bigintToJson(updated));
}));

export default router;