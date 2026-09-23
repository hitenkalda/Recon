import { Router } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound, BadRequest } from '../lib/http.js';
import { requireIndividualAuth } from '../middleware/auth.js';
import { currentIndividual } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import { presignedPutUrl, presignedGetUrl, removeObject } from '../storage/storage.js';
import { config } from '../config.js';
import { nanoid } from 'nanoid';
import { enqueueDocumentJob } from '../queues.js';
import { logger } from '../logger.js';

const router = Router();
router.use(requireIndividualAuth);

const ALLOWED_MIME_PREFIXES = [
  'application/pdf',
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/xml',
];

const ALLOWED_EXTENSIONS = ['.csv', '.txt', '.pdf', '.xls', '.xlsx', '.xml'];

function validateFile(mime: string, name: string): void {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw BadRequest(`File type not allowed: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }
  const isAllowed = ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));
  if (!isAllowed) {
    throw BadRequest(`MIME type not allowed: ${mime}`);
  }
}

function sanitizeFileName(name: string): string {
  // Prevent path traversal
  const cleaned = name.replace(/[/\\]/g, '_');
  return cleaned.slice(0, 200);
}

/** GET /api/individual/documents — list documents for the profile. */
router.get('/', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const { page = '1', pageSize = '20', status, recordId } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(pageSize);
  const take = Math.min(Number(pageSize), 100);

  const where: Record<string, unknown> = { profileId: profile.id };
  if (status) where.status = status;
  if (recordId) where.recordId = recordId;

  const [items, total] = await Promise.all([
    prisma.individualDocument.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.individualDocument.count({ where }),
  ]);

  res.json({
    items: bigintToJson(items),
    total,
    page: Number(page),
    pageSize: take,
    totalPages: Math.ceil(total / take),
  });
}));

/** POST /api/individual/documents/upload-init — get presigned PUT URL. */
router.post('/upload-init', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const schema = z.object({
    recordId: z.string().cuid(),
    files: z.array(z.object({
      name: z.string().min(1),
      mime: z.string().min(1),
      size: z.number().positive(),
    })).min(1).max(config.fileLimits.maxFilesPerUpload),
  });
  const input = parseBody(schema, req.body);

  // Verify record belongs to profile
  const record = await prisma.individualRecord.findFirst({
    where: { id: input.recordId, profileId: profile.id, isDeleted: false },
  });
  if (!record) throw NotFound('Record not found');

  // Check file sizes
  const maxSizeBytes = config.fileLimits.maxSizeMb * 1024 * 1024;
  for (const file of input.files) {
    validateFile(file.mime, file.name);
    if (file.size > maxSizeBytes) {
      throw BadRequest(`File "${file.name}" exceeds ${config.fileLimits.maxSizeMb} MB limit`);
    }
  }

  const uploadId = nanoid(12);
  const uploads = [];

  for (const file of input.files) {
    const safeName = sanitizeFileName(file.name);
    const key = `individual/${profile.id}/${record.id}/${Date.now()}_${safeName}`;

    // Duplicate detection via SHA-256 placeholder (we check by size+name initially)
    const existingDup = await prisma.individualDocument.findFirst({
      where: { profileId: profile.id, recordId: record.id, size: BigInt(file.size), originalName: safeName },
    });
    if (existingDup) {
      uploads.push({ fieldId: nanoid(10), documentId: existingDup.id, presignedUrl: '', error: 'Duplicate file detected', expiresIn: 0 });
      continue;
    }

    const doc = await prisma.individualDocument.create({
      data: {
        profileId: profile.id,
        recordId: record.id,
        fileName: key,
        originalName: safeName,
        storagePath: key,
        mime: file.mime,
        size: BigInt(file.size),
        uploadedById: me.userId,
        status: 'uploaded',
        virusScanResult: 'not_scanned',
        recordCount: 0,
      },
    });

    const presignedUrl = await presignedPutUrl(key);
    uploads.push({ fieldId: doc.id, documentId: doc.id, presignedUrl, expiresIn: 3600 });
  }

  res.json({ uploadId, uploads });
}));

/** POST /api/individual/documents/:id/confirm — mark stored, enqueue processing. */
router.post('/:id/confirm', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const doc = await prisma.individualDocument.findFirst({
    where: { id: req.params.id, profileId: profile.id },
  });
  if (!doc) throw NotFound('Document not found');

  if (doc.status !== 'uploaded') throw BadRequest(`Document is not in 'uploaded' status (current: ${doc.status})`);

  const updated = await prisma.individualDocument.update({
    where: { id: doc.id },
    data: { status: 'stored' },
  });

  // Enqueue for processing
  try {
    await enqueueDocumentJob({ documentId: updated.id, firmId: '', profileId: profile.id });
  } catch (err) {
    logger.warn({ documentId: updated.id, err }, 'Failed to enqueue document for processing');
  }

  res.json(bigintToJson(updated));
}));

/** GET /api/individual/documents/:id — get document detail. */
router.get('/:id', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const doc = await prisma.individualDocument.findFirst({
    where: { id: req.params.id, profileId: profile.id },
    include: {
      records: { orderBy: { rowIndex: 'asc' }, take: 100 },
      jobs: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!doc) throw NotFound('Document not found');

  res.json(bigintToJson(doc));
}));

/** GET /api/individual/documents/:id/download — get presigned download URL. */
router.get('/:id/download', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const doc = await prisma.individualDocument.findFirst({
    where: { id: req.params.id, profileId: profile.id },
  });
  if (!doc) throw NotFound('Document not found');

  const url = await presignedGetUrl(doc.storagePath);
  res.json({ url, fileName: doc.originalName, mime: doc.mime });
}));

/** DELETE /api/individual/documents/:id — delete document. */
router.delete('/:id', asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await prisma.individualProfile.findUnique({ where: { userId: me.userId } });
  if (!profile) throw NotFound('Profile not found');

  const doc = await prisma.individualDocument.findFirst({
    where: { id: req.params.id, profileId: profile.id },
  });
  if (!doc) throw NotFound('Document not found');

  // Remove from storage
  await removeObject(doc.storagePath);

  await prisma.individualDocument.delete({ where: { id: doc.id } });
  res.status(204).end();
}));

export default router;
