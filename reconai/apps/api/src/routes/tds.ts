import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound, BadRequest } from '../lib/http.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import { enqueueTdsJob, type TdsJob } from '../queues.js';
import { engine, type ReconRow } from '../services/engineClient.js';
import { objectKey, presignedGetUrl, putBytes } from '../storage/storage.js';

const router = Router();
router.use(requireAuth);

/** The 9 masters the engine understands (mirror tds_checklist.SECTIONS). */
const TDS_SECTIONS = [
  '194I_land', '194I_plant', '194J_prof', '194J_tech', '194C',
  '194H', '194A', '194D', '194Q',
] as const;

const ledgerSchema = z.object({
  documentId: z.string().min(1),
  name: z.string().min(1),
  section: z.enum(TDS_SECTIONS as readonly [string, ...string[]]),
  tdsCol: z.string().optional(),
  amountCol: z.string().optional(),
});

const tdsCreateSchema = z.object({
  engagementId: z.string().min(1),
  clientId: z.string().min(1),
  ledgers: z.array(ledgerSchema).min(1).max(12),
  payableDocumentId: z.string().optional(), // optional TDS Payable ledger doc
  config: z.object({
    financialYear: z.object({ from: z.number().int(), to: z.number().int() }).optional(),
    clientName: z.string().optional(),
  }).optional(),
});

const tdsQuerySchema = z.object({
  engagementId: z.string().optional(),
  clientId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/** POST /api/tds — create + launch a TDS compliance checklist run (senior+). */
router.post('/', requireCapability('reconciliation.run'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const data = parseBody(tdsCreateSchema, req.body);

  const client = await prisma.client.findFirst({ where: { id: data.clientId, firmId: me.firmId, isDeleted: false } });
  if (!client) throw NotFound('Client not found');
  const engagement = await prisma.engagement.findFirst({
    where: { id: data.engagementId, firmId: me.firmId, clientId: client.id, isDeleted: false },
  });
  if (!engagement) throw NotFound('Engagement not found');

  // All documents must belong to this engagement.
  const docIds = [...data.ledgers.map((l) => l.documentId)];
  if (data.payableDocumentId) docIds.push(data.payableDocumentId);
  const owned = await prisma.document.count({
    where: { id: { in: docIds }, firmId: me.firmId, engagementId: engagement.id },
  });
  if (docIds.length !== owned) throw BadRequest('One of the selected documents does not belong to this engagement');

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.tdsChecklistRun.create({
      data: {
        firmId: me.firmId,
        engagementId: engagement.id,
        clientId: client.id,
        status: 'queued',
        progress: 0,
        config: (data.config ?? {}) as object,
        payableDocId: data.payableDocumentId ?? null,
        createdById: me.userId,
      },
    });
    await tx.tdsChecklistLedger.createMany({
      data: data.ledgers.map((l, i) => ({
        runId: created.id,
        documentId: l.documentId,
        name: l.name,
        section: l.section,
        tdsCol: l.tdsCol ?? null,
        amountCol: l.amountCol ?? null,
        position: i,
      })),
    });
    return created;
  });

  await enqueueTdsJob({ runId: run.id, firmId: me.firmId } satisfies TdsJob);
  logAudit(req, { action: 'reconcile', entityType: 'tds_run', entityId: run.id, detail: { client: client.id, ledgers: data.ledgers.length } });
  res.status(201).json(bigintToJson(run));
}));

/** GET /api/tds — list runs. */
router.get('/', requireCapability('reconciliation.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const q = parseBody(tdsQuerySchema, {
    engagementId: req.query.engagementId,
    clientId: req.query.clientId,
    page: req.query.page ?? 1,
    pageSize: req.query.pageSize ?? 50,
  });
  const where: Record<string, unknown> = { firmId: me.firmId };
  if (q.engagementId) where.engagementId = q.engagementId;
  if (q.clientId) where.clientId = q.clientId;

  const [items, total] = await Promise.all([
    prisma.tdsChecklistRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        client: { select: { id: true, name: true, gstin: true, pan: true } },
        engagement: { select: { id: true, title: true } },
        ledgers: { select: { id: true, name: true, section: true, documentId: true }, orderBy: { position: 'asc' } },
        _count: { select: { results: true, exceptions: true } },
      },
    }),
    prisma.tdsChecklistRun.count({ where }),
  ]);
  res.json(bigintToJson({ items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.ceil(total / q.pageSize) }));
}));

/** GET /api/tds/:id — overview + metrics + status counts. */
router.get('/:id', requireCapability('reconciliation.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const run = await prisma.tdsChecklistRun.findFirst({
    where: { id: req.params.id, firmId: me.firmId },
    include: {
      client: { select: { id: true, name: true, gstin: true, pan: true } },
      engagement: { select: { id: true, title: true, status: true } },
      ledgers: { orderBy: { position: 'asc' }, include: { document: { select: { id: true, originalName: true, category: true } } } },
      payableDoc: { select: { id: true, originalName: true, category: true } },
      _count: { select: { results: true, exceptions: true } },
    },
  });
  if (!run) throw NotFound('TDS run not found');

  const [dedCounts, depCounts] = await Promise.all([
    prisma.tdsChecklistResult.groupBy({ by: ['dedKey'], where: { runId: run.id }, _count: true })
      .then((rows) => Object.fromEntries(rows.map((r) => [r.dedKey, r._count]))),
    prisma.tdsChecklistResult.groupBy({ by: ['depStatus'], where: { runId: run.id }, _count: true })
      .then((rows) => Object.fromEntries(rows.map((r) => [r.depStatus, r._count]))),
  ]);

  res.json(bigintToJson({ ...run, dedCounts, depCounts }));
}));

/** GET /api/tds/:id/results — paginated findings, filterable by dedKey / section. */
router.get('/:id/results', requireCapability('reconciliation.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const run = await prisma.tdsChecklistRun.findFirst({ where: { id: req.params.id, firmId: me.firmId }, select: { id: true } });
  if (!run) throw NotFound('TDS run not found');

  const dedKey = (req.query.dedKey as string) ?? 'all';
  const sectionKey = (req.query.section as string) ?? 'all';
  const page = Number(req.query.page ?? 1);
  const pageSize = Math.min(Number(req.query.pageSize ?? 100), 200);
  const where: Record<string, unknown> = { runId: run.id };
  if (dedKey !== 'all') where.dedKey = dedKey;
  if (sectionKey !== 'all') where.sectionKey = sectionKey;

  const [items, total] = await Promise.all([
    prisma.tdsChecklistResult.findMany({
      where,
      orderBy: [{ section: 'asc' }, { date: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        sourceRecord: { select: { id: true, documentId: true, rowIndex: true } },
        ledger: { select: { id: true, name: true, section: true, documentId: true } },
      },
    }),
    prisma.tdsChecklistResult.count({ where }),
  ]);
  res.json(bigintToJson({ items, total, page, pageSize }));
}));

/** GET /api/tds/:id/months — month-wise payment reconciliation + summary. */
router.get('/:id/months', requireCapability('reconciliation.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const run = await prisma.tdsChecklistRun.findFirst({ where: { id: req.params.id, firmId: me.firmId }, select: { id: true, metrics: true } });
  if (!run) throw NotFound('TDS run not found');
  const metrics = (run.metrics ?? {}) as { monthRecon?: unknown[]; monthReconMeta?: Record<string, unknown>; sectionSummary?: unknown[] };
  res.json(bigintToJson({
    monthRecon: metrics.monthRecon ?? [],
    monthReconMeta: metrics.monthReconMeta ?? {},
    sectionSummary: metrics.sectionSummary ?? [],
  }));
}));

/** GET /api/tds/:id/export — persist a real 2-sheet XLSX to MinIO and return its URL. */
router.get('/:id/export', requireCapability('reports.generate'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const run = await prisma.tdsChecklistRun.findFirst({
    where: { id: req.params.id, firmId: me.firmId },
    include: {
      client: { select: { name: true } },
      engagement: { select: { id: true } },
      ledgers: { orderBy: { position: 'asc' } },
    },
  });
  if (!run) throw NotFound('TDS run not found');
  if (run.status !== 'completed') throw BadRequest('Run must be completed before exporting');

  const fetchRows = async (documentId: string): Promise<ReconRow[]> => {
    const records = await prisma.sourceRecord.findMany({
      where: { documentId },
      select: { rowIndex: true, data: true },
      orderBy: { rowIndex: 'asc' },
    });
    return records.map((r) => ({ index: r.rowIndex ?? -1, data: r.data as Record<string, unknown> }));
  };

  const payableRows = run.payableDocId ? await fetchRows(run.payableDocId) : [];
  const cfg = (run.config ?? {}) as { financialYear?: { from?: number; to?: number }; clientName?: string };
  const exportResult = await engine.tdsExport({
    ledgers: await Promise.all(run.ledgers.map(async (lg) => ({
      name: lg.name,
      section: lg.section,
      tdsCol: lg.tdsCol ?? undefined,
      amountCol: lg.amountCol ?? undefined,
      rows: await fetchRows(lg.documentId),
    }))),
    payableRows,
    financialYear: cfg.financialYear,
    config: { clientName: run.client.name ?? 'Client' },
  });

  const buffer = Buffer.from(exportResult.data, 'base64');
  const key = objectKey(me.firmId, run.engagementId, `tds-checklist-${run.id.slice(-6)}.xlsx`);
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
  logAudit(req, { action: 'export', entityType: 'tds_run', entityId: run.id, detail: { format: 'xlsx' } });
  res.json(bigintToJson({ report, url, size: buffer.length, summary: exportResult.summary }));
}));

/** POST /api/tds/:id/cancel */
router.post('/:id/cancel', requireCapability('reconciliation.cancel'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const run = await prisma.tdsChecklistRun.findFirst({ where: { id: req.params.id, firmId: me.firmId } });
  if (!run) throw NotFound('TDS run not found');
  if (run.status === 'completed' || run.status === 'cancelled') throw BadRequest('Run already finished');

  const updated = await prisma.tdsChecklistRun.update({ where: { id: run.id }, data: { status: 'cancelled' } });
  logAudit(req, { action: 'update', entityType: 'tds_run', entityId: run.id, detail: { status: 'cancelled' } });
  res.json(bigintToJson(updated));
}));

export default router;