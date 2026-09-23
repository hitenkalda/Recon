import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config.js';
export const QUEUE_NAMES = {
    documents: 'reconai-documents',
    reconciliations: 'reconai-reconciliations',
    exports: 'reconai-exports',
};
/** Shared connection used by both queues and workers. */
export const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
export const documentQueue = new Queue(QUEUE_NAMES.documents, {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 500,
        removeOnFail: 1000,
    },
});
export const reconciliationQueue = new Queue(QUEUE_NAMES.reconciliations, {
    connection,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 300,
        removeOnFail: 500,
    },
});
export const exportQueue = new Queue(QUEUE_NAMES.exports, {
    connection,
    defaultJobOptions: { attempts: 2, backoff: { delay: 2000, type: 'exponential' }, removeOnComplete: 100, removeOnFail: 100 },
});
export const enqueueDocumentJob = (job) => documentQueue.add('process', job);
export const enqueueReconJob = (job) => reconciliationQueue.add('reconcile', job, { jobId: `run-${job.runId}` });
export function buildWorker(kind, handlers) {
    if (kind === 'documents') {
        return new Worker(QUEUE_NAMES.documents, async (job) => {
            if (job.name === 'process')
                await handlers.processDocument(job.data);
        }, { connection, concurrency: 2 });
    }
    return new Worker(QUEUE_NAMES.reconciliations, async (job) => {
        if (job.name === 'reconcile')
            await handlers.runReconciliation(job.data);
    }, { connection, concurrency: 2 });
}
//# sourceMappingURL=queues.js.map