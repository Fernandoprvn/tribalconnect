import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(16).default('development-only-change-this-secret'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  AADHAAR_HASH_SALT: z.string().min(8).default('development-aadhaar-salt'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5_242_880),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(15 * 60_000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(10).default(500),
  NOTIFICATION_WEBHOOK_URL: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().url().optional(),
  ),
});

export const env = environmentSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://tribalconnect:tribalconnect@localhost:5432/tribalconnect?schema=public',
  CORS_ORIGIN: process.env.CORS_ORIGIN,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  REFRESH_TOKEN_TTL_DAYS: process.env.REFRESH_TOKEN_TTL_DAYS,
  AADHAAR_HASH_SALT: process.env.AADHAAR_HASH_SALT,
  UPLOAD_DIR: process.env.UPLOAD_DIR,
  MAX_UPLOAD_BYTES: process.env.MAX_UPLOAD_BYTES,
  API_RATE_LIMIT_WINDOW_MS: process.env.API_RATE_LIMIT_WINDOW_MS,
  API_RATE_LIMIT_MAX: process.env.API_RATE_LIMIT_MAX,
  NOTIFICATION_WEBHOOK_URL: process.env.NOTIFICATION_WEBHOOK_URL,
});

if (env.NODE_ENV === 'production' && env.JWT_SECRET === 'development-only-change-this-secret') {
  throw new Error('JWT_SECRET must be explicitly configured in production.');
}
if (env.NODE_ENV === 'production' && env.AADHAAR_HASH_SALT === 'development-aadhaar-salt') {
  throw new Error('AADHAAR_HASH_SALT must be explicitly configured in production.');
}
