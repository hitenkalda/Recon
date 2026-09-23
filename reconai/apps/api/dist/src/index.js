import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
const app = createApp();
const server = app.listen(config.apiPort, () => {
    logger.info(`ReconAI API listening on :${config.apiPort}`);
});
async function shutdown(signal) {
    logger.info({ signal }, 'shutting down API');
    server.close(async () => {
        const { default: prisma } = await import('./prisma.js');
        await prisma.$disconnect();
        process.exit(0);
    });
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
//# sourceMappingURL=index.js.map