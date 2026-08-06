import type { Family, Prisma, Role } from '@prisma/client';
import { Role as Roles } from '@prisma/client';
import type { Request } from 'express';
import { ApiError } from '../utils/api-error';

export const familyDetailInclude = {
  district: true,
  village: { include: { block: true, panchayat: true } },
  assignedOfficer: { select: { id: true, fullName: true, mobile: true } },
  members: { orderBy: { createdAt: 'asc' as const } },
  income: true,
  documents: { orderBy: { createdAt: 'desc' as const } },
  applications: { include: { scheme: true, statusEvents: { orderBy: { createdAt: 'desc' as const } } }, orderBy: { createdAt: 'desc' as const } },
  fieldVisits: { include: { volunteer: { select: { id: true, fullName: true, mobile: true } } }, orderBy: { scheduledAt: 'desc' as const } },
  workflowEvents: { orderBy: { createdAt: 'desc' as const } },
} as const;

export const familyScopeForRequest = (request: Request): Prisma.FamilyWhereInput => {
  if (!request.auth) throw new ApiError(401, 'Authentication is required.');
  if (request.auth.role === Roles.SUPER_ADMIN) return {};
  if (request.auth.role === Roles.FAMILY) {
    if (!request.auth.familyId) throw new ApiError(403, 'No family profile is linked to this account.');
    return { id: request.auth.familyId };
  }
  if (!request.auth.districtId) throw new ApiError(403, 'Your account is not assigned to a district.');
  return { districtId: request.auth.districtId };
};

export const withFamilyScope = (request: Request, filters: Prisma.FamilyWhereInput = {}): Prisma.FamilyWhereInput => {
  const scope = familyScopeForRequest(request);
  return Object.keys(scope).length ? { AND: [scope, filters] } : filters;
};

export const ensureDistrictAccess = (request: Request, districtId: string) => {
  if (!request.auth) throw new ApiError(401, 'Authentication is required.');
  if (request.auth.role === Roles.SUPER_ADMIN) return;
  if (request.auth.role === Roles.FAMILY || request.auth.districtId !== districtId) {
    throw new ApiError(403, 'You can only manage records in your assigned district.');
  }
};

export const ensureFamilyAccess = (request: Request, family: Pick<Family, 'id' | 'districtId'>) => {
  if (!request.auth) throw new ApiError(401, 'Authentication is required.');
  if (request.auth.role === Roles.FAMILY && request.auth.familyId !== family.id) {
    throw new ApiError(403, 'You can only access your own family profile.');
  }
  if (request.auth.role !== Roles.FAMILY && request.auth.role !== Roles.SUPER_ADMIN && request.auth.districtId !== family.districtId) {
    throw new ApiError(403, 'You can only access families in your assigned district.');
  }
};

export const canManageFamily = (role: Role) => role !== Roles.FAMILY;

export const sanitizeFamily = <T extends Record<string, any>>(family: T) => {
  const { aadhaarHash: _aadhaarHash, ...safeFamily } = family;
  const result = safeFamily as Record<string, any>;
  if (Array.isArray(result.members)) {
    result.members = result.members.map(({ aadhaarHash: _memberAadhaarHash, ...member }: Record<string, unknown>) => member);
  }
  return result;
};
