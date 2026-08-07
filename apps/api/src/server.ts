import { app } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { cleanupExpiredSessions } from './services/session.service';

const server = app.listen(env.PORT, () => {
  console.info(`TribalConnect API listening on http://localhost:${env.PORT}/api`);
});

// A second `npm run dev:api` used to terminate with an unhandled EventEmitter
// error. Keep the existing server intact and explain how to resolve the clash.
server.once('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`TribalConnect API could not start: port ${env.PORT} is already in use. Stop the existing API process or set PORT to a free port before starting another instance.`);
  } else {
    console.error('TribalConnect API could not start.', error);
  }
  void prisma.$disconnect().finally(() => { process.exitCode = 1; });
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
