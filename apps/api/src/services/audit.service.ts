import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export const writeAuditLog = async (
  request: Request,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>,
) => {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: request.auth?.userId,
        action,
        entityType,
        entityId,
        metadata: metadata as Prisma.InputJsonValue | undefined,
        ipAddress: request.ip ?? 'unknown',
      },
    });
  } catch (error) {
    // Audit outages must not turn a completed welfare workflow into a failed request.
    console.error('Unable to write audit log', error);
  }
};
