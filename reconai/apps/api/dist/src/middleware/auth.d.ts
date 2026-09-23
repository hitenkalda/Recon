import { NextFunction, Request, Response } from 'express';
import { Role } from '@reconai/shared';
import { type Capability } from '../services/rbac.js';
export interface JwtPayload {
    sub: string;
    firmId: string;
    role: Role;
}
/** Sign the httpOnly cookie-bearing JWT. */
export declare function signToken(userId: string, firmId: string, role: Role): string;
export declare const cookieOptions: {
    httpOnly: boolean;
    sameSite: "none" | "lax";
    secure: boolean;
    domain: string | undefined;
    path: string;
};
/**
 * Static token decode (no DB hit) used inside long-running jobs/workers.
 * For main flows prefer requireAuth (validates membership + active state).
 */
export declare function decodeUnchecked(token: string): JwtPayload | null;
/** Middleware: verify JWT, load membership, attach req.user. */
export declare function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void>;
/** Middleware: allow optional identity (e.g. /me, public health) but leave req.user unset when absent. */
export declare function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void>;
export declare function requireCapability(cap: Capability): (req: Request, _res: Response, next: NextFunction) => void;
export declare function requireAtLeastRole(min: Role): (req: Request, _res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map