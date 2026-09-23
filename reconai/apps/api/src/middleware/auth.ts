import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { Role } from '@reconai/shared';
import { config } from '../config.js';
import { Forbidden, Unauthorized } from '../lib/http.js';
import { hasCapability, requireAtLeast, type Capability } from '../services/rbac.js';
import type { AuthenticatedUser } from '../types/context.js';
import prisma from '../prisma.js';

export interface JwtPayload {
  sub: string;
  firmId: string;
  role: Role;
}

/** Sign the httpOnly cookie-bearing JWT. */
export function signToken(userId: string, firmId: string, role: Role): string {
  return jwt.sign({ sub: userId, firmId, role } satisfies JwtPayload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
  });
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: config.cookieSecure ? 'none' as const : 'lax' as const,
  secure: config.cookieSecure,
  domain: config.cookieDomain === 'localhost' ? undefined : config.cookieDomain,
  path: '/',
};

/**
 * Static token decode (no DB hit) used inside long-running jobs/workers.
 * For main flows prefer requireAuth (validates membership + active state).
 */
export function decodeUnchecked(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}

/** Middleware: verify JWT, load membership, attach req.user. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.['reconai_token'] as string | undefined;
    if (!token) return next(Unauthorized());

    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;

    const membership = await prisma.firmMember.findUnique({
      where: { firmId_userId: { firmId: decoded.firmId, userId: decoded.sub } },
      include: { user: true, firm: true },
    });
    if (!membership || !membership.user.isActive || !membership.firm.isActive) {
      return next(Unauthorized('Your account is inactive'));
    }

    req.user = {
      userId: membership.userId,
      firmId: membership.firmId,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role as Role,
    } satisfies AuthenticatedUser;
    next();
  } catch {
    next(Unauthorized('Session expired or invalid'));
  }
}

/** Middleware: allow optional identity (e.g. /me, public health) but leave req.user unset when absent. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.['reconai_token'] as string | undefined;
    if (!token) return next();
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    const membership = await prisma.firmMember.findUnique({
      where: { firmId_userId: { firmId: decoded.firmId, userId: decoded.sub } },
      include: { user: true, firm: true },
    });
    if (membership && membership.user.isActive && membership.firm.isActive) {
      req.user = {
        userId: membership.userId,
        firmId: membership.firmId,
        email: membership.user.email,
        name: membership.user.name,
        role: membership.role as Role,
      };
    }
    next();
  } catch {
    next();
  }
}

export function requireCapability(cap: Capability) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Unauthorized());
    if (!hasCapability(req.user.role, cap)) return next(Forbidden());
    next();
  };
}

export function requireAtLeastRole(min: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(Unauthorized());
    if (!requireAtLeast(req.user.role, min)) return next(Forbidden());
    next();
  };
}