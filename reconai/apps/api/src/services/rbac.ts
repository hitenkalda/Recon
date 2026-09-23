import { Role, ROLE_HIERARCHY } from '@reconai/shared';

/**
 * Capability-based RBAC, derived from the Application Flow's role model.
 * Every capability is also implicitly gated by `requireAtLeast(role, min)`.
 */
export const CAPABILITIES = {
  'clients.read': [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin],
  'clients.write': [Role.Senior, Role.Partner, Role.FirmAdmin],
  'clients.archive': [Role.Partner, Role.FirmAdmin],

  'engagements.read': [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin],
  'engagements.write': [Role.Senior, Role.Partner, Role.FirmAdmin],
  'engagements.manage': [Role.Partner, Role.FirmAdmin],

  'documents.read': [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin],
  'documents.upload': [Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin],
  'documents.reprocess': [Role.Senior, Role.Partner, Role.FirmAdmin],
  'documents.download': [Role.Senior, Role.Partner, Role.FirmAdmin],

  'reconciliation.read': [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin],
  'reconciliation.run': [Role.Senior, Role.Partner, Role.FirmAdmin],
  'reconciliation.override': [Role.Senior, Role.Partner, Role.FirmAdmin], // manual re-match
  'reconciliation.cancel': [Role.Senior, Role.Partner, Role.FirmAdmin],

  'exceptions.read': [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin],
  'exceptions.assign': [Role.Senior, Role.Partner, Role.FirmAdmin],
  'exceptions.resolve': [Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin],
  'exceptions.high_risk_approve': [Role.Senior, Role.Partner, Role.FirmAdmin],

  'workingpapers.read': [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin],
  'workingpapers.create': [Role.Senior, Role.Partner, Role.FirmAdmin],
  'workingpapers.sign': [Role.Partner, Role.FirmAdmin],
  'workingpapers.senior_sign': [Role.Senior, Role.Partner, Role.FirmAdmin],

  'reports.generate': [Role.Senior, Role.Partner, Role.FirmAdmin],
  'reports.read': [Role.Viewer, Role.Article, Role.Senior, Role.Partner, Role.FirmAdmin],

  'team.manage': [Role.FirmAdmin],
  'firm.settings': [Role.FirmAdmin],
  'audit.read': [Role.Partner, Role.FirmAdmin],
  'ai.consult': [Role.Senior, Role.Partner, Role.FirmAdmin],
} as const;

export type Capability = keyof typeof CAPABILITIES;

export function hasCapability(role: Role, cap: Capability): boolean {
  return (CAPABILITIES[cap] as readonly Role[]).includes(role);
}

export function requireAtLeast(role: Role, min: Role): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[min];
}

/**
 * Severity gate for exception resolution (Application Flow §exception-resolution):
 * Article/Viewer may only close low/medium; high/critical require a senior or above.
 */
export function canResolveSeverity(role: Role, severity: 'low' | 'medium' | 'high' | 'critical'): boolean {
  if (severity === 'low' || severity === 'medium') {
    return requireAtLeast(role, Role.Article);
  }
  return requireAtLeast(role, Role.Senior);
}

export const ROLE_NAMES: Record<Role, string> = {
  [Role.FirmAdmin]: 'Firm Admin',
  [Role.Partner]: 'Partner',
  [Role.Senior]: 'Senior Associate',
  [Role.Article]: 'Article',
  [Role.Viewer]: 'Viewer',
};