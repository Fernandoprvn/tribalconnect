import { app } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { cleanupExpiredSessions } from './services/session.service';

const server = app.listen(env.PORT, () => {
  console.info(`TribalConnect API listening on http://localhost:${env.PORT}/api`);
});

const shutdown = (signal: string) => {
  console.info(`Received ${signal}; shutting down TribalConnect API.`);
  server.close((error) => {
    void prisma.$disconnect().finally(() => {
      if (error) {
        console.error('API shutdown failed', error);
        process.exitCode = 1;
      }
    });
  });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
void cleanupExpiredSessions().catch((error) => console.warn('Unable to clean expired sessions', error));
