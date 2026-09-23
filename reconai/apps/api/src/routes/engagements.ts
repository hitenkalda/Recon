import { Router } from 'express';
import { clientEngagementCreateSchema, engagementUpdateSchema, engagementQuerySchema } from '@reconai/shared';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound } from '../lib/http.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { bigintToJson } from '../prisma.js';

const router = Router();
router.use(requireAuth);

const CHECKLIST_TEMPLATE = [
  { key: 'client_data', label: 'Client master & KYC collected' },
  { key: 'gstr_1', label: 'GSTR-1 / sales register uploaded' },
  { key: 'gstr_2b', label: 'GSTR-2B downloaded for the period' },
  { key: 'gstr_3b', label: 'GSTR-3B (filed) uploaded' },
  { key: 'bank_stmt', label: 'Bank statement uploaded' },
  { key: 'ais_26as', label: 'AIS / 26AS downloaded' },
  { key: 'ledgers', label: 'Purchase & sales ledgers ({book}) provided' },
  { key: 'tax_base', label: 'Tax base (GSTIN/PAN/TAN) confirmed' },
] as const;

/** GET /api/engagements — list scoped to firm (optionally by client). */
router.get('/', requireCapability('engagements.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const q = parseBody(engagementQuerySchema, {
    clientId: req.query.clientId,
    status: req.query.status,
    search: req.query.search,
    page: req.query.page ?? 1,
    pageSize: req.query.pageSize ?? 50,
  });
  const where: Record<string, unknown> = { firmId: me.firmId, isDeleted: false };
  if (q.clientId) where.clientId = q.clientId;
  if (q.status) where.status = q.status;
  if (q.search) { where.title = { contains: q.search, mode: 'insensitive' }; }

  const [items, total] = await Promise.all([
    prisma.engagement.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        client: { select: { id: true, name: true, gstin: true, pan: true } },
        _count: { select: { documents: true, runs: true, exceptions: true, workingPapers: true, members: true } },
      },
    }),
    prisma.engagement.count({ where }),
  ]);
  res.json(bigintToJson({
    items,
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.ceil(total / q.pageSize),
  }));
}));

/** POST /api/engagements — create + populate setup checklist. */
router.post('/', requireCapability('engagements.write'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(clientEngagementCreateSchema, req.body);

  const client = await prisma.client.findFirst({ where: { id: input.clientId, firmId: me.firmId, isDeleted: false } });
  if (!client) throw NotFound('Client not found');

  const engagement = await prisma.$transaction(async (tx) => {
    const created = await tx.engagement.create({
      data: {
        firmId: me.firmId,
        clientId: input.clientId,
        title: input.title,
        kind: input.kind,
        status: 'in_setup',
        financialYear: input.financialYear as object,
        scope: input.scope as object,
        taxBase: input.taxBase as object | undefined,
        createdById: me.userId,
        members: input.team.length
          ? { create: input.team.map((uid) => ({ userId: uid })) }
          : undefined,
      },
    });
    await tx.setupChecklistItem.createMany({
      data: CHECKLIST_TEMPLATE.filter((c) => c.key !== 'ledgers' || input.scope.purchaseLedger || input.scope.salesLedger).map((c) => ({
        engagementId: created.id,
        key: c.key,
        label: c.label,
      })),
    });
    return created;
  });

  logAudit(req, { action: 'create', entityType: 'engagement', entityId: engagement.id, detail: { clientId: input.clientId, title: input.title } });
  res.status(201).json(bigintToJson(engagement));
}));

/** GET /api/engagements/:id — command-center overview. */
router.get('/:id', requireCapability('engagements.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const engagement = await prisma.engagement.findFirst({
    where: { id: req.params.id, firmId: me.firmId, isDeleted: false },
    include: {
      client: { select: { id: true, name: true, type: true, gstin: true, pan: true, tan: true, address: true } },
      checklist: { orderBy: { createdAt: 'asc' } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      documents: { where: { status: { not: 'archived' } }, orderBy: { createdAt: 'desc' }, take: 50 },
      runs: { orderBy: { createdAt: 'desc' }, take: 20 },
      workingPapers: { orderBy: { updatedAt: 'desc' }, take: 20 },
      _count: { select: { documents: true, runs: true, exceptions: true, workingPapers: true } },
    },
  });
  if (!engagement) throw NotFound('Engagement not found');

  const summary = engagement.runs.reduce(
    (acc, r) => {
      if (r.status === 'completed') {
        acc.completed++;
        const m = (r.metrics ?? {}) as Record<string, number>;
        acc.totalMatched += m.matchedCount ?? 0;
        acc.totalUnmatched += m.unmatchedCount ?? 0;
      }
      return acc;
    },
    { completed: 0, totalMatched: 0, totalUnmatched: 0 },
  );

  res.json(bigintToJson({
    ...engagement,
    summary,
    documents: engagement.documents.map((d) => ({
      id: d.id,
      category: d.category,
      originalName: d.originalName,
      status: d.status,
      size: d.size,
      mime: d.mime,
      recordCount: d.recordCount,
      createdAt: d.createdAt,
    })),
    runs: engagement.runs.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      progress: r.progress,
      metrics: r.metrics,
      createdAt: r.createdAt,
    })),
  }));
}));

/** PATCH /api/engagements/:id */
router.patch('/:id', requireCapability('engagements.write'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const existing = await prisma.engagement.findFirst({ where: { id: req.params.id, firmId: me.firmId, isDeleted: false } });
  if (!existing) throw NotFound('Engagement not found');
  const input = parseBody(engagementUpdateSchema, req.body);

  if (input.team) {
    await prisma.$transaction(async (tx) => {
      await tx.engagementMember.deleteMany({ where: { engagementId: existing.id } });
      if (input.team!.length) {
        await tx.engagementMember.createMany({ data: input.team!.map((uid) => ({ engagementId: existing.id, userId: uid })) });
      }
    });
  }

  const engagement = await prisma.engagement.update({
    where: { id: existing.id },
    data: {
      title: input.title,
      status: input.status,
      scope: input.scope as object | undefined,
      taxBase: input.taxBase as object | undefined,
      conclusion: input.conclusion,
    },
  });
  logAudit(req, { action: 'update', entityType: 'engagement', entityId: engagement.id, detail: { status: input.status } });
  res.json(bigintToJson(engagement));
}));

/** POST /api/engagements/:id/checklist/:key — toggle a setup item. */
router.post('/:id/checklist/:key', requireCapability('engagements.write'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const item = await prisma.setupChecklistItem.findFirst({
    where: { engagement: { id: req.params.id, firmId: me.firmId, isDeleted: false }, key: req.params.key },
  });
  if (!item) throw NotFound('Checklist item not found');
  const updated = await prisma.setupChecklistItem.update({
    where: { id: item.id },
    data: {
      done: !item.done,
      completedById: !item.done ? me.userId : null,
      completedAt: !item.done ? new Date() : null,
    },
  });
  logAudit(req, { action: 'update', entityType: 'setup_checklist', entityId: updated.id, detail: { key: updated.key, done: updated.done } });
  res.json(updated);
}));

/** POST /api/engagements/:id/assign — set team (senior+). */
router.post('/:id/assign', requireCapability('engagements.manage'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const memberIds = (req.body?.userIds ?? []) as string[];
  const existing = await prisma.engagement.findFirst({ where: { id: req.params.id, firmId: me.firmId, isDeleted: false } });
  if (!existing) throw NotFound('Engagement not found');
  await prisma.$transaction([
    prisma.engagementMember.deleteMany({ where: { engagementId: existing.id } }),
    ...memberIds.map((uid) =>
      prisma.engagementMember.create({ data: { engagementId: existing.id, userId: uid } }),
    ),
  ]);
  logAudit(req, { action: 'update', entityType: 'engagement', entityId: existing.id, detail: { assign: memberIds } });
  res.json({ assigned: memberIds });
}));

export default router;

export { CHECKLIST_TEMPLATE };