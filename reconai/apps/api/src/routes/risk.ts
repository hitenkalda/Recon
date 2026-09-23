import { Router } from 'express';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound } from '../lib/http.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import { engine, type ReconRow } from '../services/engineClient.js';
import { z } from 'zod';

const router = Router();
router.use(requireAuth);

const riskAnalyzeSchema = z.object({
  engagementId: z.string(),
  clientId: z.string(),
  type: z.enum(['transaction', 'invoice', 'expense']),
  documentId: z.string(),
  config: z.record(z.unknown()).optional(),
});

const createExceptionsSchema = z.object({
  findings: z.array(z.object({
    engagementId: z.string(),
    clientId: z.string(),
    kind: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    title: z.string(),
    description: z.string().optional(),
    rule: z.string().optional(),
    score: z.number().optional(),
  })),
});

/** GET /api/risk — list risk analysis runs with filters. */
router.get('/', requireCapability('exceptions.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const page = Number(req.query.page ?? 1);
  const pageSize = Math.min(Number(req.query.pageSize ?? 50), 200);
  const where: Record<string, unknown> = { firmId: me.firmId };
  if (req.query.engagementId) where.engagementId = req.query.engagementId;
  if (req.query.clientId) where.clientId = req.query.clientId;
  if (req.query.type) where.kind = req.query.type;
  if (req.query.status) where.status = req.query.status;

  const [items, total] = await Promise.all([
    prisma.exception.findMany({
      where,
      orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { id: true, name: true } },
        engagement: { select: { id: true, title: true } },
      },
    }),
    prisma.exception.count({ where }),
  ]);
  res.json(bigintToJson({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }));
}));

/** POST /api/risk/analyze — create a risk analysis run. */
router.post('/analyze', requireCapability('reconciliation.run'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(riskAnalyzeSchema, req.body);

  const [client, engagement] = await Promise.all([
    prisma.client.findFirst({ where: { id: input.clientId, firmId: me.firmId, isDeleted: false } }),
    prisma.engagement.findFirst({ where: { id: input.engagementId, firmId: me.firmId, clientId: input.clientId, isDeleted: false } }),
  ]);
  if (!client) throw NotFound('Client not found');
  if (!engagement) throw NotFound('Engagement not found');

  const document = await prisma.document.findFirst({
    where: { id: input.documentId, firmId: me.firmId, engagementId: input.engagementId },
  });
  if (!document) throw NotFound('Document not found');

  const sourceRecords = await prisma.sourceRecord.findMany({
    where: { documentId: input.documentId },
    select: { rowIndex: true, data: true },
    orderBy: { rowIndex: 'asc' },
  });
  const rows: ReconRow[] = sourceRecords.map((r) => ({
    index: r.rowIndex ?? -1,
    data: r.data as Record<string, unknown>,
  }));

  const result = await engine.analyzeRisk({
    runType: input.type,
    rowsA: rows,
    rowsB: [],
    params: input.config ?? {},
  });

  const createdExceptions = [];
  for (const item of result.items) {
    if (item.matchStatus === 'high' || item.matchStatus === 'critical' || (item.score > 0.7)) {
      const severity = item.score > 0.9 ? 'critical' : 'high';
      const exception = await prisma.exception.create({
        data: {
          firmId: me.firmId,
          engagementId: input.engagementId,
          clientId: input.clientId,
          kind: input.type,
          severity,
          status: 'open',
          title: `Risk finding: ${item.reasons?.[0] ?? 'Anomaly detected'}`,
          description: JSON.stringify(item),
          createdById: me.userId,
        },
      });
      await prisma.exceptionActivity.create({
        data: { exceptionId: exception.id, action: 'create', userId: me.userId, detail: `Created ${severity} exception from risk analysis` },
      });
      createdExceptions.push(exception);
    }
  }

  logAudit(req, { action: 'risk_analyze', entityType: 'engagement', entityId: input.engagementId, detail: { type: input.type, documentId: input.documentId, exceptionsCreated: createdExceptions.length } });
  res.status(201).json(bigintToJson({
    findings: result.items,
    metrics: result.metrics,
    warnings: result.warnings,
    exceptionsCreated: createdExceptions.length,
    exceptions: createdExceptions,
  }));
}));

/** GET /api/risk/:id — get risk analysis detail with items. */
router.get('/:id', requireCapability('exceptions.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const exception = await prisma.exception.findFirst({
    where: { id: req.params.id, firmId: me.firmId },
    include: {
      client: { select: { id: true, name: true } },
      engagement: { select: { id: true, title: true } },
      comments: { orderBy: { createdAt: 'asc' } },
      evidence: { orderBy: { uploadedAt: 'desc' } },
    },
  });
  if (!exception) throw NotFound('Risk analysis result not found');
  res.json(bigintToJson(exception));
}));

/** POST /api/risk/create-exceptions — create exceptions from risk findings. */
router.post('/create-exceptions', requireCapability('exceptions.resolve'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(createExceptionsSchema, req.body);

  const exceptions = [];
  for (const finding of input.findings) {
    const exception = await prisma.exception.create({
      data: {
        firmId: me.firmId,
        engagementId: finding.engagementId,
        clientId: finding.clientId,
        kind: finding.kind,
        severity: finding.severity,
        status: 'open',
        title: finding.title,
        description: finding.description ?? null,
        createdById: me.userId,
      },
    });
    await prisma.exceptionActivity.create({
      data: { exceptionId: exception.id, action: 'create', userId: me.userId, detail: `Created ${finding.severity} exception from risk findings` },
    });
    logAudit(req, { action: 'create', entityType: 'exception', entityId: exception.id, detail: { kind: finding.kind, severity: finding.severity, rule: finding.rule } });
    exceptions.push(exception);
  }

  res.status(201).json(bigintToJson({ created: exceptions.length, exceptions }));
}));

export default router;
