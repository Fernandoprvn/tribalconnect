import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import { UserStatus } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/api-error';

export type SessionContext = {
  ipAddress?: string;
  userAgent?: string;
};

const hashRefreshToken = (token: string) =>
  createHash('sha256').update(`${env.JWT_SECRET}:refresh:${token}`).digest('hex');

const newRefreshToken = () => randomBytes(48).toString('base64url');

const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60_000);

const createStoredToken = async (userId: string, context: SessionContext) => {
  const refreshToken = newRefreshToken();
  const record = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshExpiry(),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent?.slice(0, 500),
    },
  });
  return { refreshToken, record };
};

export const issueRefreshToken = async (userId: string, context: SessionContext) =>
  createStoredToken(userId, context).then(({ refreshToken }) => refreshToken);

export const rotateRefreshToken = async (rawToken: string, context: SessionContext) => {
  const tokenHash = hashRefreshToken(rawToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!existing || existing.revokedAt || existing.expiresAt <= new Date() || existing.user.status !== UserStatus.ACTIVE) {
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  const nextToken = newRefreshToken();
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    // updateMany is intentionally conditional, so simultaneous refreshes can use a token only once.
    const consumed = await tx.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: now, lastUsedAt: now },
    });
    if (consumed.count !== 1) throw new ApiError(401, 'Your session has already been refreshed. Please sign in again.');

    const replacement = await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: hashRefreshToken(nextToken),
        expiresAt: refreshExpiry(),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent?.slice(0, 500),
      },
    });
    await tx.refreshToken.update({ where: { id: existing.id }, data: { replacedById: replacement.id } });
    return replacement;
  });

  return { refreshToken: nextToken, user: existing.user, expiresAt: result.expiresAt };
};

export const revokeRefreshToken = async (rawToken: string | undefined, userId?: string) => {
  if (!rawToken) return 0;
  const result = await prisma.refreshToken.updateMany({
    where: {
      tokenHash: hashRefreshToken(rawToken),
      ...(userId ? { userId } : {}),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
};

export const revokeAllRefreshTokens = async (userId: string) =>
  prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

export const cleanupExpiredSessions = async () =>
  prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });

export type AuthenticatedUser = Pick<User, 'id' | 'fullName' | 'mobile' | 'email' | 'role' | 'familyId' | 'avatarUrl'>;
