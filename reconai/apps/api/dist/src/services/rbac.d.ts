import { Role } from '@reconai/shared';
/**
 * Capability-based RBAC, derived from the Application Flow's role model.
 * Every capability is also implicitly gated by `requireAtLeast(role, min)`.
 */
export declare const CAPABILITIES: {
    readonly 'clients.read': readonly [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'clients.write': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'clients.archive': readonly [Role.Partner, Role.FirmAdmin];
    readonly 'engagements.read': readonly [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'engagements.write': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'engagements.manage': readonly [Role.Partner, Role.FirmAdmin];
    readonly 'documents.read': readonly [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'documents.upload': readonly [Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'documents.reprocess': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'documents.download': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'reconciliation.read': readonly [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'reconciliation.run': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'reconciliation.override': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'reconciliation.cancel': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'exceptions.read': readonly [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'exceptions.assign': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'exceptions.resolve': readonly [Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'exceptions.high_risk_approve': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'workingpapers.read': readonly [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'workingpapers.create': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'workingpapers.sign': readonly [Role.Partner, Role.FirmAdmin];
    readonly 'workingpapers.senior_sign': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'reports.generate': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'reports.read': readonly [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin];
    readonly 'team.manage': readonly [Role.FirmAdmin];
    readonly 'firm.settings': readonly [Role.FirmAdmin];
    readonly 'audit.read': readonly [Role.Partner, Role.FirmAdmin];
    readonly 'ai.consult': readonly [Role.Senior, Role.Partner, Role.FirmAdmin];
};
export type Capability = keyof typeof CAPABILITIES;
export declare function hasCapability(role: Role, cap: Capability): boolean;
export declare function requireAtLeast(role: Role, min: Role): boolean;
/**
 * Severity gate for exception resolution (Application Flow §exception-resolution):
 * Article/Viewer may only close low/medium; high/critical require a senior or above.
 */
export declare function canResolveSeverity(role: Role, severity: 'low' | 'medium' | 'high' | 'critical'): boolean;
export declare const ROLE_NAMES: Record<Role, string>;
//# sourceMappingURL=rbac.d.ts.map