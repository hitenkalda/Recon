import { NextFunction, Request, Response } from 'express';
import type { ZodError } from 'zod';

/**
 * Unified error contract. Every error response is:
 *   { error: { code, message, details? } }
 */

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const BadRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const Unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const Forbidden = (message = 'You do not have permission for this action') =>
  new AppError(403, 'FORBIDDEN', message);
export const NotFound = (message = 'Resource not found') =>
  new AppError(404, 'NOT_FOUND', message);
export const Conflict = (message: string) => new AppError(409, 'CONFLICT', message);
export const TooMany = (message = 'Too many requests') =>
  new AppError(429, 'RATE_LIMITED', message);

/** Wrap async route handlers so thrown errors reach the error middleware. */
export const asyncHandler =
  <R extends Request = Request>(
    fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>,
  ) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req as R, res, next).catch(next);
  };

/** Shape Zod validation errors into { field: message[] }. */
export function formatZodError(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.');
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err && typeof err === 'object' && 'issues' in err) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: formatZodError(err as ZodError) } });
    return;
  }
  // Prisma known errors
  const anyErr = err as { code?: string; meta?: { target?: string[] } };
  if (anyErr?.code === 'P2002') {
    res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with the same value already exists', details: { fields: anyErr.meta?.target } } });
    return;
  }
  if (anyErr?.code === 'P2025') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  console.error('[unhandled]', message, err);
}

/** Zod schema + request body parser used by routes. */
export function parseBody<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: ZodError } }, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw BadRequest('Invalid input', parsed.error ? formatZodError(parsed.error) : undefined);
  return parsed.data as T;
}