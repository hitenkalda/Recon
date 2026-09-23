import 'dotenv/config';
import { logger } from '../logger.js';
import { buildWorker } from '../queues.js';
import { processDocument } from './processors/documents.js';
import { runReconciliation } from './processors/reconciliations.js';
const handlers = {
    processDocument,
    runReconciliation,
};
// Both workers consume from the shared Redis connection.
const documentWorker = buildWorker('documents', handlers);
const reconWorker = buildWorker('reconciliations', handlers);
documentWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'document worker: job completed'));
documentWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'document worker: job failed'));
reconWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'recon worker: job completed'));
reconWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'recon worker: job failed'));
reconWorker.on('error', (err) => logger.error({ err: err.message }, 'recon worker error'));
logger.info('ReconAI worker started (documents + reconciliations)');
process.on('SIGTERM', () => {
    logger.info('shutting down worker');
    documentWorker.close().then(() => reconWorker.close()).then(() => process.exit(0));
});
//# sourceMappingURL=index.js.map