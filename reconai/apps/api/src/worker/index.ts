import 'dotenv/config';
import { logger } from '../logger.js';
import { buildWorker, type WorkerHandlers } from '../queues.js';
import { processDocument } from './processors/documents.js';
import { runReconciliation } from './processors/reconciliations.js';
import { analyzeVariance } from './processors/variance.js';
import { analyzeTds } from './processors/tds.js';

const handlers: WorkerHandlers = {
  processDocument,
  runReconciliation,
  analyzeVariance,
  analyzeTds,
};

// All four workers consume from the shared Redis connection.
const documentWorker = buildWorker('documents', handlers);
const reconWorker = buildWorker('reconciliations', handlers);
const varianceWorker = buildWorker('variance', handlers);
const tdsWorker = buildWorker('tds', handlers);

documentWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'document worker: job completed'));
documentWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'document worker: job failed'));
reconWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'recon worker: job completed'));
reconWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'recon worker: job failed'));
reconWorker.on('error', (err) => logger.error({ err: err.message }, 'recon worker error'));
varianceWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'variance worker: job completed'));
varianceWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'variance worker: job failed'));
varianceWorker.on('error', (err) => logger.error({ err: err.message }, 'variance worker error'));
tdsWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'TDS worker: job completed'));
tdsWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'TDS worker: job failed'));
tdsWorker.on('error', (err) => logger.error({ err: err.message }, 'TDS worker error'));

logger.info('ReconAI worker started (documents + reconciliations + variance + tds)');

process.on('SIGTERM', () => {
  logger.info('shutting down worker');
  documentWorker.close().then(() => reconWorker.close()).then(() => varianceWorker.close()).then(() => tdsWorker.close()).then(() => process.exit(0));
});