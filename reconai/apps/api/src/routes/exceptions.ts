import { Router } from 'express';
import { exceptionCreateSchema, exceptionUpdateSchema, Severity, Role } from '@reconai/shared';
import type { Prisma } from '@prisma/client';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound, BadRequest, Forbidden } from '../lib/http.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import { canResolveSeverity } from '../services/rbac.js';

const router = Router();
router.use(requireAuth);

/** GET /api/exceptions — queue/filters. */
router.get('/', requireCapability('exceptions.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const page = Number(req.query.page ?? 1);
  const pageSize = Math.min(Number(req.query.pageSize ?? 50), 200);
  const where: Record<string, unknown> = { firmId: me.firmId };
  if (req.query.status) where.status = req.query.status;
  if (req.query.severity) where.severity = req.query.severity;
  if (req.query.engagementId) where.engagementId = req.query.engagementId;
  if (req.query.clientId) where.clientId = req.query.clientId;
  if (req.query.assigneeId) where.assigneeId = req.query.assigneeId;
  if (req.query.mine === 'true') where.assigneeId = me.userId;
  if (req.query.search) where.title = { contains: req.query.search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.exception.findMany({
      where,
      orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { id: true, name: true } },
        engagement: { select: { id: true, title: true } },
        run: { select: { id: true, type: true } },
        _count: { select: { comments: true, evidence: true } },
      },
    }),
    prisma.exception.count({ where }),
  ]);
  const assignees = await usersById(items.map((e) => e.assigneeId));
  const enriched = items.map((e) => ({ ...e, assignee: e.assigneeId ? (assignees.get(e.assigneeId) ?? null) : null }));
  res.json(bigintToJson({ items: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }));
}));

/** GET /api/exceptions/:id — detail + thread + activity. */
router.get('/:id', requireCapability('exceptions.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const exception = await prisma.exception.findFirst({
    where: { id: req.params.id, firmId: me.firmId },
    include: {
      client: { select: { id: true, name: true, gstin: true } },
      engagement: { select: { id: true, title: true, status: true } },
      run: { select: { id: true, type: true, status: true } },
      comments: { orderBy: { createdAt: 'asc' } },
      evidence: { orderBy: { uploadedAt: 'desc' } },
      activities: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!exception) throw NotFound('Exception not found');
  // The schema deliberately keeps user references as plain scalar ids (audit-style);
  // resolve names separately so the UI thread can render them.
  const wanted = new Set<string>();
  if (exception.assigneeId) wanted.add(exception.assigneeId);
  for (const c of exception.comments) wanted.add(c.userId);
  for (const a of exception.activities) if (a.userId) wanted.add(a.userId);
  const users = await usersById([...wanted]);
  const enriched = {
    ...exception,
    assignee: exception.assigneeId ? (users.get(exception.assigneeId) ?? null) : null,
    comments: exception.comments.map((c) => ({ ...c, user: users.get(c.userId) ?? null })),
    activities: exception.activities.map((a) => ({ ...a, user: a.userId ? (users.get(a.userId) ?? null) : null })),
  };
  res.json(bigintToJson(enriched));
}));

/** POST /api/exceptions — create (linked to a run or standalone). */
router.post('/', requireCapability('exceptions.resolve'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(exceptionCreateSchema, req.body);

  const run = input.runId
    ? await prisma.reconRun.findFirst({ where: { id: input.runId, firmId: me.firmId } })
    : null;
  if (input.runId && !run) throw NotFound('Reconciliation not found');
  // verify referenced items belong to the run
  if (input.referenceItemIds.length && run) {
    const cnt = await prisma.reconItem.count({ where: { id: { in: input.referenceItemIds }, runId: run.id } });
    if (cnt !== input.referenceItemIds.length) throw BadRequest('Some referenced items do not belong to this run');
  }

  const exception = await prisma.exception.create({
    data: {
      firmId: me.firmId,
      runId: run?.id ?? null,
      engagementId: (req.body.engagementId as string) ?? run?.engagementId ?? '',
      clientId: (req.body.clientId as string) ?? run?.clientId ?? '',
      kind: input.kind,
      severity: input.severity,
      status: 'open',
      title: input.title,
      description: input.description,
      createdById: me.userId,
      references: input.referenceItemIds as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.exceptionActivity.create({
    data: { exceptionId: exception.id, action: 'create', userId: me.userId, detail: `Created ${input.severity} exception` },
  });
  logAudit(req, { action: 'create', entityType: 'exception', entityId: exception.id, detail: { kind: input.kind, severity: input.severity } });
  res.status(201).json(bigintToJson(exception));
}));

/** POST /api/exceptions/:id/comments */
router.post('/:id/comments', requireCapability('exceptions.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const text = (req.body?.text ?? '').trim();
  if (!text) throw BadRequest('Comment text required');
  const exception = await prisma.exception.findFirst({ where: { id: req.params.id, firmId: me.firmId } });
  if (!exception) throw NotFound('Exception not found');

  const comment = await prisma.exceptionComment.create({
    data: { exceptionId: exception.id, userId: me.userId, text: text.slice(0, 2000) },
  });
  await prisma.exceptionActivity.create({ data: { exceptionId: exception.id, action: 'comment', userId: me.userId, detail: 'Added comment' } });
  res.status(201).json(bigintToJson(comment));
}));

/** POST /api/exceptions/:id/assign */
router.post('/:id/assign', requireCapability('exceptions.assign'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const assigneeId = req.body?.assigneeId as string | undefined;
  const exception = await prisma.exception.findFirst({ where: { id: req.params.id, firmId: me.firmId } });
  if (!exception) throw NotFound('Exception not found');
  if (!assigneeId) throw BadRequest('assigneeId required');

  const member = await prisma.firmMember.findUnique({ where: { firmId_userId: { firmId: me.firmId, userId: assigneeId } } });
  if (!member) throw BadRequest('Assignee is not a member of this firm');

  const updated = await prisma.exception.update({
    where: { id: exception.id },
    data: { assigneeId, status: exception.status === 'open' ? 'assigned' : exception.status },
  });
  await prisma.exceptionActivity.create({
    data: { exceptionId: exception.id, action: 'assign', userId: me.userId, toStatus: updated.status, detail: `Assigned to member` },
  });
  logAudit(req, { action: 'update', entityType: 'exception', entityId: exception.id, detail: { assigneeId } });
  res.json(bigintToJson(updated));
}));

/** POST /api/exceptions/:id/evidence — attach a document or a note. */
router.post('/:id/evidence', requireCapability('exceptions.resolve'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const exception = await prisma.exception.findFirst({ where: { id: req.params.id, firmId: me.firmId } });
  if (!exception) throw NotFound('Exception not found');

  const { documentId, text } = (req.body ?? {}) as { documentId?: string; text?: string };
  if (documentId) {
    const doc = await prisma.document.findFirst({ where: { id: documentId, firmId: me.firmId } });
    if (!doc) throw NotFound('Evidence document not found');
    const evidence = await prisma.exceptionEvidence.create({
      data: { exceptionId: exception.id, kind: 'document', documentId: doc.id, uploadedById: me.userId },
    });
    await prisma.exceptionActivity.create({ data: { exceptionId: exception.id, action: 'update', userId: me.userId, detail: 'Attached evidence document' } });
    res.status(201).json(bigintToJson(evidence));
    return;
  }
  if (text) {
    const evidence = await prisma.exceptionEvidence.create({
      data: { exceptionId: exception.id, kind: 'note', text: text.slice(0, 2000), uploadedById: me.userId },
    });
    await prisma.exceptionActivity.create({ data: { exceptionId: exception.id, action: 'update', userId: me.userId, detail: 'Added evidence note' } });
    res.status(201).json(bigintToJson(evidence));
    return;
  }
  throw BadRequest('Provide documentId or text');
}));

/** PATCH /api/exceptions/:id — status transitions with authority gates. */
router.patch('/:id', requireCapability('exceptions.resolve'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(exceptionUpdateSchema, { ...req.body, exceptionId: req.params.id });
  const exception = await prisma.exception.findFirst({
    where: { id: input.exceptionId, firmId: me.firmId },
  });
  if (!exception) throw NotFound('Exception not found');

  const events: Array<Record<string, unknown>> = [];
  const data: Record<string, unknown> = {};
  let newStatus = exception.status;

  // assignment
  if (input.assigneeId && input.assigneeId !== exception.assigneeId) {
    const member = await prisma.firmMember.findUnique({ where: { firmId_userId: { firmId: me.firmId, userId: input.assigneeId } } });
    if (!member) throw BadRequest('Assignee is not a member of this firm');
    data.assigneeId = input.assigneeId;
    if (newStatus === 'open') { newStatus = 'assigned'; data.status = newStatus; }
    events.push({ action: 'assign', toStatus: newStatus, detail: `Assigned` });
  }

  // status transition
  if (input.status && input.status !== exception.status) {
    validateTransition(exception.status, input.status);

    if (input.status === 'resolved') {
      if (!canResolveSeverity(me.role as Role, exception.severity as Severity)) {
        throw Forbidden('High/critical exceptions require a Senior or above to resolve');
      }
      if (!input.resolution) throw BadRequest('Resolution note is required to close an exception');
      data.status = input.status;
      data.resolution = input.resolution;
      data.resolvedById = me.userId;
      data.resolvedAt = new Date();
      data.assigneeId = data.assigneeId ?? me.userId;
      events.push({ action: 'resolve', toStatus: input.status, fromStatus: exception.status, detail: 'Resolved' });
    } else {
      data.status = input.status;
      events.push({ action: 'transition', fromStatus: exception.status, toStatus: input.status, detail: '' });
      if (input.status === 'reopened') {
        data.reopenedAt = new Date();
        data.resolution = null;
      }
    }
    newStatus = input.status;
  }

  if (input.comment) {
    await prisma.exceptionComment.create({
      data: { exceptionId: exception.id, userId: me.userId, text: input.comment.slice(0, 2000) },
    });
    events.push({ action: 'comment', toStatus: newStatus, detail: 'Added comment' });
  }

  const updated = await prisma.exception.update({ where: { id: exception.id }, data });
  if (events.length) {
    await prisma.exceptionActivity.createMany({
      data: events.map((e) => ({ exceptionId: exception.id, userId: me.userId, action: String(e.action), fromStatus: (e.fromStatus as string) ?? undefined, toStatus: (e.toStatus as string) ?? undefined, detail: e.detail as string })),
    });
  }
  logAudit(req, { action: 'update', entityType: 'exception', entityId: exception.id, detail: { toStatus: newStatus } });
  res.json(bigintToJson(updated));
}));

/** Batch-resolve user ids → { id, name, email } for display surfaces. */
async function usersById(ids: Array<string | null | undefined>): Promise<Map<string, { id: string; name: string; email: string }>> {
  const clean = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!clean.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: clean } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u]));
}

function validateTransition(from: string, to: string): void {
  const allowed: Record<string, string[]> = {
    open: ['assigned', 'in_review', 'reopened'],
    assigned: ['in_review', 'resolved', 'reopened'],
    in_review: ['resolved', 'reopened', 'assigned'],
    reopened: ['assigned', 'in_review', 'resolved'],
    resolved: ['reopened'],
  };
  if (!(allowed[from] ?? []).includes(to)) throw BadRequest(`Cannot move an exception from ${from} to ${to}`);
}

export default router;