import { z } from 'zod';
/** Primary key. Prisma CUIDs. */
export declare const id: z.ZodString;
export declare const idArray: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
/** Timestamps from the API. */
export declare const isoDate: z.ZodString;
export declare const isoDateOptional: z.ZodOptional<z.ZodString>;
/** Money in **paise** (integer). Never accept floats for authoritative amounts. */
export declare const paise: z.ZodNumber;
export declare const paiseOptional: z.ZodOptional<z.ZodNumber>;
export declare const positivePaise: z.ZodNumber;
export declare const positivePaiseOptional: z.ZodOptional<z.ZodNumber>;
export declare const pagination: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
export declare const orderBy: z.ZodDefault<z.ZodString>;
export interface Page<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
export declare const monthsRange: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
}, "strip", z.ZodTypeAny, {
    from: string;
    to: string;
}, {
    from: string;
    to: string;
}>;
export declare const financialYear: z.ZodObject<{
    start: z.ZodString;
    end: z.ZodString;
}, "strip", z.ZodTypeAny, {
    start: string;
    end: string;
}, {
    start: string;
    end: string;
}>;
//# sourceMappingURL=common.d.ts.map