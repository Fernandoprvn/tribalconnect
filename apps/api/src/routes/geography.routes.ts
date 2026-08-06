import { Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';

export const geographyRouter = Router();

geographyRouter.use(requireAuth);

const districtIdsForRequest = async (request: Parameters<typeof requireAuth>[0]) => {
  if (request.auth!.role === Role.SUPER_ADMIN) return undefined;
  if (request.auth!.districtId) return [request.auth!.districtId];
  if (request.auth!.familyId) {
    const family = await prisma.family.findUnique({ where: { id: request.auth!.familyId }, select: { districtId: true } });
    return family ? [family.districtId] : [];
  }
  return [];
};

geographyRouter.get('/districts', asyncHandler(async (request, response) => {
  const ids = await districtIdsForRequest(request);
  const districts = await prisma.district.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  });
  response.json({ data: districts });
}));

geographyRouter.get('/blocks', asyncHandler(async (request, response) => {
  const input = z.object({ districtId: z.string().uuid().optional() }).parse(request.query);
  const ids = await districtIdsForRequest(request);
  const where = {
    ...(input.districtId ? { districtId: input.districtId } : {}),
    ...(ids ? { districtId: { in: ids } } : {}),
  };
  const blocks = await prisma.block.findMany({ where, orderBy: { name: 'asc' }, select: { id: true, name: true, districtId: true } });
  response.json({ data: blocks });
}));

geographyRouter.get('/panchayats', asyncHandler(async (request, response) => {
  const input = z.object({ blockId: z.string().uuid().optional(), districtId: z.string().uuid().optional() }).parse(request.query);
  const ids = await districtIdsForRequest(request);
  const blockDistrictScope = input.districtId
    ? { districtId: input.districtId }
    : ids
      ? { districtId: { in: ids } }
      : undefined;
  const panchayats = await prisma.panchayat.findMany({
    where: {
      ...(input.blockId ? { blockId: input.blockId } : {}),
      ...(blockDistrictScope ? { block: blockDistrictScope } : {}),
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, blockId: true },
  });
  response.json({ data: panchayats });
}));

geographyRouter.get('/villages', asyncHandler(async (request, response) => {
  const input = z.object({ districtId: z.string().uuid().optional() }).parse(request.query);
  const ids = await districtIdsForRequest(request);
  if (input.districtId && ids && !ids.includes(input.districtId)) throw new ApiError(403, 'That district is outside your assigned scope.');
  const villages = await prisma.village.findMany({
    where: {
      ...(input.districtId ? { districtId: input.districtId } : {}),
      ...(ids && !input.districtId ? { districtId: { in: ids } } : {}),
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, hamlet: true, districtId: true, blockId: true, panchayatId: true },
  });
  response.json({ data: villages });
}));
