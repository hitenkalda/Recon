import pino from 'pino';
export const logger = pino({
    level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            '*.password',
            '*.passwordHash',
            '*.token',
        ],
        censor: '[redacted]',
    },
});
//# sourceMappingURL=logger.js.map