import { NextFunction, Request, Response } from 'express';
import type { ZodError } from 'zod';
/**
 * Unified error contract. Every error response is:
 *   { error: { code, message, details? } }
 */
export declare class AppError extends Error {
    status: number;
    code: string;
    details?: unknown | undefined;
    constructor(status: number, code: string, message: string, details?: unknown | undefined);
}
export declare const BadRequest: (message: string, details?: unknown) => AppError;
export declare const Unauthorized: (message?: string) => AppError;
export declare const Forbidden: (message?: string) => AppError;
export declare const NotFound: (message?: string) => AppError;
export declare const Conflict: (message: string) => AppError;
export declare const TooMany: (message?: string) => AppError;
/** Wrap async route handlers so thrown errors reach the error middleware. */
export declare const asyncHandler: <R extends Request = Request>(fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => void;
/** Shape Zod validation errors into { field: message[] }. */
export declare function formatZodError(err: ZodError): Record<string, string[]>;
export declare function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void;
/** Zod schema + request body parser used by routes. */
export declare function parseBody<T>(schema: {
    safeParse: (v: unknown) => {
        success: boolean;
        data?: T;
        error?: ZodError;
    };
}, body: unknown): T;
//# sourceMappingURL=http.d.ts.map