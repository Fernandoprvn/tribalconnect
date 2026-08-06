import { FamilyStatus, Prisma, Role, UserStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { allowPermission, allowRoles, requireAuth } from '../middleware/auth';
import { ensureDistrictAccess } from '../services/family-access.service';
import { writeAuditLog } from '../services/audit.service';
import { villageSchema, villageUpdateSchema } from '../schemas';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';
import { getPagination, pageMeta } from '../utils/pagination';

export const villagesRouter = Router();

const idSchema = z.string().uuid();
const officerAssignmentSchema = z.object({ assignedOfficerId: z.string().uuid().nullable() });
const manageVillageRoles = [Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER];

const villageInclude = {
  district: { select: { id: true, name: true, code: true } },
  block: { select: { id: true, name: true } },
  panchayat: { select: { id: true, name: true } },
  assignedOfficer: { select: { id: true, fullName: true, mobile: true } },
  _count: { select: { families: true, fieldVisits: true } },
} as const;

const villageScope = async (request: Parameters<typeof requireAuth>[0]) => {
  if (request.auth!.role === Role.SUPER_ADMIN) return {};
  if (request.auth!.role === Role.FAMILY) {
    if (!request.auth!.familyId) throw new ApiError(403, 'No family profile is linked to this account.');
    const family = await prisma.family.findUnique({ where: { id: request.auth!.familyId }, select: { villageId: true } });
    return family ? { id: family.villageId } : { id: '__unavailable__' };
  }
  if (!request.auth!.districtId) throw new ApiError(403, 'Your account is not assigned to a district.');
  return { districtId: request.auth!.districtId };
};

const validateVillageRelations = async (input: {
  districtId: string;
  blockId?: string | null;
  panchayatId?: string | null;
  assignedOfficerId?: string | null;
}) => {
  if (input.blockId) {
    const block = await prisma.block.findFirst({ where: { id: input.blockId, districtId: input.districtId }, select: { id: true } });
    if (!block) throw new ApiError(422, 'The selected block does not belong to the selected district.');
  }
  if (input.panchayatId) {
    const panchayat = await prisma.panchayat.findFirst({
      where: {
        id: input.panchayatId,
        ...(input.blockId ? { blockId: input.blockId } : { block: { districtId: input.districtId } }),
      },
      select: { id: true },
    });
    if (!panchayat) throw new ApiError(422, 'The selected panchayat does not belong to the selected geography.');
  }
  if (input.assignedOfficerId) {
    const officer = await prisma.user.findFirst({
      where: { id: input.assignedOfficerId, role: Role.DEVELOPMENT_OFFICER, status: UserStatus.ACTIVE, districtId: input.districtId },
      select: { id: true },
    });
    if (!officer) throw new ApiError(422, 'The assigned officer must be active and belong to this district.');
  }
};

const attachVillageStats = async <T extends { id: string; _count: { families: number; fieldVisits: number } }>(villages: T[]) => {
  const villageIds = villages.map((village) => village.id);
  if (!villageIds.length) {
    return villages.map((village) => ({
      ...village,
      statistics: { familyCount: 0, pendingFamilies: 0, applicationCount: 0, schemeCount: 0, fieldVisitCount: 0 },
    }));
  }
  const [familiesByStatus, applications] = await Promise.all([
    prisma.family.groupBy({ by: ['villageId', 'status'], where: { villageId: { in: villageIds } }, _count: { _all: true } }),
    prisma.schemeApplication.findMany({
      where: { family: { villageId: { in: villageIds } } },
      select: { schemeId: true, family: { select: { villageId: true } } },
    }),
  ]);
  const applicationCount = new Map<string, number>();
  const schemesByVillage = new Map<string, Set<string>>();
  for (const application of applications) {
    const villageId = application.family.villageId;
    applicationCount.set(villageId, (applicationCount.get(villageId) ?? 0) + 1);
    const schemes = schemesByVillage.get(villageId) ?? new Set<string>();
    schemes.add(application.schemeId);
    schemesByVillage.set(villageId, schemes);
  }
  const pendingCount = new Map<string, number>();
  for (const group of familiesByStatus) {
    if (group.status !== FamilyStatus.APPROVED && group.status !== FamilyStatus.REJECTED) {
      pendingCount.set(group.villageId, (pendingCount.get(group.villageId) ?? 0) + group._count._all);
    }
  }
  return villages.map((village) => ({
    ...village,
    statistics: {
      familyCount: village._count.families,
      pendingFamilies: pendingCount.get(village.id) ?? 0,
      applicationCount: applicationCount.get(village.id) ?? 0,
      schemeCount: schemesByVillage.get(village.id)?.size ?? 0,
      fieldVisitCount: village._count.fieldVisits,
    },
  }));
};

villagesRouter.use(requireAuth);

villagesRouter.get('/', asyncHandler(async (request, response) => {
  const { page, limit, skip } = getPagination(request);
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
  const districtId = typeof request.query.districtId === 'string' ? idSchema.parse(request.query.districtId) : undefined;
  const scope = await villageScope(request);
  if (districtId && 'districtId' in scope && scope.districtId !== districtId) throw new ApiError(403, 'That district is outside your assigned scope.');
  const where: Prisma.VillageWhereInput = {
    ...scope,
    ...(districtId ? { districtId } : {}),
    ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { hamlet: { contains: search, mode: 'insensitive' } }] } : {}),
  };
  const [villages, total] = await prisma.$transaction([
    prisma.village.findMany({ where, include: villageInclude, orderBy: { name: 'asc' }, skip, take: limit }),
    prisma.village.count({ where }),
  ]);
  response.json({ data: await attachVillageStats(villages), meta: pageMeta(page, limit, total) });
}));

villagesRouter.get('/map', asyncHandler(async (request, response) => {
  const districtId = typeof request.query.districtId === 'string' ? idSchema.parse(request.query.districtId) : undefined;
  const scope = await villageScope(request);
  if (districtId && 'districtId' in scope && scope.districtId !== districtId) throw new ApiError(403, 'That district is outside your assigned scope.');
  const villages = await prisma.village.findMany({
    where: { ...scope, ...(districtId ? { districtId } : {}), mapLatitude: { not: null }, mapLongitude: { not: null } },
    include: villageInclude,
    orderBy: { name: 'asc' },
  });
  response.json({ data: await attachVillageStats(villages) });
}));

villagesRouter.post('/', allowPermission('villages.manage', ...manageVillageRoles), asyncHandler(async (request, response) => {
  const input = villageSchema.parse(request.body);
  ensureDistrictAccess(request, input.districtId);
  await validateVillageRelations(input);
  const village = await prisma.village.create({ data: input, include: villageInclude });
  await writeAuditLog(request, 'CREATE', 'Village', village.id, { districtId: village.districtId });
  response.status(201).json({ data: (await attachVillageStats([village]))[0] });
}));

villagesRouter.get('/:id', asyncHandler(async (request, response) => {
  const village = await prisma.village.findUnique({ where: { id: idSchema.parse(request.params.id) }, include: villageInclude });
  if (!village) throw new ApiError(404, 'Village not found.');
  const scope = await villageScope(request);
  if ('id' in scope && scope.id !== village.id) throw new ApiError(403, 'That village is outside your assigned scope.');
  if ('districtId' in scope && scope.districtId !== village.districtId) throw new ApiError(403, 'That village is outside your assigned scope.');
  response.json({ data: (await attachVillageStats([village]))[0] });
}));

villagesRouter.patch('/:id', allowPermission('villages.manage', ...manageVillageRoles), asyncHandler(async (request, response) => {
  const villageId = idSchema.parse(request.params.id);
  const existing = await prisma.village.findUniqueOrThrow({ where: { id: villageId } });
  ensureDistrictAccess(request, existing.districtId);
  const input = villageUpdateSchema.parse(request.body);
  const districtId = input.districtId ?? existing.districtId;
  ensureDistrictAccess(request, districtId);
  await validateVillageRelations({
    districtId,
    blockId: input.blockId ?? existing.blockId,
    panchayatId: input.panchayatId ?? existing.panchayatId,
    assignedOfficerId: input.assignedOfficerId ?? existing.assignedOfficerId,
  });
  const village = await prisma.village.update({ where: { id: villageId }, data: input, include: villageInclude });
  await writeAuditLog(request, 'UPDATE', 'Village', villageId);
  response.json({ data: (await attachVillageStats([village]))[0] });
}));

villagesRouter.post('/:id/assign-officer', allowPermission('villages.manage', ...manageVillageRoles), asyncHandler(async (request, response) => {
  const villageId = idSchema.parse(request.params.id);
  const existing = await prisma.village.findUniqueOrThrow({ where: { id: villageId } });
  ensureDistrictAccess(request, existing.districtId);
  const input = officerAssignmentSchema.parse(request.body);
  await validateVillageRelations({ districtId: existing.districtId, assignedOfficerId: input.assignedOfficerId });
  const village = await prisma.village.update({ where: { id: villageId }, data: { assignedOfficerId: input.assignedOfficerId }, include: villageInclude });
  await writeAuditLog(request, 'ASSIGN_OFFICER', 'Village', villageId, { assignedOfficerId: input.assignedOfficerId });
  response.json({ data: (await attachVillageStats([village]))[0] });
}));

villagesRouter.delete('/:id', allowRoles(Role.SUPER_ADMIN), asyncHandler(async (request, response) => {
  const villageId = idSchema.parse(request.params.id);
  const village = await prisma.village.findUnique({ where: { id: villageId }, include: { _count: { select: { families: true, developmentCenters: true } } } });
  if (!village) throw new ApiError(404, 'Village not found.');
  if (village._count.families || village._count.developmentCenters) {
    throw new ApiError(409, 'A village with families or development centres cannot be deleted. Reassign its records first.');
  }
  await prisma.village.delete({ where: { id: villageId } });
  await writeAuditLog(request, 'DELETE', 'Village', villageId);
  response.status(204).send();
}));
