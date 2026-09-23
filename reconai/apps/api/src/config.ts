import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',

  apiPort: Number(process.env.API_PORT ?? 3001),
  webUrl: process.env.WEB_URL ?? 'http://localhost:3000',

  databaseUrl: required('DATABASE_URL'),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
  cookieDomain: process.env.COOKIE_DOMAIN ?? 'localhost',
  cookieSecure: process.env.COOKIE_SECURE === 'true',

  storage: {
    endpoint: required('STORAGE_ENDPOINT'),
    accessKey: required('STORAGE_ACCESS_KEY'),
    secretKey: required('STORAGE_SECRET_KEY'),
    bucket: required('STORAGE_BUCKET'),
    useSSL: process.env.STORAGE_USE_SSL === 'true',
    region: process.env.STORAGE_REGION ?? 'us-east-1',
  },

  pythonServiceUrl: process.env.PYTHON_SERVICE_URL ?? 'http://localhost:8000',

  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    groqApiKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL ?? 'qwen-2.5-32b',
  },

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
  },

  fileLimits: {
    maxSizeMb: Number(process.env.MAX_FILE_SIZE_MB ?? 50),
    maxFilesPerUpload: Number(process.env.MAX_FILES_PER_UPLOAD ?? 10),
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3001/api/auth/google/callback',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
  },

  individual: {
    dailyJobLimit: Number(process.env.INDIVIDUAL_DAILY_JOB_LIMIT ?? 5),
    dailyResetHours: Number(process.env.INDIVIDUAL_DAILY_RESET_HOUR ?? 0),
  },
} as const;