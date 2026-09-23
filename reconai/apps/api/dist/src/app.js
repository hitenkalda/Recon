import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { nanoid } from 'nanoid';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler } from './lib/http.js';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import engagementRoutes from './routes/engagements.js';
import documentRoutes from './routes/documents.js';
import reconciliationRoutes from './routes/reconciliations.js';
import exceptionRoutes from './routes/exceptions.js';
import workingPaperRoutes from './routes/workingPapers.js';
import reportRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';
import miscRoutes from './routes/misc.js';
export function createApp() {
    const app = express();
    app.disable('x-powered-by');
    app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
    // Request-id + structured logging with a per-request child logger.
    app.use((req, _res, next) => {
        req.id = req.headers['x-request-id'] ?? nanoid(12);
        req.log = logger.child({ requestId: req.id });
        next();
    });
    app.use(pinoHttp({
        logger,
        genReqId: (req) => req.id ?? nanoid(12),
        customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : 'info'),
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        serializers: {
            req: (r) => ({ id: r.id, method: r.method, url: r.url }),
        },
    }));
    app.use(cors({
        origin: config.webUrl,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    }));
    app.use(cookieParser());
    app.use(express.json({ limit: '2mb' }));
    // Global + stricter auth rate limiting (only trusts the real client IP).
    app.set('trust proxy', 1);
    app.use('/api/', rateLimit({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max, standardHeaders: true, legacyHeaders: false }));
    app.use('/api/auth/', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many auth attempts. Try again shortly.' } } }));
    // Routes
    app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'reconai-api', time: new Date().toISOString() }));
    app.use('/api/auth', authRoutes);
    app.use('/api/clients', clientRoutes);
    app.use('/api/engagements', engagementRoutes);
    app.use('/api/documents', documentRoutes);
    app.use('/api/reconciliations', reconciliationRoutes);
    app.use('/api/exceptions', exceptionRoutes);
    app.use('/api/working-papers', workingPaperRoutes);
    app.use('/api/reports', reportRoutes);
    app.use('/api/dashboard', dashboardRoutes);
    app.use('/api', miscRoutes); // /notifications + /audit-log + auth/can lives under auth
    // 404 + error contract
    app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));
    app.use(((err, req, res, _next) => {
        const reqLogger = req.log ?? logger;
        reqLogger.error({ err: err instanceof Error ? err.message : err }, 'request error');
        errorHandler(err, req, res, _next);
    }));
    return app;
}
//# sourceMappingURL=app.js.map