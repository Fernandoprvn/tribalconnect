import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { allowRoles, requireAuth } from '../middleware/auth';
import { announcementSchema, announcementUpdateSchema } from '../schemas';
import { writeAuditLog } from '../services/audit.service';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';
import { getPagination, pageMeta } from '../utils/pagination';

export const announcementsRouter = Router();

const idSchema = z.string().uuid();

const effectiveDistrictId = async (request: Parameters<typeof requireAuth>[0]) => {
  if (request.auth!.role === Role.SUPER_ADMIN) return undefined;
  if (request.auth!.districtId) return request.auth!.districtId;
  if (request.auth!.familyId) {
    return prisma.family.findUnique({ where: { id: request.auth!.familyId }, select: { districtId: true } }).then((family) => family?.districtId);
  }
  return undefined;
};

const validateDistrict = async (districtId: string | null | undefined) => {
  if (!districtId) return;
  const district = await prisma.district.findUnique({ where: { id: districtId }, select: { id: true } });
  if (!district) throw new ApiError(422, 'Announcement district was not found.');
};

announcementsRouter.use(requireAuth);

announcementsRouter.get('/', asyncHandler(async (request, response) => {
  const { page, limit, skip } = getPagination(request);
  const includeUnpublished = request.auth!.role === Role.SUPER_ADMIN && request.query.includeUnpublished === 'true';
  const districtId = await effectiveDistrictId(request);
  const where = {
    ...(includeUnpublished ? {} : { isPublished: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }),
    ...(districtId ? { AND: [{ OR: [{ districtId: null }, { districtId }] }] } : request.auth!.role !== Role.SUPER_ADMIN ? { districtId: null } : {}),
  };
  const [announcements, total] = await prisma.$transaction([
    prisma.announcement.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], skip, take: limit }),
    prisma.announcement.count({ where }),
  ]);
  response.json({ data: announcements, meta: pageMeta(page, limit, total) });
}));

announcementsRouter.post('/', allowRoles(Role.SUPER_ADMIN), asyncHandler(async (request, response) => {
  const input = announcementSchema.parse(request.body);
  await validateDistrict(input.districtId);
  const announcement = await prisma.announcement.create({
    data: {
      ...input,
      createdById: request.auth!.userId,
      ...(input.isPublished && !input.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });
  await writeAuditLog(request, 'CREATE', 'Announcement', announcement.id);
  response.status(201).json({ data: announcement });
}));

announcementsRouter.patch('/:id', allowRoles(Role.SUPER_ADMIN), asyncHandler(async (request, response) => {
  const announcementId = idSchema.parse(request.params.id);
  const input = announcementUpdateSchema.parse(request.body);
  if (input.districtId !== undefined) await validateDistrict(input.districtId);
  const announcement = await prisma.announcement.update({
    where: { id: announcementId },
    data: { ...input, ...(input.isPublished && !input.publishedAt ? { publishedAt: new Date() } : {}) },
  });
  await writeAuditLog(request, 'UPDATE', 'Announcement', announcementId);
  response.json({ data: announcement });
}));

announcementsRouter.post('/:id/publish', allowRoles(Role.SUPER_ADMIN), asyncHandler(async (request, response) => {
  const announcementId = idSchema.parse(request.params.id);
  const announcement = await prisma.announcement.update({ where: { id: announcementId }, data: { isPublished: true, publishedAt: new Date() } });
  await writeAuditLog(request, 'PUBLISH', 'Announcement', announcementId);
  response.json({ data: announcement });
}));

announcementsRouter.post('/:id/unpublish', allowRoles(Role.SUPER_ADMIN), asyncHandler(async (request, response) => {
  const announcementId = idSchema.parse(request.params.id);
  const announcement = await prisma.announcement.update({ where: { id: announcementId }, data: { isPublished: false } });
  await writeAuditLog(request, 'UNPUBLISH', 'Announcement', announcementId);
  response.json({ data: announcement });
}));

announcementsRouter.delete('/:id', allowRoles(Role.SUPER_ADMIN), asyncHandler(async (request, response) => {
  const announcementId = idSchema.parse(request.params.id);
  const exists = await prisma.announcement.findUnique({ where: { id: announcementId }, select: { id: true } });
  if (!exists) throw new ApiError(404, 'Announcement not found.');
  await prisma.announcement.delete({ where: { id: announcementId } });
  await writeAuditLog(request, 'DELETE', 'Announcement', announcementId);
  response.status(204).send();
}));
