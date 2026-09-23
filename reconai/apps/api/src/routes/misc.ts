import { Router } from 'express';
import prisma from '../prisma.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth, requireCapability } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { bigintToJson } from '../prisma.js';

const router = Router();
router.use(requireAuth);

/** GET /api/notifications — current user's feed. */
router.get('/', asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const page = Number(req.query.page ?? 1);
  const pageSize = Math.min(Number(req.query.pageSize ?? 50), 100);
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: me.userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where: { userId: me.userId } }),
    prisma.notification.count({ where: { userId: me.userId, read: false } }),
  ]);
  res.json(bigintToJson({ items, total, unread, page, pageSize }));
}));

/** POST /api/notifications/:id/read */
router.post('/:id/read', asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const n = await prisma.notification.findFirst({ where: { id: req.params.id, userId: me.userId } });
  if (!n) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found' } });
  await prisma.notification.update({ where: { id: n.id }, data: { read: true } });
  res.json({ id: n.id, read: true });
}));

/** POST /api/notifications/read-all */
router.post('/read-all', asyncHandler(async (req, res) => {
  const me = currentUser(req);
  await prisma.notification.updateMany({ where: { userId: me.userId, read: false }, data: { read: true } });
  res.json({ updated: true });
}));

/** GET /api/audit-log — firm activity trail (partner+). */
router.get('/audit-log', requireCapability('audit.read'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const page = Number(req.query.page ?? 1);
  const pageSize = Math.min(Number(req.query.pageSize ?? 50), 200);
  const where: Record<string, unknown> = { firmId: me.firmId };
  if (req.query.action) where.action = req.query.action;
  if (req.query.entityType) where.entityType = req.query.entityType;
  if (req.query.userId) where.userId = req.query.userId;

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);
  // AuditLog stores user ids as plain scalars; resolve names for the viewer.
  const wanted = [...new Set(items.map((l) => l.userId).filter((x): x is string => Boolean(x)))];
  const users = wanted.length
    ? await prisma.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true, email: true } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const enriched = items.map((l) => ({ ...l, user: l.userId ? (userMap.get(l.userId) ?? null) : null }));
  res.json(bigintToJson({ items: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }));
}));

export default router;