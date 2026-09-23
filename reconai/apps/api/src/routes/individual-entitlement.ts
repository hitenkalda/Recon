import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound, BadRequest } from '../lib/http.js';
import { requireIndividualAuth } from '../middleware/auth.js';
import { currentIndividual } from '../types/context.js';
import { checkQuota } from '../services/individualEntitlement.js';

const router = Router();
router.use(requireIndividualAuth);

/** GET /api/individual/entitlement/quota — current quota status. */
router.get('/quota', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const quota = await checkQuota(profile.id, profile.plan);
  res.json(quota);
}));

/** POST /api/individual/entitlement/consume — manually consume a credit (for testing/audit). */
router.post('/consume', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const schema = z.object({ runId: z.string().cuid().optional() });
  const input = parseBody(schema, req.body);

  const logId = await prisma.$transaction(async (tx) => {
    const quota = await checkQuota(profile.id, profile.plan);
    if (!quota.allowed) throw BadRequest(`Daily limit reached (${quota.limit} jobs). Remaining: ${quota.remaining}`);
    const log = await tx.individualUsageLog.create({
      data: { profileId: profile.id, userId: me.userId, runId: input.runId ?? null, creditsUsed: 1, status: 'consumed' },
    });
    return log.id;
  });

  res.json({ consumed: true, logId });
}));

/** GET /api/individual/entitlement/usage — detailed usage history. */
router.get('/usage', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const logs = await prisma.individualUsageLog.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ items: logs, total: logs.length });
}));

export default router;
