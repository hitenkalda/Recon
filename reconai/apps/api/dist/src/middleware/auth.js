import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { Forbidden, Unauthorized } from '../lib/http.js';
import { hasCapability, requireAtLeast } from '../services/rbac.js';
import prisma from '../prisma.js';
/** Sign the httpOnly cookie-bearing JWT. */
export function signToken(userId, firmId, role) {
    return jwt.sign({ sub: userId, firmId, role }, config.jwtSecret, {
        expiresIn: config.jwtExpiresIn,
    });
}
export const cookieOptions = {
    httpOnly: true,
    sameSite: config.cookieSecure ? 'none' : 'lax',
    secure: config.cookieSecure,
    domain: config.cookieDomain === 'localhost' ? undefined : config.cookieDomain,
    path: '/',
};
/**
 * Static token decode (no DB hit) used inside long-running jobs/workers.
 * For main flows prefer requireAuth (validates membership + active state).
 */
export function decodeUnchecked(token) {
    try {
        return jwt.verify(token, config.jwtSecret);
    }
    catch {
        return null;
    }
}
/** Middleware: verify JWT, load membership, attach req.user. */
export async function requireAuth(req, _res, next) {
    try {
        const token = req.cookies?.['reconai_token'];
        if (!token)
            return next(Unauthorized());
        const decoded = jwt.verify(token, config.jwtSecret);
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
            role: membership.role,
        };
        next();
    }
    catch {
        next(Unauthorized('Session expired or invalid'));
    }
}
/** Middleware: allow optional identity (e.g. /me, public health) but leave req.user unset when absent. */
export async function optionalAuth(req, _res, next) {
    try {
        const token = req.cookies?.['reconai_token'];
        if (!token)
            return next();
        const decoded = jwt.verify(token, config.jwtSecret);
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
                role: membership.role,
            };
        }
        next();
    }
    catch {
        next();
    }
}
export function requireCapability(cap) {
    return (req, _res, next) => {
        if (!req.user)
            return next(Unauthorized());
        if (!hasCapability(req.user.role, cap))
            return next(Forbidden());
        next();
    };
}
export function requireAtLeastRole(min) {
    return (req, _res, next) => {
        if (!req.user)
            return next(Unauthorized());
        if (!requireAtLeast(req.user.role, min))
            return next(Forbidden());
        next();
    };
}
//# sourceMappingURL=auth.js.map