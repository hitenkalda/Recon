import prisma from '../prisma.js';
/**
 * Append an audit log row. Tenancy: the row is always scoped to the caller's
 * firm. Fire-and-forget so a failed audit write never breaks the main request.
 */
export function logAudit(req, entry) {
    const firmId = req.user?.firmId;
    if (!firmId)
        return;
    prisma.auditLog
        .create({
        data: {
            firmId,
            userId: req.user?.userId,
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId,
            detail: entry.detail,
            ip: req.ip,
            userAgent: req.headers['user-agent']?.slice(0, 300),
        },
    })
        .catch(() => {
        /* audit failures are non-fatal */
    });
}
//# sourceMappingURL=audit.js.map