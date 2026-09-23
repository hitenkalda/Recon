import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
export declare const QUEUE_NAMES: {
    readonly documents: "reconai-documents";
    readonly reconciliations: "reconai-reconciliations";
    readonly exports: "reconai-exports";
};
/** Shared connection used by both queues and workers. */
export declare const connection: Redis;
export declare const documentQueue: Queue<any, any, string, any, any, string>;
export declare const reconciliationQueue: Queue<any, any, string, any, any, string>;
export declare const exportQueue: Queue<any, any, string, any, any, string>;
export interface DocumentJob {
    documentId: string;
    firmId: string;
}
export interface ReconJob {
    runId: string;
    firmId: string;
}
export declare const enqueueDocumentJob: (job: DocumentJob) => Promise<import("bullmq").Job<any, any, string>>;
export declare const enqueueReconJob: (job: ReconJob) => Promise<import("bullmq").Job<any, any, string>>;
export interface WorkerHandlers {
    processDocument: (job: DocumentJob) => Promise<void>;
    runReconciliation: (job: ReconJob) => Promise<void>;
}
export type WorkerKind = 'documents' | 'reconciliations';
export declare function buildWorker(kind: WorkerKind, handlers: WorkerHandlers): Worker;
//# sourceMappingURL=queues.d.ts.map