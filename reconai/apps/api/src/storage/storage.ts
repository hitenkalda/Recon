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

let bucketReady: Promise<boolean> | null = null;

async function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const exists = await minio.bucketExists(config.storage.bucket);
      if (!exists) await minio.makeBucket(config.storage.bucket, config.storage.region);
      logger.info({ bucket: config.storage.bucket }, 'minio bucket ready');
      return true;
    })().catch(async (e) => {
      bucketReady = null;
      throw e;
    });
  }
  await bucketReady;
}

export function objectKey(firmId: string, engagementId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamp = Date.now();
  return `${firmId}/${engagementId}/${stamp}_${safe}`;
}

export async function presignedPutUrl(key: string, expirySeconds = 3600): Promise<string> {
  await ensureBucket();
  return minio.presignedPutObject(config.storage.bucket, key, expirySeconds);
}

export async function presignedGetUrl(key: string, expirySeconds = 3600): Promise<string> {
  await ensureBucket();
  return minio.presignedGetObject(config.storage.bucket, key, expirySeconds);
}

/** Server-side write of a byte buffer (engine-generated exports etc.). */
export async function putBytes(
  key: string,
  buffer: Buffer,
  contentType = 'application/octet-stream',
  meta?: Record<string, string>,
): Promise<void> {
  await ensureBucket();
  await minio.putObject(config.storage.bucket, key, buffer, buffer.length, { 'Content-Type': contentType, ...meta });
}

export interface StoredObjectMeta {
  size: number;
  etag?: string;
  lastModified?: Date;
}

export async function statObject(key: string): Promise<StoredObjectMeta> {
  await ensureBucket();
  const s = await minio.statObject(config.storage.bucket, key);
  return {
    size: s.size,
    etag: s.etag,
    lastModified: s.lastModified,
  };
}

export async function removeObject(key: string): Promise<void> {
  try {
    await minio.removeObject(config.storage.bucket, key);
  } catch (e) {
    logger.warn({ key, err: (e as Error).message }, 'failed to remove object');
  }
}

/** Stream an object's bytes into a callback (used by hash/virus-scan). */
export async function streamObject(key: string, onData: (chunk: Buffer) => void): Promise<number> {
  await ensureBucket();
  const stream = await minio.getObject(config.storage.bucket, key);
  let total = 0;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    total += chunk.length;
    onData(chunk);
  }
  return total;
}

/** Compute SHA-256 of an object (duplicate detection). */
export async function sha256OfObject(key: string): Promise<{ hash: string; size: number }> {
  const hash = crypto.createHash('sha256');
  const size = await streamObject(key, (c) => hash.update(c));
  return { hash: hash.digest('hex'), size };
}

export { minio };