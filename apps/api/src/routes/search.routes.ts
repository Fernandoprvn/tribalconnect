import { Prisma, Role, SchemeStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { familyScopeForRequest, withFamilyScope } from '../services/family-access.service';
import { asyncHandler } from '../utils/async-handler';
import { hashAadhaar } from '../utils/identifiers';

export const searchRouter = Router();

const querySchema = z.object({ q: z.string().trim().min(2).max(120), limit: z.coerce.number().int().min(1).max(20).default(8) });

searchRouter.use(requireAuth);

searchRouter.get('/', asyncHandler(async (request, response) => {
  const input = querySchema.parse(request.query);
  const mobile = input.q.replace(/\D/g, '');
  const familyWhere = withFamilyScope(request, {
    OR: [
      { familyCode: { contains: input.q, mode: 'insensitive' } },
      { headName: { contains: input.q, mode: 'insensitive' } },
      ...(mobile.length ? [{ mobile: { contains: mobile } }] : []),
      ...(mobile.length === 12 ? [{ aadhaarHash: hashAadhaar(mobile) }] : []),
    ],
  });
  const villageWhere: Prisma.VillageWhereInput = request.auth!.role === Role.SUPER_ADMIN
    ? { OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { hamlet: { contains: input.q, mode: 'insensitive' } }] }
    : request.auth!.role === Role.FAMILY && request.auth!.familyId
      ? { families: { some: { id: request.auth!.familyId } }, OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { hamlet: { contains: input.q, mode: 'insensitive' } }] }
      : { districtId: request.auth!.districtId ?? '__unavailable__', OR: [{ name: { contains: input.q, mode: 'insensitive' } }, { hamlet: { contains: input.q, mode: 'insensitive' } }] };
  const applicationWhere: Prisma.SchemeApplicationWhereInput = {
    family: familyScopeForRequest(request),
    OR: [
      { applicationNumber: { contains: input.q, mode: 'insensitive' } },
      { family: { headName: { contains: input.q, mode: 'insensitive' } } },
      { scheme: { name: { contains: input.q, mode: 'insensitive' } } },
    ],
  };
  const [families, schemes, villages, applications] = await Promise.all([
    prisma.family.findMany({ where: familyWhere, select: { id: true, familyCode: true, headName: true, village: { select: { name: true } } }, take: input.limit }),
    prisma.scheme.findMany({
      where: {
        ...(request.auth!.role === Role.FAMILY ? { status: SchemeStatus.ACTIVE } : {}),
        OR: [{ code: { contains: input.q, mode: 'insensitive' } }, { name: { contains: input.q, mode: 'insensitive' } }],
      },
      select: { id: true, code: true, name: true, department: true }, take: input.limit,
    }),
    prisma.village.findMany({ where: villageWhere, select: { id: true, name: true, district: { select: { name: true } } }, take: input.limit }),
    prisma.schemeApplication.findMany({ where: applicationWhere, select: { id: true, applicationNumber: true, status: true, scheme: { select: { name: true } }, family: { select: { headName: true } } }, take: input.limit }),
  ]);
  response.json({
    data: [
      ...families.map((family) => ({ id: family.id, type: 'family' as const, title: family.headName, subtitle: `${family.familyCode} · ${family.village.name}`, href: `/families/${family.id}` })),
      ...schemes.map((scheme) => ({ id: scheme.id, type: 'scheme' as const, title: scheme.name, subtitle: `${scheme.code} · ${scheme.department}`, href: `/schemes/${scheme.id}` })),
      ...villages.map((village) => ({ id: village.id, type: 'village' as const, title: village.name, subtitle: village.district.name, href: `/villages/${village.id}` })),
      ...applications.map((application) => ({ id: application.id, type: 'application' as const, title: application.applicationNumber, subtitle: `${application.scheme.name} · ${application.family.headName} · ${application.status}`, href: `/applications/${application.id}` })),
    ].slice(0, input.limit * 4),
  });
}));
