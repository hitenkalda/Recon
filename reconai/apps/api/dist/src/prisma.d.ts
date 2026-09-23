import { PrismaClient } from '@prisma/client';
/**
 * Prisma singleton. BigInt (paise) columns are serialized to strings so the
 * JSON API never loses precision — the shared contract treats paise as
 * integers (or strings for values beyond Number.MAX_SAFE_INTEGER).
 */
declare const prisma: PrismaClient<{
    log: ("error" | "warn")[];
}, "error" | "warn", import("@prisma/client/runtime/library").DefaultArgs>;
export declare const bigintToJson: (value: unknown) => unknown;
export default prisma;
//# sourceMappingURL=prisma.d.ts.map