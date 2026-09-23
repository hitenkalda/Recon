import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound, BadRequest } from '../lib/http.js';
import { requireIndividualAuth } from '../middleware/auth.js';
import { currentIndividual } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import { checkQuota, consumeCredit, refundCredit } from '../services/individualEntitlement.js';
import { enqueueReconJob } from '../queues.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireIndividualAuth);

const createRunSchema = z.object({
  recordId: z.string().cuid(),
  type: z.enum(['gst', 'bank', 'ais_26as', 'invoice', 'expense'] as const),
  sourceAId: z.string().cuid(),
  sourceBId: z.string().cuid().optional(),
  aisSourceId: z.string().cuid().optional(),
  periodFrom: z.string().datetime().optional(),
  periodTo: z.string().datetime().optional(),
  config: z.record(z.any()).optional(),
});

/** GET /api/individual/reconciliations — list runs for the profile. */
router.get('/', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const { page = '1', pageSize = '20', status } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(pageSize);
  const take = Math.min(Number(pageSize), 100);

  const where: Record<string, unknown> = { profileId: profile.id };
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.individualReconRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        record: { select: { id: true, title: true, type: true } },
        sourceA: { select: { id: true, originalName: true, status: true } },
        sourceB: { select: { id: true, originalName: true, status: true } },
        _count: { select: { items: true, exceptions: true } },
      },
    }),
    prisma.individualReconRun.count({ where }),
  ]);

  res.json({
    items: bigintToJson(items),
    total,
    page: Number(page),
    pageSize: take,
    totalPages: Math.ceil(total / take),
  });
}));

/** POST /api/individual/reconciliations — create + queue a run (checks quota). */
router.post('/', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const input = parseBody(createRunSchema, req.body);

  // Verify record exists and belongs to profile
  const record = await prisma.individualRecord.findFirst({
    where: { id: input.recordId, profileId: profile.id, isDeleted: false },
  });
  if (!record) throw NotFound('Record not found');

  // Verify source documents exist and belong to profile
  const [sourceA, sourceB, aisSource] = await Promise.all([
    prisma.individualDocument.findFirst({ where: { id: input.sourceAId, profileId: profile.id } }),
    input.sourceBId ? prisma.individualDocument.findFirst({ where: { id: input.sourceBId, profileId: profile.id } }) : null,
    input.aisSourceId ? prisma.individualDocument.findFirst({ where: { id: input.aisSourceId, profileId: profile.id } }) : null,
  ]);
  if (!sourceA) throw NotFound('Source A document not found');
  if (input.sourceBId && !sourceB) throw NotFound('Source B document not found');
  if (input.aisSourceId && !aisSource) throw NotFound('AIS source document not found');

  // Check quota BEFORE creating the run
  const quota = await checkQuota(profile.id, profile.plan);
  if (!quota.allowed) {
    throw BadRequest(`Daily job limit reached (${quota.limit}). Upgrade your plan or wait until tomorrow.`);
  }

  // Create the run
  const run = await prisma.individualReconRun.create({
    data: {
      profileId: profile.id,
      recordId: input.recordId,
      type: input.type,
      status: 'queued',
      sourceAId: input.sourceAId,
      sourceBId: input.sourceBId ?? null,
      aisSourceId: input.aisSourceId ?? null,
      periodFrom: input.periodFrom ? new Date(input.periodFrom) : null,
      periodTo: input.periodTo ? new Date(input.periodTo) : null,
      config: input.config,
      progress: 0,
    },
    include: {
      record: { select: { id: true, title: true, type: true } },
      sourceA: { select: { id: true, originalName: true } },
    },
  });

  // Consume credit (store log id for potential refund)
  const creditLogId = await consumeCredit(profile.id, me.userId, run.id);
  // Store creditLogId on the run config for refund on failure
  await prisma.individualReconRun.update({
    where: { id: run.id },
    data: { config: { ...(run.config ?? {}) as Record<string, unknown>, _creditLogId: creditLogId } as any },
  });

  // Enqueue for processing
  try {
    await enqueueReconJob({ runId: run.id, firmId: '', profileId: profile.id });
  } catch (err) {
    logger.warn({ runId: run.id, err }, 'Failed to enqueue reconciliation job');
    await prisma.individualReconRun.update({
      where: { id: run.id },
      data: { status: 'failed', error: 'Failed to enqueue job' },
    });
    await refundCredit(creditLogId);
    throw BadRequest('Failed to queue reconciliation job');
  }

  res.status(201).json(bigintToJson(run));
}));

/** GET /api/individual/reconciliations/:id — run detail with items. */
router.get('/:id', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const run = await prisma.individualReconRun.findFirst({
    where: { id: req.params.id, profileId: profile.id },
    include: {
      record: { select: { id: true, title: true, type: true } },
      sourceA: { select: { id: true, originalName: true, status: true } },
      sourceB: { select: { id: true, originalName: true, status: true } },
      aisSource: { select: { id: true, originalName: true, status: true } },
      items: { orderBy: { score: 'desc' }, take: 500 },
      exceptions: { orderBy: { createdAt: 'desc' }, take: 100 },
      reports: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!run) throw NotFound('Reconciliation run not found');

  res.json(bigintToJson(run));
}));

/** PATCH /api/individual/reconciliations/:id/items/:itemId — update item (e.g. mark as reviewed). */
router.patch('/runs/:runId/items/:itemId', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const itemSchema = z.object({
    matchStatus: z.string().optional(),
    notes: z.string().optional(),
    reviewed: z.boolean().optional(),
  });
  const input = parseBody(itemSchema, req.body);

  const item = await prisma.individualReconItem.findFirst({
    where: { id: req.params.itemId, runId: req.params.runId, profileId: profile.id },
  });
  if (!item) throw NotFound('Item not found');

  const updated = await prisma.individualReconItem.update({
    where: { id: item.id },
    data: {
      ...(input.matchStatus ? { matchStatus: input.matchStatus } : {}),
      ...(input.notes !== undefined ? { reasons: { ...(item.reasons as object ?? {}), notes: input.notes } } : {}),
      ...(input.reviewed !== undefined ? { reasons: { ...(item.reasons as object ?? {}), reviewed: input.reviewed } } : {}),
    },
  });

  res.json(bigintToJson(updated));
}));

/** DELETE /api/individual/reconciliations/:id — cancel a queued/running run. */
router.delete('/:id', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const run = await prisma.individualReconRun.findFirst({
    where: { id: req.params.id, profileId: profile.id },
  });
  if (!run) throw NotFound('Run not found');
  if (!['queued', 'running'].includes(run.status)) {
    throw BadRequest(`Cannot cancel a run in '${run.status}' status`);
  }

  await prisma.individualReconRun.update({
    where: { id: run.id },
    data: { status: 'cancelled' },
  });

  // Refund the credit
  const metadata = run.config as { _creditLogId?: string } | null;
  if (metadata?._creditLogId) {
    await refundCredit(metadata._creditLogId);
  }

  res.status(204).end();
}));

/** GET /api/individual/reconciliations/:id/export — presigned export URL. */
router.get('/:id/export', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const run = await prisma.individualReconRun.findFirst({
    where: { id: req.params.id, profileId: profile.id, status: 'completed' },
  });
  if (!run) throw NotFound('Run not found or not completed');

  // For now return items as JSON; full export to Excel would go through exportQueue
  res.json({ message: 'Export available — use the Reports page to download' });
}));

export default router;
