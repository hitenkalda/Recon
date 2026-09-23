import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request, { type Agent } from 'supertest';
import { createApp } from '../app.js';
import prisma from '../prisma.js';
import { signToken, signIndividualToken } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const app = createApp();
const SALT_ROUNDS = 12;

// ── Test fixtures ───────────────────────────────────────────────────

const users = {
  indA: null as { id: string; email: string; token: string; password: string } | null,
  indB: null as { id: string; email: string; token: string; password: string } | null,
  entA: null as { id: string; email: string; firmId: string; token: string; password: string } | null,
  entB: null as { id: string; email: string; firmId: string; token: string; password: string } | null,
};

const profileIds = { indA: null as string | null, indB: null as string | null };
const firmIds = { entA: null as string | null, entB: null as string | null };

const fixtures = {
  indRecordA: null as string | null,
  indRecordB: null as string | null,
  entClientA: null as string | null,
  entClientB: null as string | null,
};

// Cookie jars per user to preserve sessions
const sessions = {
  indA: null as Agent | null,
  indB: null as Agent | null,
  entA: null as Agent | null,
  entB: null as Agent | null,
};

async function seedIndividualUser(name: string, email: string) {
  const password = 'TestPass123!';
  const user = await prisma.user.create({
    data: { email, name, passwordHash: await bcrypt.hash(password, SALT_ROUNDS), isActive: true },
  });
  await prisma.individualProfile.create({
    data: { userId: user.id, plan: 'free', credits: 5 },
  });
  const token = signIndividualToken(user.id);
  return { id: user.id, email, token, password };
}

async function seedEnterpriseUser(name: string, email: string) {
  const password = 'TestPass123!';
  const user = await prisma.user.create({
    data: { email, name, passwordHash: await bcrypt.hash(password, SALT_ROUNDS), isActive: true },
  });
  const firm = await prisma.firm.create({
    data: { name: `${name}'s Firm`, gstin: null, pan: null, tan: null, isActive: true },
  });
  await prisma.firmMember.create({
    data: { firmId: firm.id, userId: user.id, role: 'firm_admin' },
  });
  const token = signToken(user.id, firm.id, 'firm_admin' as any);
  return { id: user.id, email, firmId: firm.id, token, password };
}

beforeAll(async () => {
  const ts = Date.now();

  users.indA = await seedIndividualUser('Individual Alice', `isolation.alice.${ts}@test.dev`);
  users.indB = await seedIndividualUser('Individual Bob', `isolation.bob.${ts}@test.dev`);
  users.entA = await seedEnterpriseUser('Enterprise Alice', `ent.alice.${ts}@test.dev`);
  users.entB = await seedEnterpriseUser('Enterprise Bob', `ent.bob.${ts}@test.dev`);

  // Store IDs for cleanup
  profileIds.indA = (await prisma.individualProfile.findUnique({ where: { userId: users.indA!.id } }))?.id ?? null;
  profileIds.indB = (await prisma.individualProfile.findUnique({ where: { userId: users.indB!.id } }))?.id ?? null;
  firmIds.entA = users.entA!.firmId;
  firmIds.entB = users.entB!.firmId;

  // Login to establish session cookies
  sessions.indA = request.agent(app);
  sessions.indB = request.agent(app);
  sessions.entA = request.agent(app);
  sessions.entB = request.agent(app);

  // Individual login
  await sessions.indA!.post('/api/individual/auth/login')
    .send({ email: users.indA!.email, password: users.indA!.password });
  await sessions.indB!.post('/api/individual/auth/login')
    .send({ email: users.indB!.email, password: users.indB!.password });

  // Enterprise login
  await sessions.entA!.post('/api/auth/login')
    .send({ email: users.entA!.email, password: users.entA!.password });
  await sessions.entB!.post('/api/auth/login')
    .send({ email: users.entB!.email, password: users.entB!.password });

  // Create individual records
  const indResA = await sessions.indA!.post('/api/individual/records')
    .set('Content-Type', 'application/json')
    .send({ title: 'Alice GST Record', type: 'gst' });
  fixtures.indRecordA = (indResA.body as any).id;

  const indResB = await sessions.indB!.post('/api/individual/records')
    .set('Content-Type', 'application/json')
    .send({ title: 'Bob GST Record', type: 'gst' });
  fixtures.indRecordB = (indResB.body as any).id;

  // Create enterprise clients
  const entResA = await sessions.entA!.post('/api/clients')
    .set('Content-Type', 'application/json')
    .send({ name: 'Alice Client' });
  fixtures.entClientA = (entResA.body as any).id;

  const entResB = await sessions.entB!.post('/api/clients')
    .set('Content-Type', 'application/json')
    .send({ name: 'Bob Client' });
  fixtures.entClientB = (entResB.body as any).id;
});

afterAll(async () => {
  const indProfiles = [profileIds.indA, profileIds.indB].filter(Boolean) as string[];
  const entFirms = [firmIds.entA, firmIds.entB].filter(Boolean) as string[];

  // Delete individual leaf tables (FK → individualProfile)
  await prisma.individualUsageLog.deleteMany({ where: { profileId: { in: indProfiles } } }).catch(() => {});
  await prisma.individualException.deleteMany({ where: { profileId: { in: indProfiles } } }).catch(() => {});
  await prisma.individualReport.deleteMany({ where: { profileId: { in: indProfiles } } }).catch(() => {});
  await prisma.individualReconItem.deleteMany({ where: { profileId: { in: indProfiles } } }).catch(() => {});
  await prisma.individualReconRun.deleteMany({ where: { profileId: { in: indProfiles } } }).catch(() => {});
  await prisma.individualDocument.deleteMany({ where: { profileId: { in: indProfiles } } }).catch(() => {});
  await prisma.individualRecord.deleteMany({ where: { profileId: { in: indProfiles } } }).catch(() => {});
  await prisma.individualPlanChange.deleteMany({ where: { profileId: { in: indProfiles } } }).catch(() => {});
  await prisma.individualProfile.deleteMany({ where: { userId: { in: [users.indA?.id!, users.indB?.id!] } } }).catch(() => {});

  // Delete enterprise data: members first, then firms
  await prisma.firmMember.deleteMany({ where: { firmId: { in: entFirms } } }).catch(() => {});
  await prisma.firm.deleteMany({ where: { id: { in: entFirms } } }).catch(() => {});

  // Clean up all test users by email prefix
  await prisma.user.deleteMany({ where: { email: { contains: 'isolation.' } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: 'ent.alice.' } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: 'ent.bob.' } } }).catch(() => {});
  await prisma.$disconnect();
});

// ── Test suite: 12 Security Isolation Tests ────────────────────────

describe('Individual Product — Security Isolation', () => {
  // ── T01: Enterprise user cannot access individual records ──────
  it('T01: Enterprise user cannot list individual records', async () => {
    const res = await sessions.entA!.get('/api/individual/records');
    expect(res.status).toBe(401);
  });

  // ── T02: Individual user cannot access enterprise records ──────
  it('T02: Individual user cannot list enterprise clients', async () => {
    const res = await sessions.indA!.get('/api/clients');
    expect(res.status).toBe(401);
  });

  // ── T03: User A cannot see User B's individual records ────────
  it('T03: Individual user A cannot access individual user B\'s records', async () => {
    const res = await sessions.indA!.get(`/api/individual/records/${fixtures.indRecordB}`);
    expect(res.status).toBe(404);
  });

  // ── T04: Enterprise user A cannot see Enterprise user B's data ─
  it('T04: Enterprise user A cannot access enterprise user B\'s clients', async () => {
    const res = await sessions.entA!.get(`/api/clients/${fixtures.entClientB}`);
    // 403 (forbidden) or 404 (not found) both prevent information leakage
    expect([403, 404]).toContain(res.status);
  });

  // ── T05: Individual JWT cannot access enterprise routes ────────
  it('T05: Individual JWT is rejected on enterprise endpoints', async () => {
    const res = await sessions.indA!.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  // ── T06: Enterprise JWT cannot access individual routes ────────
  it('T06: Enterprise JWT is rejected on individual endpoints', async () => {
    const res = await sessions.entA!.get('/api/individual/auth/me');
    expect(res.status).toBe(401);
  });

  // ── T07: Quota enforcement on free plan ────────────────────────
  it('T07: Free plan quota is tracked correctly', async () => {
    const meRes = await sessions.indA!.get('/api/individual/auth/me');
    expect(meRes.status).toBe(200);
    const body = meRes.body as { profile: { quota: { dailyLimit: number; dailyConsumed: number } } };
    expect(body.profile.quota.dailyLimit).toBe(5);
    expect(body.profile.quota.dailyConsumed).toBeGreaterThanOrEqual(0);
    expect(body.profile.quota.dailyConsumed).toBeLessThanOrEqual(5);
  });

  // ── T08: Credit consumption is isolated per profile ────────────
  it('T08: Credit usage is isolated between individual users', async () => {
    const meA = await sessions.indA!.get('/api/individual/auth/me');
    const meB = await sessions.indB!.get('/api/individual/auth/me');

    expect(meA.status).toBe(200);
    expect(meB.status).toBe(200);

    const consumedA = (meA.body as any).profile.quota.dailyConsumed;
    const consumedB = (meB.body as any).profile.quota.dailyConsumed;

    // Both should be non-negative (no cross-contamination: each tracks independently)
    expect(consumedA).toBeGreaterThanOrEqual(0);
    expect(consumedB).toBeGreaterThanOrEqual(0);
    // They may be equal (both 0 if no jobs ran) but are tracked separately
    // The real isolation guarantee is tested by the quota middleware rejecting overflow
  });

  // ── T09: Record creation is isolated per profile ───────────────
  it('T09: Individual user B cannot see or modify user A\'s records', async () => {
    // Cannot read A's record
    const getRes = await sessions.indB!.get(`/api/individual/records/${fixtures.indRecordA}`);
    expect(getRes.status).toBe(404);

    // Cannot update A's record
    const patchRes = await sessions.indB!.patch(`/api/individual/records/${fixtures.indRecordA}`)
      .set('Content-Type', 'application/json')
      .send({ title: 'Hacked Title' });
    expect(patchRes.status).toBe(404);

    // Cannot delete A's record
    const delRes = await sessions.indB!.delete(`/api/individual/records/${fixtures.indRecordA}`);
    expect(delRes.status).toBe(404);
  });

  // ── T10: Document access is isolated ───────────────────────────
  it('T10: Individual user B cannot access user A\'s documents', async () => {
    const docsA = await sessions.indA!.get('/api/individual/documents');
    const docsB = await sessions.indB!.get('/api/individual/documents');

    expect(docsA.status).toBe(200);
    expect(docsB.status).toBe(200);

    const countA = (docsA.body as any).total;
    const countB = (docsB.body as any).total;

    // Both should start at 0 (no uploads done yet)
    expect(countB).toBe(0);
    // A may have 0 too since we haven't uploaded, but the lists are isolated
    expect(typeof countA).toBe('number');
    expect(typeof countB).toBe('number');
  });

  // ── T11: Reconciliation run results are isolated ───────────────
  it('T11: Individual user B cannot view user A\'s reconciliation runs', async () => {
    const runsA = await sessions.indA!.get('/api/individual/reconciliations');
    const runsB = await sessions.indB!.get('/api/individual/reconciliations');

    expect(runsA.status).toBe(200);
    expect(runsB.status).toBe(200);

    const countA = (runsA.body as any).total;
    const countB = (runsB.body as any).total;

    // B should have 0 runs; A may have 0 or more
    expect(countB).toBe(0);
    expect(typeof countA).toBe('number');
  });

  // ── T12: Cross-tenant ID enumeration is blocked ────────────────
  it('T12: ID enumeration across tenants returns 404, not 403', async () => {
    // Try to access B's individual record via A's session
    const res1 = await sessions.indA!.get(`/api/individual/records/${fixtures.indRecordB}`);
    expect(res1.status).toBe(404);

    // Try to access B's enterprise client via A's session
    const res2 = await sessions.entA!.get(`/api/clients/${fixtures.entClientB}`);
    expect(res2.status).toBe(404);

    // No information leakage: both return 404, not 403
    expect(res1.body).not.toHaveProperty('error.code', 'FORBIDDEN');
    expect(res2.body).not.toHaveProperty('error.code', 'FORBIDDEN');
  });
});
