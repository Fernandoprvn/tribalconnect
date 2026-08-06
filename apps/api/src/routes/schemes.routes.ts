import { Prisma, Role, SchemeStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { allowPermission, requireAuth } from '../middleware/auth';
import { schemeSchema, schemeUpdateSchema } from '../schemas';
import { evaluateSchemeEligibility } from '../services/eligibility.service';
import { ensureFamilyAccess } from '../services/family-access.service';
import { writeAuditLog } from '../services/audit.service';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';
import { getPagination, pageMeta } from '../utils/pagination';

export const schemesRouter = Router();

const idSchema = z.string().uuid();
const statusSchema = z.object({ status: z.nativeEnum(SchemeStatus) });
const schemeInclude = { _count: { select: { applications: true } } } as const;
const jsonCriteria = (criteria: unknown) => JSON.parse(JSON.stringify(criteria ?? {})) as Prisma.InputJsonValue;

const requestedStatuses = (input: unknown) =>
  typeof input === 'string'
    ? input.split(',').filter((status): status is SchemeStatus => Object.values(SchemeStatus).includes(status as SchemeStatus))
    : [];

schemesRouter.use(requireAuth);

schemesRouter.get('/', asyncHandler(async (request, response) => {
  const { page, limit, skip } = getPagination(request);
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
  const department = typeof request.query.department === 'string' ? request.query.department.trim() : '';
  const statuses = requestedStatuses(request.query.status);
  const where: Prisma.SchemeWhereInput = {
    ...(request.auth!.role === Role.FAMILY ? { status: SchemeStatus.ACTIVE } : statuses.length ? { status: { in: statuses } } : {}),
    ...(department ? { department: { equals: department, mode: 'insensitive' } } : {}),
    ...(search ? {
      OR: [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
      ],
    } : {}),
  };
  const [schemes, total] = await prisma.$transaction([
    prisma.scheme.findMany({ where, include: schemeInclude, orderBy: [{ status: 'asc' }, { name: 'asc' }], skip, take: limit }),
    prisma.scheme.count({ where }),
  ]);
  response.json({ data: schemes, meta: pageMeta(page, limit, total) });
}));

schemesRouter.post('/', allowPermission('schemes.manage', Role.SUPER_ADMIN), asyncHandler(async (request, response) => {
  const input = schemeSchema.parse(request.body);
  const scheme = await prisma.scheme.create({ data: { ...input, criteria: jsonCriteria(input.criteria), createdById: request.auth!.userId }, include: schemeInclude });
  await writeAuditLog(request, 'CREATE', 'Scheme', scheme.id, { code: scheme.code, status: scheme.status });
  response.status(201).json({ data: scheme });
}));

schemesRouter.get('/:id', asyncHandler(async (request, response) => {
  const scheme = await prisma.scheme.findUnique({ where: { id: idSchema.parse(request.params.id) }, include: schemeInclude });
  if (!scheme || (request.auth!.role === Role.FAMILY && scheme.status !== SchemeStatus.ACTIVE)) {
    throw new ApiError(404, 'Scheme not found.');
  }
  response.json({ data: scheme });
}));

schemesRouter.patch('/:id', allowPermission('schemes.manage', Role.SUPER_ADMIN), asyncHandler(async (request, response) => {
  const schemeId = idSchema.parse(request.params.id);
  const input = schemeUpdateSchema.parse(request.body);
  const scheme = await prisma.scheme.update({
    where: { id: schemeId },
    data: { ...input, ...(input.criteria !== undefined ? { criteria: jsonCriteria(input.criteria) } : {}) },
    include: schemeInclude,
  });
  await writeAuditLog(request, 'UPDATE', 'Scheme', schemeId, { fields: Object.keys(input) });
  response.json({ data: scheme });
}));

schemesRouter.post('/:id/activate', allowPermission('schemes.manage', Role.SUPER_ADMIN), asyncHandler(async (request, response) => {
  const schemeId = idSchema.parse(request.params.id);
  const scheme = await prisma.scheme.update({ where: { id: schemeId }, data: { status: SchemeStatus.ACTIVE }, include: schemeInclude });
  await writeAuditLog(request, 'ACTIVATE', 'Scheme', schemeId);
  response.json({ data: scheme });
}));

schemesRouter.post('/:id/deactivate', allowPermission('schemes.manage', Role.SUPER_ADMIN), asyncHandler(async (request, response) => {
  const schemeId = idSchema.parse(request.params.id);
  const input = statusSchema.partial().parse(request.body ?? {});
  const status = input.status && input.status !== SchemeStatus.ACTIVE ? input.status : SchemeStatus.ARCHIVED;
  const scheme = await prisma.scheme.update({ where: { id: schemeId }, data: { status }, include: schemeInclude });
  await writeAuditLog(request, 'DEACTIVATE', 'Scheme', schemeId, { status });
  response.json({ data: scheme });
}));

schemesRouter.get('/:id/eligibility/:familyId', asyncHandler(async (request, response) => {
  const schemeId = idSchema.parse(request.params.id);
  const familyId = idSchema.parse(request.params.familyId);
  const [scheme, family] = await Promise.all([
    prisma.scheme.findUnique({ where: { id: schemeId } }),
    prisma.family.findUnique({ where: { id: familyId }, include: { income: true, members: true } }),
  ]);
  if (!scheme || !family) throw new ApiError(404, 'Scheme or family not found.');
  ensureFamilyAccess(request, family);
  if (request.auth!.role === Role.FAMILY && scheme.status !== SchemeStatus.ACTIVE) throw new ApiError(404, 'Scheme not found.');
  response.json({ data: evaluateSchemeEligibility(family, scheme) });
}));

schemesRouter.delete('/:id', allowPermission('schemes.manage', Role.SUPER_ADMIN), asyncHandler(async (request, response) => {
  const schemeId = idSchema.parse(request.params.id);
  const scheme = await prisma.scheme.findUnique({ where: { id: schemeId }, select: { _count: { select: { applications: true } } } });
  if (!scheme) throw new ApiError(404, 'Scheme not found.');
  if (scheme._count.applications) {
    const archived = await prisma.scheme.update({ where: { id: schemeId }, data: { status: SchemeStatus.ARCHIVED } });
    await writeAuditLog(request, 'ARCHIVE', 'Scheme', schemeId, { reason: 'Applications exist' });
    response.json({ data: archived, message: 'The scheme was archived because it has application history.' });
    return;
  }
  await prisma.scheme.delete({ where: { id: schemeId } });
  await writeAuditLog(request, 'DELETE', 'Scheme', schemeId);
  response.status(204).send();
}));
