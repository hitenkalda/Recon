/** Typed fetch client for the ReconAI API (cookie-auth, same-origin via Next rewrites). */

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    throw new ApiError(res.status, err?.code ?? 'REQUEST_FAILED', err?.message ?? res.statusText, err?.details);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string, init?: RequestInit) => request<T>(path, { ...init, method: 'GET' }),
  post: <T>(path: string, data?: unknown, init?: RequestInit) =>
    request<T>(path, {
      ...init,
      method: 'POST',
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** GET /api/auth/me shape */
export interface MeUser {
  id: string;
  email: string;
  name: string;
  role: string;
  firmId: string;
}
export interface MeFirm {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  tan: string | null;
}
export interface MeResponse {
  user: MeUser;
  firm: MeFirm | null;
}