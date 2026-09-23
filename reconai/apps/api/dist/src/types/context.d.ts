import type { Role } from '@reconai/shared';
import type { Request } from 'express';
/** Identity attached to authenticated requests by the auth middleware. */
export interface AuthenticatedUser {
    userId: string;
    firmId: string;
    email: string;
    name: string;
    role: Role;
}
declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}
export declare const currentUser: (req: Request) => AuthenticatedUser;
//# sourceMappingURL=context.d.ts.map