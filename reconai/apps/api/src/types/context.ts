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
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const currentUser = (req: Request): AuthenticatedUser => {
  if (!req.user) throw new Error('request.user missing (requireAuth not applied)');
  return req.user;
};