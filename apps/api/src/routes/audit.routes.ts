import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/async-handler';
import { getPagination, pageMeta } from '../utils/pagination';

export const auditRouter = Router();

auditRouter.use(requireAuth);

const listAuditLogs = asyncHandler(async (request, response) => {
  const { page, limit, skip } = getPagination(request);
  const requestedActor = typeof request.query.actorId === 'string' ? z.string().uuid().parse(request.query.actorId) : undefined;
  const entityType = typeof request.query.entityType === 'string' ? request.query.entityType.slice(0, 120) : undefined;
  const actorId = request.auth!.role === Role.SUPER_ADMIN ? requestedActor : request.auth!.userId;
  const where = { ...(actorId ? { actorId } : {}), ...(entityType ? { entityType } : {}) };
  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({ where, include: { actor: { select: { id: true, fullName: true, role: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.auditLog.count({ where }),
  ]);
  response.json({ data: logs, meta: pageMeta(page, limit, total) });
});

auditRouter.get('/', listAuditLogs);
auditRouter.get('/activity-logs', listAuditLogs);
