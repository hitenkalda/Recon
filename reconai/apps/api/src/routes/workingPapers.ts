import { Router } from 'express';
import { workingPaperCreateSchema, workingPaperUpdateSchema, WorkingPaperStatus } from '@reconai/shared';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound, BadRequest, Forbidden } from '../lib/http.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import crypto from 'crypto';

const router = Router();
router.use(requireAuth);

/** GET /api/working-papers — by engagement (or all firm). */
router.get('/', requireCapability('workingpapers.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const page = Number(req.query.page ?? 1);
  const pageSize = Math.min(Number(req.query.pageSize ?? 50), 200);
  const where: Record<string, unknown> = { firmId: me.firmId };
  if (req.query.engagementId) where.engagementId = req.query.engagementId;
  if (req.query.clientId) where.clientId = req.query.clientId;
  if (req.query.status) where.status = req.query.status;

  const [items, total] = await Promise.all([
    prisma.workingPaper.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        client: { select: { id: true, name: true } },
        engagement: { select: { id: true, title: true, status: true } },
        _count: { select: { reports: true } },
      },
    }),
    prisma.workingPaper.count({ where }),
  ]);
  res.json(bigintToJson({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }));
}));

/** GET /api/working-papers/:id */
router.get('/:id', requireCapability('workingpapers.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const wp = await prisma.workingPaper.findFirst({
    where: { id: req.params.id, firmId: me.firmId },
    include: {
      client: { select: { id: true, name: true, gstin: true, pan: true } },
      engagement: { select: { id: true, title: true, status: true } },
      run: { select: { id: true, type: true, status: true, metrics: true } },
      reports: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!wp) throw NotFound('Working paper not found');
  res.json(bigintToJson(wp));
}));

/** POST /api/working-papers */
router.post('/', requireCapability('workingpapers.create'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(workingPaperCreateSchema, req.body);

  const engagement = await prisma.engagement.findFirst({ where: { id: input.engagementId, firmId: me.firmId, clientId: input.clientId, isDeleted: false } });
  if (!engagement) throw NotFound('Engagement not found');
  if (input.runId) {
    const run = await prisma.reconRun.findFirst({ where: { id: input.runId, firmId: me.firmId, engagementId: engagement.id } });
    if (!run) throw NotFound('Reconciliation not found');
  }

  const wp = await prisma.workingPaper.create({
    data: {
      firmId: me.firmId,
      engagementId: engagement.id,
      clientId: engagement.clientId,
      title: input.title,
      deliverable: input.deliverable,
      runId: input.runId ?? null,
      procedures: input.procedures as object,
      conclusion: input.conclusion,
      createdById: me.userId,
      status: WorkingPaperStatus.Draft,
      evidenceHash: computeEvidenceHash({ title: input.title, procedures: input.procedures, conclusion: input.conclusion ?? '' }),
    },
  });
  logAudit(req, { action: 'create', entityType: 'working_paper', entityId: wp.id, detail: { title: input.title } });
  res.status(201).json(bigintToJson(wp));
}));

/** PATCH /api/working-papers/:id — content edits + status transitions. */
router.patch('/:id', requireCapability('workingpapers.create'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(workingPaperUpdateSchema, { id: req.params.id, ...req.body });
  const wp = await prisma.workingPaper.findFirst({ where: { id: input.id, firmId: me.firmId } });
  if (!wp) throw NotFound('Working paper not found');

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.procedures !== undefined) data.procedures = input.procedures as object;
  if (input.conclusion !== undefined) data.conclusion = input.conclusion;
  if (input.reviewerNote !== undefined) data.reviewerNote = input.reviewerNote;

  // Await review → ready_for_review
  if (input.status === 'ready_for_review' && wp.status === WorkingPaperStatus.Draft) {
    data.status = WorkingPaperStatus.ReadyForReview;
  }
  // Senior sign-off
  if (input.status === 'senior_signed' && wp.status !== WorkingPaperStatus.PartnerSigned) {
    if (!['senior', 'partner', 'firm_admin'].includes(me.role)) throw Forbidden('Only seniors and partners can mark review complete');
    data.status = WorkingPaperStatus.SeniorSigned;
    data.seniorSignedById = me.userId;
  }
  // Partner sign-off (final)
  if (input.status === 'partner_signed') {
    if (!['partner', 'firm_admin'].includes(me.role)) throw Forbidden('Only partners can sign off working papers');
    const content = {
      title: input.title ?? wp.title,
      procedures: input.procedures ?? wp.procedures,
      conclusion: input.conclusion ?? wp.conclusion,
    };
    data.status = WorkingPaperStatus.PartnerSigned;
    data.partnerSignedById = me.userId;
    data.evidenceHash = computeEvidenceHash(content);
    data.signedAt = new Date();
  }

  if (!Object.keys(data).length) throw BadRequest('Nothing to update');
  const updated = await prisma.workingPaper.update({ where: { id: wp.id }, data });
  logAudit(req, { action: 'sign', entityType: 'working_paper', entityId: wp.id, detail: { status: data.status } });
  res.json(bigintToJson(updated));
}));

function computeEvidenceHash(content: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(content ?? {})).digest('hex');
}

export default router;