import { Client } from 'minio';
import { config } from '../config.js';
import { logger } from '../logger.js';
import crypto from 'crypto';
/**
 * MinIO object storage (swap endpoint/bucket for real S3 later — the
 * abstraction is the only consumer). Private bucket + presigned URLs only.
 */
const _host = config.storage.endpoint.split(':')[0];
const _port = Number(config.storage.endpoint.split(':')[1] ?? (config.storage.useSSL ? 443 : 9000));
const minio = new Client({
    endPoint: _host,
    port: _port,
    useSSL: config.storage.useSSL,
    accessKey: config.storage.accessKey,
    secretKey: config.storage.secretKey,
});
let bucketReady = null;
async function ensureBucket() {
    if (!bucketReady) {
        bucketReady = (async () => {
            const exists = await minio.bucketExists(config.storage.bucket);
            if (!exists)
                await minio.makeBucket(config.storage.bucket, config.storage.region);
            logger.info({ bucket: config.storage.bucket }, 'minio bucket ready');
            return true;
        })().catch(async (e) => {
            bucketReady = null;
            throw e;
        });
    }
    await bucketReady;
}
export function objectKey(firmId, engagementId, fileName) {
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const stamp = Date.now();
    return `${firmId}/${engagementId}/${stamp}_${safe}`;
}
export async function presignedPutUrl(key, expirySeconds = 3600) {
    await ensureBucket();
    return minio.presignedPutObject(config.storage.bucket, key, expirySeconds);
}
export async function presignedGetUrl(key, expirySeconds = 3600) {
    await ensureBucket();
    return minio.presignedGetObject(config.storage.bucket, key, expirySeconds);
}
export async function statObject(key) {
    await ensureBucket();
    const s = await minio.statObject(config.storage.bucket, key);
    return {
        size: s.size,
        etag: s.etag,
        lastModified: s.lastModified,
    };
}
export async function removeObject(key) {
    try {
        await minio.removeObject(config.storage.bucket, key);
    }
    catch (e) {
        logger.warn({ key, err: e.message }, 'failed to remove object');
    }
}
/** Stream an object's bytes into a callback (used by hash/virus-scan). */
export async function streamObject(key, onData) {
    await ensureBucket();
    const stream = await minio.getObject(config.storage.bucket, key);
    let total = 0;
    for await (const chunk of stream) {
        total += chunk.length;
        onData(chunk);
    }
    return total;
}
/** Compute SHA-256 of an object (duplicate detection). */
export async function sha256OfObject(key) {
    const hash = crypto.createHash('sha256');
    const size = await streamObject(key, (c) => hash.update(c));
    return { hash: hash.digest('hex'), size };
}
export { minio };
//# sourceMappingURL=storage.js.map