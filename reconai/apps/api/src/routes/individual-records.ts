import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound, BadRequest } from '../lib/http.js';
import { requireIndividualAuth } from '../middleware/auth.js';
import { currentIndividual } from '../types/context.js';
import { bigintToJson } from '../prisma.js';

const router = Router();
router.use(requireIndividualAuth);

const createRecordSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['gst', 'bank', 'tds', 'variance', 'ais_26as', 'other']),
  periodFrom: z.string().datetime().optional(),
  periodTo: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

/** GET /api/individual/records — list all records for the profile. */
router.get('/', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const [items, total] = await Promise.all([
    prisma.individualRecord.findMany({
      where: { profileId: profile.id, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.individualRecord.count({ where: { profileId: profile.id, isDeleted: false } }),
  ]);

  res.json({
    items: bigintToJson(items),
    total,
    page: 1,
    pageSize: 50,
  });
}));

/** POST /api/individual/records — create a new record. */
router.post('/', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const input = parseBody(createRecordSchema, req.body);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const record = await prisma.individualRecord.create({
    data: {
      profileId: profile.id,
      title: input.title,
      type: input.type,
      periodFrom: input.periodFrom ? new Date(input.periodFrom) : null,
      periodTo: input.periodTo ? new Date(input.periodTo) : null,
      metadata: input.metadata,
      status: 'draft',
    },
  });

  res.status(201).json(bigintToJson(record));
}));

/** GET /api/individual/records/:id — get a single record. */
router.get('/:id', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const record = await prisma.individualRecord.findFirst({
    where: { id: req.params.id, profileId: profile.id, isDeleted: false },
    include: {
      documents: { orderBy: { createdAt: 'desc' } },
      runs: { orderBy: { createdAt: 'desc' }, take: 20 },
      _count: { select: { documents: true, runs: true } },
    },
  });
  if (!record) throw NotFound('Record not found');

  res.json(bigintToJson({ ...record, documents: record.documents }));
}));

/** PATCH /api/individual/records/:id — update record. */
router.patch('/:id', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const updateSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    type: z.enum(['gst', 'bank', 'tds', 'variance', 'ais_26as', 'other']).optional(),
    periodFrom: z.string().datetime().optional(),
    periodTo: z.string().datetime().optional(),
    metadata: z.record(z.any()).optional(),
  });
  const input = parseBody(updateSchema, req.body);
  if (Object.keys(input).length === 0) throw BadRequest('Nothing to update');

  const record = await prisma.individualRecord.findFirst({
    where: { id: req.params.id, profileId: profile.id, isDeleted: false },
  });
  if (!record) throw NotFound('Record not found');

  const updated = await prisma.individualRecord.update({
    where: { id: record.id },
    data: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.periodFrom ? { periodFrom: new Date(input.periodFrom) } : {}),
      ...(input.periodTo ? { periodTo: new Date(input.periodTo) } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });

  res.json(bigintToJson(updated));
}));

/** DELETE /api/individual/records/:id — soft delete. */
router.delete('/:id', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const record = await prisma.individualRecord.findFirst({
    where: { id: req.params.id, profileId: profile.id, isDeleted: false },
  });
  if (!record) throw NotFound('Record not found');

  await prisma.individualRecord.update({
    where: { id: record.id },
    data: { isDeleted: true },
  });

  res.status(204).end();
}));

export default router;
