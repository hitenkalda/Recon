import { PrismaClient } from '@prisma/client';

/**
 * Prisma singleton. BigInt (paise) columns are serialized to strings so the
 * JSON API never loses precision — the shared contract treats paise as
 * integers (or strings for values beyond Number.MAX_SAFE_INTEGER).
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export const bigintToJson = (value: unknown): unknown => {
  if (typeof value === 'bigint') return Number(value); // paise within safe range
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(bigintToJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        bigintToJson(v),
      ]),
    );
  }
  return value;
};

export default prisma;