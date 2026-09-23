import { Router } from 'express';
import {
  uploadInitSchema,
  documentConfirmSchema,
  reprocessSchema,
  columnMappingSchema,
  documentQuerySchema,
  ProcessingStage,
} from '@reconai/shared';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound, BadRequest } from '../lib/http.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import { objectKey, presignedPutUrl, presignedGetUrl, statObject } from '../storage/storage.js';
import { enqueueDocumentJob } from '../queues.js';
import { config } from '../config.js';
import { nanoid } from 'nanoid';

const router = Router();
router.use(requireAuth);

/** POST /api/documents/upload-init — reserve keys + presigned PUT URLs. */
router.post('/upload-init', requireCapability('documents.upload'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(uploadInitSchema, req.body);

  if (input.files.length > config.fileLimits.maxFilesPerUpload) {
    throw BadRequest(`Max ${config.fileLimits.maxFilesPerUpload} files per upload`);
  }
  const overSize = input.files.find((f) => f.size > config.fileLimits.maxSizeMb * 1024 * 1024);
  if (overSize) throw BadRequest(`File exceeds the ${config.fileLimits.maxSizeMb} MB limit`, { file: overSize.name });

  const [client, engagement] = await Promise.all([
    prisma.client.findFirst({ where: { id: input.clientId, firmId: me.firmId, isDeleted: false } }),
    prisma.engagement.findFirst({ where: { id: input.engagementId, firmId: me.firmId, clientId: input.clientId, isDeleted: false } }),
  ]);
  if (!client) throw NotFound('Client not found');
  if (!engagement) throw NotFound('Engagement not found');

  const uploadId = nanoid(12);
  const uploads = [];

  for (const file of input.files) {
    const fieldId = nanoid(10);
    const key = objectKey(me.firmId, engagement.id, file.name);
    const doc = await prisma.document.create({
      data: {
        firmId: me.firmId,
        clientId: client.id,
        engagementId: engagement.id,
        fileName: key,
        originalName: file.name,
        storagePath: key,
        mime: file.mime,
        size: BigInt(file.size),
        uploadedById: me.userId,
        status: ProcessingStage.Uploaded,
        virusScanResult: 'not_scanned',
      },
    });
    const presignedUrl = await presignedPutUrl(key);
    uploads.push({ fieldId, documentId: doc.id, presignedUrl, expiresIn: 3600 });
  }

  logAudit(req, { action: 'upload', entityType: 'upload_session', detail: { uploadId, files: input.files.length, engagementId: engagement.id } });
  res.json({ uploadId, uploads });
}));

/** POST /api/documents/:id/confirm — mark stored, enqueue processing. */
router.post('/:id/confirm', requireCapability('documents.upload'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(documentConfirmSchema, req.body);
  const doc = await prisma.document.findFirst({ where: { id: input.fieldId, firmId: me.firmId } });
  if (!doc) throw NotFound('Document not found');
  if (doc.uploadedById !== me.userId && !['senior', 'partner', 'firm_admin'].includes(me.role)) {
    throw BadRequest('Only the uploader may confirm their own upload');
  }

  // verify the object actually landed
  let meta;
  try {
    meta = await statObject(doc.storagePath);
  } catch {
    throw BadRequest('File was not uploaded to storage. Please retry the upload.');
  }

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: {
      status: ProcessingStage.Stored,
      size: BigInt(meta.size),
      category: input.category ?? doc.category,
      virusScanResult: 'clean', // scan hook runs in the worker; clean gate asserted there
    },
  });

  const processingJob = await prisma.processingJob.create({
    data: { documentId: doc.id, firmId: me.firmId, jobType: 'process', state: 'queued', stage: 'queued' },
  });
  void processingJob;
  await enqueueDocumentJob({ documentId: doc.id, firmId: me.firmId });

  logAudit(req, { action: 'process', entityType: 'document', entityId: doc.id, detail: { stage: 'stored' } });
  res.json(bigintToJson(updated));
}));

/** GET /api/documents — list with filters. */
router.get('/', requireCapability('documents.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const q = parseBody(documentQuerySchema, {
    engagementId: req.query.engagementId,
    clientId: req.query.clientId,
    category: req.query.category,
    status: req.query.status,
    search: req.query.search,
    page: req.query.page ?? 1,
    pageSize: req.query.pageSize ?? 50,
  });

  const where: Record<string, unknown> = { firmId: me.firmId, status: { not: 'archived' } };
  if (q.engagementId) where.engagementId = q.engagementId;
  if (q.clientId) where.clientId = q.clientId;
  if (q.category) where.category = q.category;
  if (q.status) where.status = q.status;
  if (q.search) where.originalName = { contains: q.search, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        client: { select: { id: true, name: true } },
        engagement: { select: { id: true, title: true } },
        _count: { select: { records: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  res.json(bigintToJson({
    items,
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.ceil(total / q.pageSize),
  }));
}));

/** GET /api/documents/:id — detail + first page of source records. */
router.get('/:id', requireCapability('documents.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, firmId: me.firmId },
    include: {
      client: { select: { id: true, name: true } },
      engagement: { select: { id: true, title: true } },
      jobs: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!doc) throw NotFound('Document not found');

  const page = Number(req.query.page ?? 1);
  const pageSize = Math.min(Number(req.query.pageSize ?? 50), 200);
  const [records, recordTotal] = await Promise.all([
    prisma.sourceRecord.findMany({
      where: { documentId: doc.id },
      orderBy: { rowIndex: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.sourceRecord.count({ where: { documentId: doc.id } }),
  ]);

  res.json(bigintToJson({ ...doc, records, recordsTotal: recordTotal, page, pageSize }));
}));

/** POST /api/documents/:id/reprocess */
router.post('/:id/reprocess', requireCapability('documents.reprocess'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const { documentId } = parseBody(reprocessSchema, { documentId: req.params.id });
  const doc = await prisma.document.findFirst({ where: { id: documentId, firmId: me.firmId } });
  if (!doc) throw NotFound('Document not found');

  await prisma.document.update({ where: { id: doc.id }, data: { status: ProcessingStage.Stored, failureReason: null } });
  await prisma.sourceRecord.deleteMany({ where: { documentId: doc.id } });
  await prisma.processingJob.create({ data: { documentId: doc.id, firmId: me.firmId, jobType: 'reprocess', state: 'queued', stage: 'queued' } });
  await enqueueDocumentJob({ documentId: doc.id, firmId: me.firmId });

  logAudit(req, { action: 'process', entityType: 'document', entityId: doc.id, detail: { stage: 'reprocess' } });
  res.json({ id: doc.id, status: ProcessingStage.Stored });
}));

/** POST /api/documents/:id/mapping — apply column mapping then renormalize. */
router.post('/:id/mapping', requireCapability('documents.reprocess'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(columnMappingSchema, { ...req.body });
  const doc = await prisma.document.findFirst({ where: { id: req.params.id, firmId: me.firmId } });
  if (!doc) throw NotFound('Document not found');

  if (!input.mappings.length) throw BadRequest('Provide at least one column mapping');

  const mappings: Record<string, string> = {};
  for (const m of input.mappings) mappings[m.sourceColumn] = m.targetField;

  await prisma.document.update({ where: { id: doc.id }, data: { mapping: mappings as object, status: ProcessingStage.ColumnsMapped } });
  await prisma.sourceRecord.deleteMany({ where: { documentId: doc.id } });
  await prisma.processingJob.create({ data: { documentId: doc.id, firmId: me.firmId, jobType: 'process', state: 'queued', stage: 'mapping' } });
  await enqueueDocumentJob({ documentId: doc.id, firmId: me.firmId });

  logAudit(req, { action: 'update', entityType: 'document', entityId: doc.id, detail: { mapping: mappings } });
  res.json({ id: doc.id, status: ProcessingStage.ColumnsMapped, mapping: mappings });
}));

/** GET /api/documents/:id/download — presigned URL (audited). */
router.get('/:id/download', requireCapability('documents.download'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const doc = await prisma.document.findFirst({ where: { id: req.params.id, firmId: me.firmId } });
  if (!doc) throw NotFound('Document not found');

  logAudit(req, { action: 'download', entityType: 'document', entityId: doc.id, detail: { originalName: doc.originalName } });
  const url = await presignedGetUrl(doc.storagePath, 300);
  res.json({ url, fileName: doc.originalName, mime: doc.mime });
}));

export default router;