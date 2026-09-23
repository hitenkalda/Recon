import { Router } from 'express';
import prisma from '../prisma.js';
import { asyncHandler, NotFound } from '../lib/http.js';
import { requireIndividualAuth } from '../middleware/auth.js';
import { currentIndividual } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import { presignedGetUrl } from '../storage/storage.js';

const router = Router();
router.use(requireIndividualAuth);

/** GET /api/individual/reports — list reports. */
router.get('/', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const items = await prisma.individualReport.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      record: { select: { id: true, title: true } },
      run: { select: { id: true, type: true, status: true } },
    },
  });

  res.json(bigintToJson(items));
}));

/** GET /api/individual/reports/:id/download — presigned download URL. */
router.get('/:id/download', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const report = await prisma.individualReport.findFirst({
    where: { id: req.params.id, profileId: profile.id },
  });
  if (!report) throw NotFound('Report not found');

  const url = await presignedGetUrl(report.storagePath);
  res.json({ url, fileName: report.storagePath.split('/').pop(), format: report.format });
}));

export default router;
