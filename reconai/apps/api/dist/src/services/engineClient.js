import { config } from '../config.js';
import { logger } from '../logger.js';
class EngineError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = 'EngineError';
    }
}
async function post(path, body, timeoutMs = 120_000) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
        const res = await fetch(`${config.pythonServiceUrl}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: ac.signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new EngineError(`engine ${path} → ${res.status} ${text.slice(0, 200)}`, res.status);
        }
        return (await res.json());
    }
    catch (e) {
        if (e instanceof EngineError)
            throw e;
        const msg = e instanceof Error ? e.message : 'engine unreachable';
        logger.error({ path, msg }, 'engine request failed');
        throw new EngineError(`Engine call to ${path} failed: ${msg}`);
    }
    finally {
        clearTimeout(timer);
    }
}
/** Optional liveness probe. */
export async function engineHealthy() {
    try {
        const res = await fetch(`${config.pythonServiceUrl}/health`, { signal: AbortSignal.timeout(2000) });
        return res.ok;
    }
    catch {
        return false;
    }
}
export const engine = {
    process: (req) => post('/v1/process', req, 300_000),
    reconcile: (req) => post('/v1/reconcile', req, 180_000),
};
//# sourceMappingURL=engineClient.js.map