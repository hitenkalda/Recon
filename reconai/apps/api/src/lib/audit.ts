import type { Request } from 'express';
import prisma from '../prisma.js';
import type { AuditAction } from '@reconai/shared';

export interface AuditEntry {
  action: AuditAction | string;
  entityType: string;
  entityId?: string;
  detail?: unknown;
}

/**
 * Append an audit log row. Tenancy: the row is always scoped to the caller's
 * firm (enterprise) or profile (individual). Fire-and-forget so a failed
 * audit write never breaks the main request.
 */
export function logAudit(req: Request, entry: AuditEntry): void {
  if (req.user?.firmId) {
    prisma.auditLog
      .create({
        data: {
          firmId: req.user.firmId,
          userId: req.user.userId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          detail: entry.detail as object | undefined,
          ip: req.ip,
          userAgent: req.headers['user-agent']?.slice(0, 300),
        },
      })
      .catch(() => { /* audit failures are non-fatal */ });
  }
  // Individual audit logs go to a separate table / are logged externally;
  // enterprise audit is the primary concern here.
}