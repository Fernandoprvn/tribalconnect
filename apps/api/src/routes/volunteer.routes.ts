import { Prisma, Role, UserStatus, VisitStatus, WorkflowStage } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { allowRoles, requireAuth } from '../middleware/auth';
import { volunteerSyncSchema, volunteerVisitSchema, volunteerVisitUpdateSchema } from '../schemas';
import { writeAuditLog } from '../services/audit.service';
import { ensureFamilyAccess } from '../services/family-access.service';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';
import { getPagination, pageMeta } from '../utils/pagination';

export const volunteerRouter = Router();

const idSchema = z.string().uuid();
const visitInclude = {
  family: { select: { id: true, familyCode: true, headName: true, districtId: true, village: { select: { id: true, name: true } } } },
  volunteer: { select: { id: true, fullName: true, mobile: true } },
  village: { select: { id: true, name: true } },
} as const;
type VisitWithRelations = Prisma.FieldVisitGetPayload<{ include: typeof visitInclude }>;

const validateVolunteer = async (volunteerId: string, districtId: string) => {
  const volunteer = await prisma.user.findFirst({
    where: { id: volunteerId, role: Role.FIELD_VOLUNTEER, status: UserStatus.ACTIVE, districtId },
    select: { id: true },
  });
  if (!volunteer) throw new ApiError(422, 'The selected volunteer must be active and assigned to the family district.');
};

const visitWhereForRequest = (request: Parameters<typeof requireAuth>[0]) => {
  if (request.auth!.role === Role.SUPER_ADMIN) return {};
  if (request.auth!.role === Role.FIELD_VOLUNTEER) return { volunteerId: request.auth!.userId };
  if (request.auth!.role === Role.FAMILY) return { familyId: request.auth!.familyId ?? '__unavailable__' };
  if (!request.auth!.districtId) throw new ApiError(403, 'Your account is not assigned to a district.');
  return { family: { districtId: request.auth!.districtId } };
};

const createVisit = async (request: Parameters<typeof requireAuth>[0], input: z.infer<typeof volunteerVisitSchema>) => {
  const family = await prisma.family.findUnique({ where: { id: input.familyId }, select: { id: true, districtId: true, villageId: true } });
  if (!family) throw new ApiError(404, 'Family not found.');
  ensureFamilyAccess(request, family);
  const volunteerId = request.auth!.role === Role.FIELD_VOLUNTEER ? request.auth!.userId : input.volunteerId;
  if (!volunteerId) throw new ApiError(422, 'Select a field volunteer for this visit.');
  await validateVolunteer(volunteerId, family.districtId);
  if (input.clientSyncId) {
    const existing = await prisma.fieldVisit.findUnique({ where: { clientSyncId: input.clientSyncId }, include: visitInclude });
    if (existing) {
      if (existing.familyId !== family.id || existing.volunteerId !== volunteerId) {
        throw new ApiError(409, 'The supplied sync identifier belongs to a different visit.');
      }
      return { visit: existing, created: false };
    }
  }
  const completedAt = input.status === VisitStatus.COMPLETED ? new Date() : undefined;
  let visit: VisitWithRelations;
  try {
    visit = await prisma.fieldVisit.create({
      data: {
        familyId: family.id,
        villageId: family.villageId,
        volunteerId,
        scheduledAt: input.scheduledAt,
        status: input.status,
        purpose: input.purpose,
        notes: input.notes,
        latitude: input.latitude,
        longitude: input.longitude,
        completedAt,
        clientSyncId: input.clientSyncId,
        ...(input.clientSyncId ? { syncReceivedAt: new Date() } : {}),
      },
      include: visitInclude,
    });
  } catch (error) {
    if (input.clientSyncId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.fieldVisit.findUnique({ where: { clientSyncId: input.clientSyncId }, include: visitInclude });
      if (existing && existing.familyId === family.id && existing.volunteerId === volunteerId) return { visit: existing, created: false };
    }
    throw error;
  }
  await prisma.workflowEvent.create({
    data: {
      familyId: family.id,
      stage: WorkflowStage.FIELD_VISIT,
      title: input.status === VisitStatus.COMPLETED ? 'Field visit completed' : 'Field visit scheduled',
      note: input.purpose,
      actorId: request.auth!.userId,
    },
  });
  return { visit, created: true };
};

volunteerRouter.use(requireAuth, allowRoles(Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER, Role.FIELD_VOLUNTEER, Role.FAMILY));

volunteerRouter.get('/visits', asyncHandler(async (request, response) => {
  const { page, limit, skip } = getPagination(request);
  const status = typeof request.query.status === 'string' && Object.values(VisitStatus).includes(request.query.status as VisitStatus)
    ? request.query.status as VisitStatus
    : undefined;
  const where = { ...visitWhereForRequest(request), ...(status ? { status } : {}) };
  const [visits, total] = await prisma.$transaction([
    prisma.fieldVisit.findMany({ where, include: visitInclude, orderBy: { scheduledAt: 'desc' }, skip, take: limit }),
    prisma.fieldVisit.count({ where }),
  ]);
  response.json({ data: visits, meta: pageMeta(page, limit, total) });
}));

volunteerRouter.post('/visits', allowRoles(Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER, Role.FIELD_VOLUNTEER), asyncHandler(async (request, response) => {
  const input = volunteerVisitSchema.parse(request.body);
  const result = await createVisit(request, input);
  if (result.created) await writeAuditLog(request, 'CREATE', 'FieldVisit', result.visit.id, { familyId: input.familyId, clientSyncId: input.clientSyncId });
  response.status(result.created ? 201 : 200).json({ data: result.visit, meta: { created: result.created } });
}));

volunteerRouter.get('/visits/:id', asyncHandler(async (request, response) => {
  const visit = await prisma.fieldVisit.findUnique({ where: { id: idSchema.parse(request.params.id) }, include: visitInclude });
  if (!visit) throw new ApiError(404, 'Visit not found.');
  if (request.auth!.role === Role.FIELD_VOLUNTEER && visit.volunteerId !== request.auth!.userId) throw new ApiError(403, 'Visit is outside your assigned scope.');
  if (request.auth!.role === Role.FAMILY && visit.familyId !== request.auth!.familyId) throw new ApiError(403, 'Visit is outside your assigned scope.');
  if (request.auth!.role === Role.DEVELOPMENT_OFFICER && visit.family.districtId !== request.auth!.districtId) throw new ApiError(403, 'Visit is outside your assigned scope.');
  response.json({ data: visit });
}));

volunteerRouter.patch('/visits/:id', allowRoles(Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER, Role.FIELD_VOLUNTEER), asyncHandler(async (request, response) => {
  const visitId = idSchema.parse(request.params.id);
  const existing = await prisma.fieldVisit.findUnique({ where: { id: visitId }, include: { family: true } });
  if (!existing) throw new ApiError(404, 'Visit not found.');
  ensureFamilyAccess(request, existing.family);
  if (request.auth!.role === Role.FIELD_VOLUNTEER && existing.volunteerId !== request.auth!.userId) throw new ApiError(403, 'You can only update your own visits.');
  const input = volunteerVisitUpdateSchema.parse(request.body);
  const visit = await prisma.fieldVisit.update({
    where: { id: visitId },
    data: { ...input, ...(input.status === VisitStatus.COMPLETED && !existing.completedAt ? { completedAt: new Date() } : {}) },
    include: visitInclude,
  });
  await writeAuditLog(request, 'UPDATE', 'FieldVisit', visitId, { fields: Object.keys(input) });
  response.json({ data: visit });
}));

volunteerRouter.post('/sync', allowRoles(Role.FIELD_VOLUNTEER), asyncHandler(async (request, response) => {
  const input = volunteerSyncSchema.parse(request.body);
  const results: Array<{ clientSyncId: string; visit?: unknown; created?: boolean; error?: string }> = [];
  for (const record of input.records) {
    try {
      const result = await createVisit(request, record);
      results.push({ clientSyncId: record.clientSyncId, visit: result.visit, created: result.created });
    } catch (error) {
      results.push({ clientSyncId: record.clientSyncId, error: error instanceof Error ? error.message : 'Unable to sync record.' });
    }
  }
  const synced = results.filter((result) => result.visit).length;
  const created = results.filter((result) => result.created).length;
  if (created) await writeAuditLog(request, 'SYNC', 'FieldVisit', request.auth!.userId, { received: input.records.length, synced, created });
  response.json({ data: { synced, created, failed: results.length - synced, results } });
}));
