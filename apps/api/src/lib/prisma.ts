import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var tribalConnectPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.tribalConnectPrisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalThis.tribalConnectPrisma = prisma;
