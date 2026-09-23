import 'dotenv/config';
export declare const config: {
    readonly nodeEnv: string;
    readonly isProd: boolean;
    readonly apiPort: number;
    readonly webUrl: string;
    readonly databaseUrl: string;
    readonly redisUrl: string;
    readonly jwtSecret: string;
    readonly jwtExpiresIn: string;
    readonly cookieDomain: string;
    readonly cookieSecure: boolean;
    readonly storage: {
        readonly endpoint: string;
        readonly accessKey: string;
        readonly secretKey: string;
        readonly bucket: string;
        readonly useSSL: boolean;
        readonly region: string;
    };
    readonly pythonServiceUrl: string;
    readonly ai: {
        readonly geminiApiKey: string | undefined;
        readonly geminiModel: string;
        readonly groqApiKey: string | undefined;
        readonly groqModel: string;
    };
    readonly rateLimit: {
        readonly windowMs: number;
        readonly max: number;
    };
    readonly fileLimits: {
        readonly maxSizeMb: number;
        readonly maxFilesPerUpload: number;
    };
};
//# sourceMappingURL=config.d.ts.map