import type { Request } from 'express';
import type { AuditAction } from '@reconai/shared';
export interface AuditEntry {
    action: AuditAction | string;
    entityType: string;
    entityId?: string;
    detail?: unknown;
}
/**
 * Append an audit log row. Tenancy: the row is always scoped to the caller's
 * firm. Fire-and-forget so a failed audit write never breaks the main request.
 */
export declare function logAudit(req: Request, entry: AuditEntry): void;
//# sourceMappingURL=audit.d.ts.map