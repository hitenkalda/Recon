import { Router } from 'express';
import prisma from '../prisma.js';
import { asyncHandler } from '../lib/http.js';
import { requireIndividualAuth } from '../middleware/auth.js';
import { currentIndividual } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import { getUsageStats } from '../services/individualEntitlement.js';

const router = Router();
router.use(requireIndividualAuth);

/** GET /api/individual/dashboard — summary stats for the individual workspace. */
router.get('/', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw new Error('Profile not found');

  const [stats, recentRuns, recentDocuments, pendingExceptions] = await Promise.all([
    getUsageStats(profile.id),
    prisma.individualReconRun.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { record: { select: { id: true, title: true } } },
    }),
    prisma.individualDocument.findMany({
      where: { profileId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.individualException.count({
      where: { profileId: profile.id, status: { notIn: ['resolved'] } },
    }),
  ]);

  const runsByStatus = await prisma.individualReconRun.groupBy({
    by: ['status'],
    where: { profileId: profile.id },
    _count: true,
  });
  const docsByStatus = await prisma.individualDocument.groupBy({
    by: ['status'],
    where: { profileId: profile.id },
    _count: true,
  });

  res.json(bigintToJson({
    stats,
    runsByStatus,
    docsByStatus,
    pendingExceptions,
    recentRuns: bigintToJson(recentRuns),
    recentDocuments: bigintToJson(recentDocuments),
  }));
}));

export default router;
