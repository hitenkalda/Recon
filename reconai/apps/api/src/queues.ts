import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config.js';

export const QUEUE_NAMES = {
  documents: 'reconai-documents',
  reconciliations: 'reconai-reconciliations',
  exports: 'reconai-exports',
  variance: 'reconai-variance',
  tds: 'reconai-tds',
} as const;

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

export const varianceQueue = new Queue(QUEUE_NAMES.variance, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 300,
    removeOnFail: 500,
  },
});

export const tdsQueue = new Queue(QUEUE_NAMES.tds, {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 300,
    removeOnFail: 500,
  },
});

export interface DocumentJob {
  documentId: string;
  firmId: string;
  profileId?: string;
}

export interface ReconJob {
  runId: string;
  firmId: string;
  profileId?: string;
}

export interface VarianceJob {
  runId: string;
  firmId: string;
}

export interface TdsJob {
  runId: string;
  firmId: string;
}

export const enqueueDocumentJob = (job: DocumentJob) => documentQueue.add('process', job);
export const enqueueReconJob = (job: ReconJob) =>
  reconciliationQueue.add('reconcile', job, { jobId: `run-${job.runId}` });
export const enqueueVarianceJob = (job: VarianceJob) =>
  varianceQueue.add('analyze', job, { jobId: `variance-${job.runId}` });
export const enqueueTdsJob = (job: TdsJob) =>
  tdsQueue.add('analyze', job, { jobId: `tds-${job.runId}` });

export interface WorkerHandlers {
  processDocument: (job: DocumentJob) => Promise<void>;
  runReconciliation: (job: ReconJob) => Promise<void>;
  analyzeVariance: (job: VarianceJob) => Promise<void>;
  analyzeTds: (job: TdsJob) => Promise<void>;
}

export type WorkerKind = 'documents' | 'reconciliations' | 'variance' | 'tds';

export function buildWorker(kind: WorkerKind, handlers: WorkerHandlers): Worker {
  if (kind === 'documents') {
    return new Worker(
      QUEUE_NAMES.documents,
      async (job) => {
        if (job.name === 'process') await handlers.processDocument(job.data);
      },
      { connection, concurrency: 2 },
    );
  }
  if (kind === 'variance') {
    return new Worker(
      QUEUE_NAMES.variance,
      async (job) => {
        if (job.name === 'analyze') await handlers.analyzeVariance(job.data);
      },
      { connection, concurrency: 2 },
    );
  }
  if (kind === 'tds') {
    return new Worker(
      QUEUE_NAMES.tds,
      async (job) => {
        if (job.name === 'analyze') await handlers.analyzeTds(job.data);
      },
      { connection, concurrency: 2 },
    );
  }
  return new Worker(
    QUEUE_NAMES.reconciliations,
    async (job) => {
      if (job.name === 'reconcile') await handlers.runReconciliation(job.data);
    },
    { connection, concurrency: 2 },
  );
}