import { Router } from 'express';
import prisma from '../prisma.js';
import { asyncHandler } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { bigintToJson } from '../prisma.js';
import { Role } from '@reconai/shared';
const router = Router();
router.use(requireAuth);
/**
 * GET /api/dashboard — role-aware summary. Every number is derived live from
 * the tenant-scoped tables (the UI never holds authoritative aggregates).
 */
router.get('/', asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const [clients, engagements, documents, runs, exceptionsBySeverity, openExceptions, myOpen, queuedRuns, recentRuns, recentExceptions] = await Promise.all([
        prisma.client.count({ where: { firmId: me.firmId, isDeleted: false, status: { not: 'archived' } } }),
        prisma.engagement.count({ where: { firmId: me.firmId, isDeleted: false, status: { notIn: ['archived'] } } }),
        prisma.document.count({ where: { firmId: me.firmId, status: { not: 'archived' } } }),
        prisma.reconRun.count({ where: { firmId: me.firmId } }),
        prisma.exception.groupBy({ by: ['severity'], where: { firmId: me.firmId, status: { notIn: ['resolved'] } }, _count: true }),
        prisma.exception.count({ where: { firmId: me.firmId, status: { notIn: ['resolved'] } } }),
        prisma.exception.count({ where: { firmId: me.firmId, status: { notIn: ['resolved'] }, assigneeId: me.userId } }),
        prisma.reconRun.count({ where: { firmId: me.firmId, status: { in: ['queued', 'running'] } } }),
        prisma.reconRun.findMany({
            where: { firmId: me.firmId },
            orderBy: { createdAt: 'desc' },
            take: 8,
            include: { client: { select: { id: true, name: true } }, engagement: { select: { id: true, title: true } } },
        }),
        prisma.exception.findMany({
            where: { firmId: me.firmId, status: { notIn: ['resolved'] } },
            orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
            take: 8,
            include: { client: { select: { id: true, name: true } }, engagement: { select: { id: true, title: true } } },
        }),
    ]);
    const severityBuckets = Object.fromEntries(exceptionsBySeverity.map((s) => [s.severity, s._count]));
    res.json(bigintToJson({
        metrics: {
            clients,
            engagements,
            documents,
            runs,
            openExceptions,
            myOpenExceptions: myOpen,
            queuedRuns,
        },
        severityBuckets,
        recentRuns: recentRuns.map((r) => ({ id: r.id, type: r.type, status: r.status, progress: r.progress, client: r.client.name, engagement: r.engagement.title, createdAt: r.createdAt, metrics: r.metrics })),
        recentExceptions: recentExceptions.map((e) => ({ id: e.id, severity: e.severity, status: e.status, title: e.title, client: e.client.name, engagement: e.engagement.title, kind: e.kind })),
        role: me.role,
        isPartnerOrAdmin: me.role === Role.Partner || me.role === Role.FirmAdmin,
    }));
}));
export default router;
//# sourceMappingURL=dashboard.js.map