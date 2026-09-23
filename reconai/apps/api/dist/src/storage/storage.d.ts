import { Client } from 'minio';
declare const minio: Client;
export declare function objectKey(firmId: string, engagementId: string, fileName: string): string;
export declare function presignedPutUrl(key: string, expirySeconds?: number): Promise<string>;
export declare function presignedGetUrl(key: string, expirySeconds?: number): Promise<string>;
export interface StoredObjectMeta {
    size: number;
    etag?: string;
    lastModified?: Date;
}
export declare function statObject(key: string): Promise<StoredObjectMeta>;
export declare function removeObject(key: string): Promise<void>;
/** Stream an object's bytes into a callback (used by hash/virus-scan). */
export declare function streamObject(key: string, onData: (chunk: Buffer) => void): Promise<number>;
/** Compute SHA-256 of an object (duplicate detection). */
export declare function sha256OfObject(key: string): Promise<{
    hash: string;
    size: number;
}>;
export { minio };
//# sourceMappingURL=storage.d.ts.map