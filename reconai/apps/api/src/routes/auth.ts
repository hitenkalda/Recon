import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Role, loginSchema, signupSchema, inviteSchema, firmUpdateSchema } from '@reconai/shared';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, Conflict, BadRequest, Forbidden } from '../lib/http.js';
import { logAudit } from '../lib/audit.js';
import { cookieOptions, requireAuth, requireCapability, signToken } from '../middleware/auth.js';
import { currentUser } from '../types/context.js';
import { hasCapability } from '../services/rbac.js';
import { nanoid } from 'nanoid';

const router = Router();

const SALT_ROUNDS = 12;
const cookieName = 'reconai_token';

/** GET /api/auth/me — current user + firm + role capabilities. */
router.get('/me', requireAuth, asyncHandler(async (_req, res) => {
  const me = currentUser(_req);
  const firm = await prisma.firm.findUnique({ where: { id: me.firmId } });
  res.json({
    user: {
      id: me.userId,
      email: me.email,
      name: me.name,
      role: me.role,
      firmId: me.firmId,
    },
    firm: firm ? { id: firm.id, name: firm.name, gstin: firm.gstin, pan: firm.pan, tan: firm.tan } : null,
  });
}));

/** POST /api/auth/signup — create firm + admin, or join via inviteToken. */
router.post('/signup', asyncHandler(async (req, res) => {
  const input = parseBody(signupSchema, req.body);

  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw Conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  let firmId: string;
  let role: Role = Role.FirmAdmin;

  if (input.inviteToken) {
    const invite = await prisma.invitation.findUnique({ where: { token: input.inviteToken } });
    if (!invite) throw BadRequest('Invalid invitation token');
    if (invite.status !== 'pending') throw BadRequest('This invitation has already been used');
    if (invite.expiresAt < new Date()) throw BadRequest('This invitation has expired');
    if (invite.email.toLowerCase() !== input.email.toLowerCase()) {
      throw Forbidden('This invitation was issued to a different email address');
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: input.email.toLowerCase(), passwordHash, name: input.name },
      });
      await tx.firmMember.create({
        data: { firmId: invite.firmId, userId: created.id, role: invite.role },
      });
      await tx.invitation.update({ where: { id: invite.id }, data: { status: 'accepted', acceptedAt: new Date() } });
      return created;
    });
    firmId = invite.firmId;
    role = invite.role as Role;
    logAudit(req, { action: 'auth', entityType: 'user', entityId: user.id, detail: { kind: 'signup_invite', role, firmId } });
    res.cookie(cookieName, signToken(user.id, firmId, role), cookieOptions);
    res.status(201).json({ id: user.id, role, firmId });
    return;
  }

  // Direct signup → new firm + firm_admin
  const firmResult = await prisma.$transaction(async (tx) => {
    const firm = await tx.firm.create({
      data: {
        name: input.firmName,
        gstin: input.firmGstin || undefined,
      },
    });
    const user = await tx.user.create({
      data: { email: input.email.toLowerCase(), passwordHash, name: input.name },
    });
    await tx.firmMember.create({ data: { firmId: firm.id, userId: user.id, role: Role.FirmAdmin } });
    return { user, firm };
  });

  logAudit(req, { action: 'auth', entityType: 'firm', entityId: firmResult.firm.id, detail: { kind: 'signup' } });
  res.cookie(cookieName, signToken(firmResult.user.id, firmResult.firm.id, Role.FirmAdmin), cookieOptions);
  res.status(201).json({ id: firmResult.user.id, role: Role.FirmAdmin, firmId: firmResult.firm.id });
}));

/** POST /api/auth/login */
router.post('/login', asyncHandler(async (req, res) => {
  const input = parseBody(loginSchema, req.body);

  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw BadRequest('Invalid email or password');
  }
  if (!user.isActive) throw Forbidden('This account has been deactivated');

  const membership = await prisma.firmMember.findFirst({
    where: { userId: user.id },
    include: { firm: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!membership) throw Forbidden('This account is not attached to a firm');
  if (!membership.firm.isActive) throw Forbidden('This firm has been deactivated');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  logAudit(req, { action: 'auth', entityType: 'session', detail: { kind: 'login' } });

  res.cookie(cookieName, signToken(user.id, membership.firmId, membership.role as Role), cookieOptions);
  res.json({ id: user.id, role: membership.role, firmId: membership.firmId });
}));

/** POST /api/auth/logout */
router.post('/logout', (_req, res) => {
  res.clearCookie(cookieName, cookieOptions);
  res.status(204).end();
});

/** POST /api/auth/invite — invite a teammate (firm_admin only). */
router.post('/invite', requireAuth, requireCapability('team.manage'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(inviteSchema, req.body);

  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  const existingMember = existing
    ? await prisma.firmMember.findUnique({
        where: { firmId_userId: { firmId: me.firmId, userId: existing.id } },
      })
    : null;
  if (existingMember) throw Conflict('This person is already a member of your firm');
  if ((input.role as Role) === Role.FirmAdmin) throw Forbidden('Admins must be provisioned by the firm root account');

  const token = nanoid(48);
  const invite = await prisma.invitation.create({
    data: {
      firmId: me.firmId,
      email: input.email.toLowerCase(),
      role: input.role,
      message: input.message,
      token,
      invitedById: me.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  logAudit(req, { action: 'create', entityType: 'invitation', entityId: invite.id, detail: { email: input.email, role: input.role } });
  res.status(201).json({ id: invite.id, expiresAt: invite.expiresAt, token });
}));

/** POST /api/auth/firm — update firm profile/settings (admin). */
router.post('/firm', requireAuth, requireCapability('firm.settings'), asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const input = parseBody(firmUpdateSchema, req.body);
  if (Object.keys(input).length === 0) throw BadRequest('Nothing to update');
  const firm = await prisma.firm.update({
    where: { id: me.firmId },
    data: {
      name: input.name,
      gstin: input.gstin,
      pan: input.pan,
      tan: input.tan,
      address: input.address,
      settings: input.settings as object | undefined,
    },
  });
  logAudit(req, { action: 'update', entityType: 'firm', entityId: firm.id });
  res.json({ id: firm.id, name: firm.name });
}));

/** List active membership (used by /settings/team). */
router.get('/team', requireAuth, asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const members = await prisma.firmMember.findMany({
    where: { firmId: me.firmId },
    include: { user: { select: { id: true, name: true, email: true, lastLoginAt: true, isActive: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    items: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      lastLoginAt: m.user.lastLoginAt,
      isActive: m.user.isActive,
    })),
  });
}));

/** Can the current user exercise a given capability (drives UI gating). */
router.post('/can', requireAuth, asyncHandler(async (req, res) => {
  const me = currentUser(req);
  const cap = (req.body?.capability ?? '') as string;
  res.json({ allowed: hasCapability(me.role, cap as never) });
}));

export default router;