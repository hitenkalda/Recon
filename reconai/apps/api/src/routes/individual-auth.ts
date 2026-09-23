import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { individualSignupSchema, individualLoginSchema } from '@reconai/shared';
import prisma from '../prisma.js';
import { asyncHandler, parseBody, BadRequest, Conflict, NotFound } from '../lib/http.js';
import {
  cookieOptions,
  individualCookieName,
  requireIndividualAuth,
  signIndividualToken,
} from '../middleware/auth.js';
import { currentIndividual } from '../types/context.js';
import { getProfileWithQuota, getUsageStats } from '../services/individualEntitlement.js';
import { logger } from '../logger.js';

const router = Router();
const SALT_ROUNDS = 12;

// ── Email/Password Signup ──────────────────────────────────────────

/** POST /api/individual/auth/signup — create individual account. */
router.post('/signup', asyncHandler(async (req, res) => {
  const input = parseBody(individualSignupSchema, req.body);

  const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (existing) throw Conflict('An account with this email already exists');

  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: await bcrypt.hash(input.password, SALT_ROUNDS),
    },
  });

  await prisma.individualProfile.create({
    data: { userId: user.id, plan: 'free', credits: 5 },
  });

  const token = signIndividualToken(user.id);
  res.cookie(individualCookieName, token, cookieOptions);
  res.status(201).json({ id: user.id });
}));

// ── Email/Password Login ───────────────────────────────────────────

/** POST /api/individual/auth/login — authenticate individual user. */
router.post('/login', asyncHandler(async (req, res) => {
  const input = parseBody(individualLoginSchema, req.body);

  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!user || !user.passwordHash || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw BadRequest('Invalid email or password');
  }
  if (!user.isActive) throw BadRequest('This account has been deactivated');

  // Ensure individual profile exists
  let profile = await prisma.individualProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    profile = await prisma.individualProfile.create({
      data: { userId: user.id, plan: 'free', credits: 5 },
    });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = signIndividualToken(user.id, profile.plan);
  res.cookie(individualCookieName, token, cookieOptions);
  res.json({ id: user.id, plan: profile.plan });
}));

// ── Google OAuth ───────────────────────────────────────────────────

/** GET /api/individual/auth/google — redirect to Google. */
router.get('/google', asyncHandler(async (_req, res) => {
  const { google } = await import('../config.js').then((m) => m.config);
  if (!google.clientId) throw BadRequest('Google OAuth is not configured');

  const state = crypto.randomBytes(16).toString('hex');
  const scope = 'openid email profile';
  const params = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: google.callbackUrl,
    response_type: 'code',
    scope,
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 5 * 60 * 1000 });
  res.redirect(`${google.authorizationUrl}?${params}`);
}));

/** GET /api/individual/auth/google/callback — Google returns code + state. */
router.get('/google/callback', asyncHandler(async (req, res) => {
  const { google } = await import('../config.js').then((m) => m.config);
  const { code, state, error } = req.query;

  if (error) throw BadRequest(`Google authorization error: ${error}`);
  if (!code || typeof code !== 'string') throw BadRequest('Missing authorization code');

  // Verify state
  const savedState = req.cookies?.oauth_state as string | undefined;
  if (!state || state !== savedState) throw BadRequest('Invalid OAuth state');
  res.clearCookie('oauth_state');

  // Exchange code for token
  const tokenResp = await fetch(google.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: google.clientId ?? '',
      client_secret: google.clientSecret!,
      redirect_uri: google.callbackUrl,
      grant_type: 'authorization_code',
    }).toString(),
  });
  if (!tokenResp.ok) {
    const text = await tokenResp.text();
    logger.error({ status: tokenResp.status, body: text }, 'Google token exchange failed');
    throw BadRequest('Failed to exchange authorization code');
  }
  const tokenData = await tokenResp.json() as { access_token: string; refresh_token?: string; id_token?: string };

  // Get user info
  const userResp = await fetch(google.userInfoUrl, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!userResp.ok) throw BadRequest('Failed to get user info from Google');
  const googleUser = await userResp.json() as {
    sub: string;
    email: string;
    name: string;
    email_verified: boolean;
  };

  if (!googleUser.email_verified) throw BadRequest('Email not verified with Google');

  const email = googleUser.email.toLowerCase();

  // Find or create User
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, name: googleUser.name ?? email.split('@')[0], passwordHash: null } });
  }

  // Upsert GoogleAccount
  await prisma.googleAccount.upsert({
    where: { googleId: googleUser.sub },
    update: { email, name: googleUser.name ?? undefined },
    create: { userId: user.id, googleId: googleUser.sub, email, name: googleUser.name ?? undefined },
  });

  // Find or create IndividualProfile
  let profile = await prisma.individualProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    profile = await prisma.individualProfile.create({
      data: { userId: user.id, plan: 'free', credits: 5 },
    });
  }

  if (!user.isActive) throw BadRequest('This account has been deactivated');

  // Set the individual cookie and redirect to the individual dashboard
  const token = signIndividualToken(user.id, profile.plan);
  res.cookie(individualCookieName, token, cookieOptions);

  // Redirect to web app — the frontend will detect individual session
  const redirectUrl = new URL('/individual/dashboard', process.env.WEB_URL ?? 'http://localhost:3000');
  res.redirect(302, redirectUrl.toString());
}));

// ── Individual /me ─────────────────────────────────────────────────

/** GET /api/individual/auth/me — current individual user info + quota. */
router.get('/me', requireIndividualAuth, asyncHandler(async (req, res) => {
  const me = currentIndividual(req);
  const profile = await getProfileWithQuota(me.userId);
  if (!profile) throw NotFound('Individual profile not found');

  const stats = await getUsageStats(profile.id);

  res.json({
    user: { id: me.userId, email: me.email, name: me.name },
    profile: {
      id: profile.id,
      plan: profile.plan,
      quota: stats,
    },
  });
}));

// ── Logout ─────────────────────────────────────────────────────────

/** POST /api/individual/auth/logout */
router.post('/logout', (_req, res) => {
  res.clearCookie(individualCookieName, cookieOptions);
  res.status(204).end();
});

// ── Plan info ──────────────────────────────────────────────────────

/** GET /api/individual/plans — public plan catalog. */
router.get('/plans', (_req, res) => {
  res.json({
    plans: [
      { id: 'free', name: 'Free', price: 0, currency: 'INR', monthly: false, dailyJobs: 5, features: ['5 reconciliation jobs/day', 'Basic reports', 'Single file upload'] },
      { id: 'basic', name: 'Basic', price: 1000, currency: 'INR', monthly: true, dailyJobs: 30, features: ['30 reconciliation jobs/day', 'All report formats', 'Multi-file upload', 'Priority support'] },
      { id: 'pro', name: 'Pro', price: 2000, currency: 'INR', monthly: true, dailyJobs: 999999, features: ['Unlimited jobs', 'All report formats', 'Unlimited uploads', 'Advanced analytics', 'Dedicated support'] },
    ],
  });
});

export default router;
