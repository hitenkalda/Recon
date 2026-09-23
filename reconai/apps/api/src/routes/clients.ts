import { Router } from 'express';
import { clientCreateSchema, clientUpdateSchema, clientQuerySchema, validateGSTIN, validatePAN, validateTAN, validateCIN } from '@reconai/shared';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, NotFound, BadRequest } from '../lib/http.js';
import { logAudit } from '../lib/audit.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { bigintToJson } from '../prisma.js';

const router = Router();
router.use(requireAuth);

/** GET /api/clients — list + filter (search, status, pills). */
router.get('/', requireCapability('clients.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const q = parseBody(clientQuerySchema, {
    search: req.query.search,
    status: req.query.status,
    filter: req.query.filter ?? 'all',
    page: req.query.page ?? 1,
    pageSize: req.query.pageSize ?? 50,
  });

  const where: Record<string, unknown> = { firmId: me.firmId, isDeleted: false };
  if (q.status) where.status = q.status;
  if (q.search) {
    where.OR = [
      { name: { contains: q.search, mode: 'insensitive' } },
      { gstin: { contains: q.search, mode: 'insensitive' } },
      { pan: { contains: q.search, mode: 'insensitive' } },
    ];
  }
  if (q.filter === 'active_gst') where.gstin = { not: null };
  if (q.filter === 'tax_audit') where.tags = { array_contains: ['tax_audit'] };

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { _count: { select: { engagements: { where: { isDeleted: false } }, documents: true } } },
    }),
    prisma.client.count({ where }),
  ]);

  res.json(bigintToJson({
    items: items.map((c) => ({
      ...c,
      engagementsCount: c._count.engagements,
      documentsCount: c._count.documents,
      _count: undefined,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.ceil(total / q.pageSize),
  }));
}));

/** GET /api/clients/:id */
router.get('/:id', requireCapability('clients.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, firmId: me.firmId, isDeleted: false },
    include: {
      engagements: { where: { isDeleted: false }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { documents: true, runs: true, workingPapers: true } } } },
      _count: { select: { documents: true } },
    },
  });
  if (!client) throw NotFound('Client not found');
  res.json(bigintToJson(client));
}));

/** POST /api/clients — create (senior+). */
router.post('/', requireCapability('clients.write'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(clientCreateSchema, req.body);
  assertUniqueIdentifiers(input as never);

  const client = await prisma.client.create({
    data: {
      firmId: me.firmId,
      name: input.name,
      type: input.type,
      gstin: input.gstin || undefined,
      pan: input.pan || undefined,
      tan: input.tan || undefined,
      cin: input.cin || undefined,
      address: input.address,
      contacts: input.contacts as object,
      tags: input.tags,
    },
  });
  logAudit(req, { action: 'create', entityType: 'client', entityId: client.id, detail: { name: client.name } });
  res.status(201).json(bigintToJson(client));
}));

/** PATCH /api/clients/:id */
router.patch('/:id', requireCapability('clients.write'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const existing = await prisma.client.findFirst({ where: { id: req.params.id, firmId: me.firmId, isDeleted: false } });
  if (!existing) throw NotFound('Client not found');

  const input = parseBody(clientUpdateSchema, req.body);
  assertUniqueIdentifiers({ ...existing, ...input });

  const client = await prisma.client.update({
    where: { id: existing.id },
    data: {
      name: input.name,
      type: input.type,
      gstin: input.gstin,
      pan: input.pan,
      tan: input.tan,
      cin: input.cin,
      address: input.address,
      status: input.status,
      contacts: input.contacts as object | undefined,
      tags: input.tags,
    },
  });
  logAudit(req, { action: 'update', entityType: 'client', entityId: client.id });
  res.json(bigintToJson(client));
}));

/** DELETE /api/clients/:id — soft archive (partner+). */
router.delete('/:id', requireCapability('clients.archive'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const existing = await prisma.client.findFirst({ where: { id: req.params.id, firmId: me.firmId, isDeleted: false } });
  if (!existing) throw NotFound('Client not found');
  await prisma.client.update({ where: { id: existing.id }, data: { isDeleted: true, status: 'archived' } });
  await prisma.engagement.updateMany({ where: { clientId: existing.id }, data: { isDeleted: true, status: 'archived' } });
  logAudit(req, { action: 'delete', entityType: 'client', entityId: existing.id });
  res.status(204).end();
}));

function assertUniqueIdentifiers(input: {
  gstin?: string | null; pan?: string | null; tan?: string | null; cin?: string | null;
  name?: string; type?: string;
}) {
  if (input.gstin && !validateGSTIN(input.gstin).valid) throw BadRequest(validateGSTIN(input.gstin).reason ?? 'Invalid GSTIN', { gstin: input.gstin });
  if (input.pan && !validatePAN(input.pan).valid) throw BadRequest(validatePAN(input.pan).reason ?? 'Invalid PAN', { pan: input.pan });
  if (input.tan && !validateTAN(input.tan).valid) throw BadRequest(validateTAN(input.tan).reason ?? 'Invalid TAN', { tan: input.tan });
  if (input.cin && !validateCIN(input.cin).valid) throw BadRequest(validateCIN(input.cin).reason ?? 'Invalid CIN', { cin: input.cin });
}

export default router;