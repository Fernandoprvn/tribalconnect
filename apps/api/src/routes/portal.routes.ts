import { Role, SchemeStatus } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { allowRoles, requireAuth } from '../middleware/auth';
import { evaluateSchemeEligibility } from '../services/eligibility.service';
import { familyDetailInclude, sanitizeFamily } from '../services/family-access.service';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';

export const portalRouter = Router();

portalRouter.use(requireAuth, allowRoles(Role.FAMILY));

portalRouter.get('/overview', asyncHandler(async (request, response) => {
  const familyId = request.auth!.familyId;
  if (!familyId) throw new ApiError(403, 'No family profile is linked to this account.');
  const family = await prisma.family.findUnique({ where: { id: familyId }, include: familyDetailInclude });
  if (!family) throw new ApiError(404, 'Family profile not found.');
  const [schemes, announcements] = await Promise.all([
    prisma.scheme.findMany({ where: { status: SchemeStatus.ACTIVE }, orderBy: { name: 'asc' } }),
    prisma.announcement.findMany({
      where: {
        isPublished: true,
        OR: [{ districtId: null }, { districtId: family.districtId }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
      },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    }),
  ]);
  const eligibility = schemes.map((scheme) => evaluateSchemeEligibility(family, scheme));
  response.json({
    data: {
      family: sanitizeFamily(family),
      applications: family.applications,
      eligibleSchemes: eligibility.filter((result) => result.eligible),
      announcements,
    },
  });
}));

portalRouter.get('/profile', asyncHandler(async (request, response) => {
  const familyId = request.auth!.familyId;
  if (!familyId) throw new ApiError(403, 'No family profile is linked to this account.');
  const family = await prisma.family.findUnique({ where: { id: familyId }, include: familyDetailInclude });
  if (!family) throw new ApiError(404, 'Family profile not found.');
  response.json({ data: sanitizeFamily(family) });
}));
