import { ApplicationStatus, FamilyStatus, Prisma, Role, SchemeStatus, VisitStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { familyScopeForRequest, withFamilyScope } from '../services/family-access.service';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';

export const dashboardRouter = Router();

const optionalId = z.string().uuid().optional();

const asDate = (value: unknown, endOfDay = false) => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
};

const filterInput = (query: Record<string, unknown>) => z.object({
  districtId: optionalId,
  villageId: optionalId,
  officerId: optionalId,
  schemeId: optionalId,
}).parse(query);

const buildFamilyWhere = (request: Parameters<typeof requireAuth>[0]): Prisma.FamilyWhereInput => {
  const input = filterInput(request.query);
  if (input.districtId && request.auth!.role !== Role.SUPER_ADMIN && request.auth!.role !== Role.FAMILY && request.auth!.districtId !== input.districtId) {
    throw new ApiError(403, 'That district is outside your assigned scope.');
  }
  const dateFrom = asDate(request.query.dateFrom);
  const dateTo = asDate(request.query.dateTo, true);
  return withFamilyScope(request, {
    ...(input.districtId ? { districtId: input.districtId } : {}),
    ...(input.villageId ? { villageId: input.villageId } : {}),
    ...(input.officerId ? { assignedOfficerId: input.officerId } : {}),
    ...(input.schemeId ? { applications: { some: { schemeId: input.schemeId } } } : {}),
    ...(dateFrom || dateTo ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
  });
};

const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

dashboardRouter.use(requireAuth);

dashboardRouter.get('/', asyncHandler(async (request, response) => {
  const input = filterInput(request.query);
  const familyWhere = buildFamilyWhere(request);
  const dateFrom = asDate(request.query.dateFrom);
  const dateTo = asDate(request.query.dateTo, true);
  const applicationWhere: Prisma.SchemeApplicationWhereInput = {
    family: familyWhere,
    ...(input.schemeId ? { schemeId: input.schemeId } : {}),
    ...(dateFrom || dateTo ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
  };
  const [familyTotal, familyStatuses, applicationTotal, applicationStatuses, familyRows, villages, activeSchemes, completedFieldVisits] = await Promise.all([
    prisma.family.count({ where: familyWhere }),
    prisma.family.groupBy({ by: ['status'], where: familyWhere, _count: { _all: true } }),
    prisma.schemeApplication.count({ where: applicationWhere }),
    prisma.schemeApplication.groupBy({ by: ['status'], where: applicationWhere, _count: { _all: true } }),
    prisma.family.findMany({ where: familyWhere, select: { createdAt: true, villageId: true, village: { select: { name: true } } } }),
    prisma.village.findMany({
      where: request.auth!.role === Role.FAMILY
        ? { families: { some: { id: request.auth!.familyId ?? '__unavailable__' } } }
        : {
          ...(input.districtId ? { districtId: input.districtId } : request.auth!.role !== Role.SUPER_ADMIN && request.auth!.districtId ? { districtId: request.auth!.districtId } : {}),
        },
      select: { id: true, name: true, tribalFamilyCount: true },
    }),
    prisma.scheme.count({ where: { status: SchemeStatus.ACTIVE } }),
    prisma.fieldVisit.count({
      where: {
        family: familyWhere,
        status: VisitStatus.COMPLETED,
        ...(dateFrom || dateTo ? { scheduledAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
      },
    }),
  ]);
  const familyStatusCount = new Map(familyStatuses.map((row) => [row.status, row._count._all]));
  const applicationStatusCount = new Map(applicationStatuses.map((row) => [row.status, row._count._all]));
  const registeredByMonth = new Map<string, number>();
  for (const family of familyRows) registeredByMonth.set(monthKey(family.createdAt), (registeredByMonth.get(monthKey(family.createdAt)) ?? 0) + 1);
  const registrationTrend = [...registeredByMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, count]) => ({ month, count }));
  const familiesByVillage = new Map<string, number>();
  for (const family of familyRows) familiesByVillage.set(family.villageId, (familiesByVillage.get(family.villageId) ?? 0) + 1);
  const villageCoverage = villages.map((village) => ({
    villageId: village.id,
    village: village.name,
    registeredFamilies: familiesByVillage.get(village.id) ?? 0,
    targetFamilies: village.tribalFamilyCount,
    coverage: village.tribalFamilyCount ? Math.round(((familiesByVillage.get(village.id) ?? 0) / village.tribalFamilyCount) * 100) : 0,
  })).sort((left, right) => right.coverage - left.coverage);
  const applicationOutcomes = Object.values(ApplicationStatus).map((status) => ({
    status,
    count: applicationStatusCount.get(status) ?? 0,
  }));
  const metrics = {
    totalFamilies: familyTotal,
    approvedFamilies: familyStatusCount.get(FamilyStatus.APPROVED) ?? 0,
    pendingVerification: (familyStatusCount.get(FamilyStatus.SUBMITTED) ?? 0) + (familyStatusCount.get(FamilyStatus.DOCUMENT_VERIFICATION) ?? 0) + (familyStatusCount.get(FamilyStatus.FIELD_VISIT) ?? 0),
    totalApplications: applicationTotal,
    approvedApplications: applicationStatusCount.get(ApplicationStatus.APPROVED) ?? 0,
    benefitsReceived: applicationStatusCount.get(ApplicationStatus.BENEFIT_RECEIVED) ?? 0,
    activeSchemes,
    fieldVisits: completedFieldVisits,
  };
  const attentionNeeded = [
    { type: 'DOCUMENT_VERIFICATION', count: familyStatusCount.get(FamilyStatus.DOCUMENT_VERIFICATION) ?? 0, label: 'Families awaiting document verification' },
    { type: 'FIELD_VISIT', count: familyStatusCount.get(FamilyStatus.FIELD_VISIT) ?? 0, label: 'Families awaiting field visit' },
    { type: 'UNDER_REVIEW', count: applicationStatusCount.get(ApplicationStatus.UNDER_REVIEW) ?? 0, label: 'Applications under review' },
  ].filter((item) => item.count > 0);
  const targetFamilies = villages.reduce((total, village) => total + village.tribalFamilyCount, 0);
  response.json({
    data: {
      metrics,
      kpis: metrics,
      registrationTrend,
      villageCoverage,
      applicationOutcomes,
      charts: { registrationTrend, villageCoverage, applicationOutcomes },
      attentionNeeded,
      target: { registeredFamilies: familyTotal, targetFamilies, coverage: targetFamilies ? Math.round((familyTotal / targetFamilies) * 100) : 0 },
      filters: { ...input, dateFrom: dateFrom?.toISOString() ?? null, dateTo: dateTo?.toISOString() ?? null },
    },
  });
}));

dashboardRouter.get('/filters', asyncHandler(async (request, response) => {
  const scope = familyScopeForRequest(request);
  const families = await prisma.family.findMany({
    where: scope,
    select: { district: { select: { id: true, name: true } }, village: { select: { id: true, name: true } }, assignedOfficer: { select: { id: true, fullName: true } } },
    distinct: ['districtId', 'villageId', 'assignedOfficerId'],
  });
  const unique = <T extends { id: string }>(items: Array<T | null>) => [...new Map(items.filter((item): item is T => item !== null).map((item) => [item.id, item])).values()];
  const schemes = await prisma.scheme.findMany({ where: { status: SchemeStatus.ACTIVE }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } });
  response.json({ data: { districts: unique(families.map((family) => family.district)), villages: unique(families.map((family) => family.village)), officers: unique(families.map((family) => family.assignedOfficer)), schemes } });
}));
