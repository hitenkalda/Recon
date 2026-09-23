import { z } from 'zod';
/** Primary key. Prisma CUIDs. */
export const id = z.string().min(1).max(64);
export const idArray = z.array(id).default([]);
/** Timestamps from the API. */
export const isoDate = z.string().datetime({ offset: true });
export const isoDateOptional = isoDate.optional();
/** Money in **paise** (integer). Never accept floats for authoritative amounts. */
export const paise = z.number().int().finite();
export const paiseOptional = paise.optional();
export const positivePaise = z.number().int().finite().min(0);
export const positivePaiseOptional = positivePaise.optional();
export const pagination = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export const orderBy = z.string().min(1).max(64).default('createdAt');
export const monthsRange = z.object({
    from: z.string().regex(/^\d{4}-\d{2}$/, 'expected YYYY-MM'),
    to: z.string().regex(/^\d{4}-\d{2}$/, 'expected YYYY-MM'),
});
export const financialYear = z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
//# sourceMappingURL=common.js.map