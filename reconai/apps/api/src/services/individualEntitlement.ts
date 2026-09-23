import prisma from '../prisma.js';
import { config } from '../config.js';
import { NotFound } from '../lib/http.js';

const PLAN_LIMITS: Record<string, number> = {
  free: 5,
  basic: 30,
  pro: 999999, // effectively unlimited for reconciliation jobs
};

/**
 * Get the daily job limit for a given plan.
 */
export function getDailyJobLimit(plan: string): number {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

/**
 * Compute the reset time for the current day's quota.
 * Uses INDIVIDUAL_DAILY_RESET_HOUR (default 0 = midnight UTC).
 */
export function getTodayResetTime(): Date {
  const now = new Date();
  const resetHour = config.individual.dailyResetHours;
  const reset = new Date(now);
  reset.setUTCHours(resetHour, 0, 0, 0);
  // If the reset time has already passed today, use today; otherwise yesterday.
  // We count usage from the last reset point to now.
  return reset;
}

/**
 * Count how many jobs the profile has consumed since the last reset.
 */
export async function countDailyConsumed(profileId: string): Promise<number> {
  const resetTime = getTodayResetTime();
  const count = await prisma.individualUsageLog.count({
    where: {
      profileId,
      createdAt: { gte: resetTime },
      status: 'consumed',
    },
  });
  return count;
}

/**
 * Check whether the profile has remaining quota for today.
 * Returns { allowed, remaining, limit, plan }.
 */
export async function checkQuota(profileId: string, plan: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  plan: string;
}> {
  const limit = getDailyJobLimit(plan);
  const consumed = await countDailyConsumed(profileId);
  const remaining = Math.max(0, limit - consumed);
  return { allowed: remaining > 0, remaining, limit, plan };
}

/**
 * Consume one credit for a job. Records a usage log entry.
 * Returns the log entry id.
 */
export async function consumeCredit(profileId: string, userId: string, runId?: string): Promise<string> {
  const log = await prisma.individualUsageLog.create({
    data: {
      profileId,
      userId,
      runId: runId ?? undefined,
      creditsUsed: 1,
      status: 'consumed',
    },
  });
  return log.id;
}

/**
 * Refund a credit (e.g. when a job fails or is cancelled).
 */
export async function refundCredit(logId: string): Promise<void> {
  await prisma.individualUsageLog.update({
    where: { id: logId },
    data: { status: 'refunded' },
  });
}

/**
 * Get the profile with its quota info in one call.
 */
export async function getProfileWithQuota(userId: string) {
  const profile = await prisma.individualProfile.findUnique({
    where: { userId },
    include: { user: true },
  });
  if (!profile) return null;

  const limit = getDailyJobLimit(profile.plan);
  const consumed = await countDailyConsumed(profile.id);
  const remaining = Math.max(0, limit - consumed);

  return {
    ...profile,
    quota: { remaining, limit, plan: profile.plan },
  };
}

/**
 * Upgrade a profile's plan. Logs the change.
 */
export async function upgradePlan(
  profileId: string,
  userId: string,
  toPlan: string,
  reason?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.individualProfile.findUnique({ where: { id: profileId } });
    if (!current) throw NotFound('Profile not found');

    await tx.individualProfile.update({
      where: { id: profileId },
      data: { plan: toPlan },
    });

    await tx.individualPlanChange.create({
      data: {
        profileId,
        fromPlan: current.plan,
        toPlan,
        reason: reason ?? 'plan_upgrade',
        createdById: userId,
      },
    });
  });
}

/**
 * Get usage stats for the dashboard.
 */
export async function getUsageStats(profileId: string) {
  const profile = await prisma.individualProfile.findUnique({ where: { id: profileId } });
  if (!profile) throw NotFound('Profile not found');

  const dailyLimit = getDailyJobLimit(profile.plan);
  const dailyConsumed = await countDailyConsumed(profileId);
  const totalRuns = await prisma.individualReconRun.count({ where: { profileId } });
  const totalDocuments = await prisma.individualDocument.count({ where: { profileId } });
  const totalReports = await prisma.individualReport.count({ where: { profileId } });

  return {
    plan: profile.plan,
    dailyLimit,
    dailyConsumed,
    dailyRemaining: Math.max(0, dailyLimit - dailyConsumed),
    totalRuns,
    totalDocuments,
    totalReports,
  };
}
