import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { Role, UserStatus } from '@prisma/client';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';

export type AccessTokenPayload = JwtPayload & {
  sub: string;
  role: Role;
  mobile: string;
  familyId?: string | null;
};

export const createAccessToken = (user: { id: string; role: Role; mobile: string; familyId?: string | null }) =>
  jwt.sign(
    { role: user.role, mobile: user.mobile, familyId: user.familyId ?? null },
    env.JWT_SECRET,
    { subject: user.id, expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] },
  );

const decodeToken = (token: string): AccessTokenPayload => {
  let decoded: string | JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new ApiError(401, 'Invalid or expired access token.');
  }
  if (typeof decoded === 'string' || !decoded.sub || !decoded.role || !decoded.mobile) {
    throw new ApiError(401, 'Invalid access token.');
  }
  return decoded as AccessTokenPayload;
};

export const requireAuth = asyncHandler(async (request, _response, next) => {
  const authorization = request.header('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new ApiError(401, 'A bearer access token is required.');

  const payload = decodeToken(authorization.slice('Bearer '.length));
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, mobile: true, familyId: true, districtId: true, status: true },
  });
  if (!user || user.status !== UserStatus.ACTIVE) throw new ApiError(401, 'This account is inactive or unavailable.');

  request.auth = {
    userId: user.id,
    role: user.role,
    mobile: user.mobile,
    familyId: user.familyId,
    districtId: user.districtId,
  };
  next();
});

export const allowRoles = (...roles: Role[]) => (request: Request, _response: Response, next: NextFunction) => {
  if (!request.auth) return next(new ApiError(401, 'Authentication is required.'));
  if (!roles.includes(request.auth.role)) return next(new ApiError(403, 'You do not have permission for this action.'));
  return next();
};

/**
 * Applies the administrator-managed permission record when one exists, while
 * preserving a safe role fallback during first-run setup before seed data is loaded.
 * Super administrators retain break-glass access to prevent an accidental lockout.
 */
export const allowPermission = (key: string, ...fallbackRoles: Role[]): RequestHandler => asyncHandler(async (request, _response, next) => {
  if (!request.auth) throw new ApiError(401, 'Authentication is required.');
  if (request.auth.role === Role.SUPER_ADMIN) {
    next();
    return;
  }
  const permission = await prisma.permission.findUnique({ where: { key }, select: { roles: true } });
  const roles = permission?.roles ?? fallbackRoles;
  if (!roles.includes(request.auth.role)) throw new ApiError(403, 'You do not have permission for this action.');
  next();
});

export const isPrivilegedRole = (role: Role) =>
  role === Role.SUPER_ADMIN || role === Role.DEVELOPMENT_OFFICER || role === Role.FIELD_VOLUNTEER;
