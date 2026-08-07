import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { errorHandler, notFound } from './middleware/error-handler';
import { createRateLimit, loginRateLimit } from './middleware/rate-limit';
import { adminRouter } from './routes/admin.routes';
import { auditRouter } from './routes/audit.routes';
import { announcementsRouter } from './routes/announcements.routes';
import { applicationsRouter } from './routes/applications.routes';
import { authRouter } from './routes/auth.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { familiesRouter } from './routes/families.routes';
import { geographyRouter } from './routes/geography.routes';
import { notificationsRouter } from './routes/notifications.routes';
import { portalRouter } from './routes/portal.routes';
import { reportsRouter } from './routes/reports.routes';
import { schemesRouter } from './routes/schemes.routes';
import { searchRouter } from './routes/search.routes';
import { settingsRouter } from './routes/settings.routes';
import { villagesRouter } from './routes/villages.routes';
import { volunteerRouter } from './routes/volunteer.routes';

const allowedOrigins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

export const openApiDocument = {
  openapi: '3.0.3',
  info: { title: 'TribalConnect API', version: '1.0.0', description: 'JWT-protected welfare portal API.' },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
  },
  paths: {
    '/auth/login': { post: { summary: 'Sign in with username/email and password' } },
    '/auth/refresh': { post: { summary: 'Rotate refresh token' } },
    '/families': { get: { summary: 'List scoped families' }, post: { summary: 'Create a family draft' } },
    '/schemes': { get: { summary: 'List schemes' }, post: { summary: 'Create scheme (super admin)' } },
    '/applications': { get: { summary: 'List scoped applications' }, post: { summary: 'Create application' } },
    '/villages': { get: { summary: 'List villages' }, post: { summary: 'Create village' } },
    '/dashboard': { get: { summary: 'Get filtered KPIs and charts' } },
    '/reports': { get: { summary: 'Get report JSON or download CSV/XLSX/PDF' } },
    '/notifications': { get: { summary: 'List notification history' }, post: { summary: 'Send notification' } },
    '/search': { get: { summary: 'Search families, schemes, villages, and applications' } },
  },
};

export const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);
  app.use((request, response, next) => {
    const requestId = request.header('x-request-id')?.slice(0, 120) || randomUUID();
    response.setHeader('x-request-id', requestId);
    next();
  });
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)), credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    maxAge: 86_400,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  app.get('/health', async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch {
      response.status(503).json({ status: 'degraded', database: 'unavailable', timestamp: new Date().toISOString() });
    }
  });
  app.get('/api/health', async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.json({ data: { status: 'ok', database: 'connected', timestamp: new Date().toISOString() } });
    } catch {
      response.status(503).json({ data: { status: 'degraded', database: 'unavailable', timestamp: new Date().toISOString() } });
    }
  });

  app.get('/api/openapi.json', (_request, response) => response.json(openApiDocument));
  app.use('/api', createRateLimit({ windowMs: env.API_RATE_LIMIT_WINDOW_MS, max: env.API_RATE_LIMIT_MAX }));
  app.use('/api/auth/login', loginRateLimit);
  app.use('/api/auth', authRouter);
  app.use('/api/geography', geographyRouter);
  app.use('/api/families', familiesRouter);
  app.use('/api/schemes', schemesRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/villages', villagesRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/announcements', announcementsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/volunteer', volunteerRouter);
  app.use('/api/portal', portalRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/audit-logs', auditRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
};

export const app = createApp();
