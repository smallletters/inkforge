import 'dotenv/config';

export const config = {
  app: {
    name: process.env.APP_NAME ?? 'InkForge',
    host: process.env.APP_HOST ?? '0.0.0.0',
    port: Number(process.env.APP_PORT ?? 3001),
  },
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://inkforge:inkforge@localhost:5432/inkforge',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  auth: {
    jwt_secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    jwt_expire_hours: Number(process.env.JWT_EXPIRE_HOURS ?? 24),
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY ?? '00000000000000000000000000000000',
  },
  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  },
  node_env: process.env.NODE_ENV ?? 'development',
};
