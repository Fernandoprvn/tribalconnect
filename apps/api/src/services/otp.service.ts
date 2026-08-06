import bcrypt from 'bcryptjs';
import type { Role, User } from '@prisma/client';
import { UserStatus } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/api-error';
import { normalizeMobile } from '../utils/identifiers';

type OtpRequestResult = { expiresAt: Date; developmentCode?: string };

const generateOtp = () =>
  env.NODE_ENV === 'development' || env.NODE_ENV === 'test'
    ? env.OTP_DEVELOPMENT_CODE
    : `${Math.floor(100000 + Math.random() * 900000)}`;

const deliverOtp = async (mobile: string, code: string, expiresAt: Date) => {
  if (env.OTP_PROVIDER === 'console') {
    if (env.NODE_ENV === 'production') throw new ApiError(503, 'OTP delivery is unavailable.');
    console.info(`OTP requested for ${mobile}: ${code}`);
    return;
  }
  if (!env.OTP_WEBHOOK_URL) throw new ApiError(503, 'OTP delivery is unavailable.');
  const response = await fetch(env.OTP_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'otp',
      recipient: { mobile },
      code,
      expiresAt: expiresAt.toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new ApiError(503, 'OTP delivery service is temporarily unavailable.');
};

export const requestOtp = async (rawMobile: string, role: Role): Promise<OtpRequestResult> => {
  const mobile = normalizeMobile(rawMobile);
  const user = await prisma.user.findUnique({ where: { mobile_role: { mobile, role } } });
  if (!user || user.status !== UserStatus.ACTIVE) {
    // Deliberately indistinguishable from a normal request to avoid account enumeration.
    return { expiresAt: new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60_000) };
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60_000);
  const recentRequests = await prisma.otpChallenge.count({ where: { mobile, role, createdAt: { gte: oneHourAgo } } });
  if (recentRequests >= 5) throw new ApiError(429, 'Too many OTP requests. Please try again in an hour.');

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60_000);
  const challenge = await prisma.$transaction(async (tx) => {
    // A new code invalidates older codes for the same account. `verifiedAt` doubles as a consumed marker.
    await tx.otpChallenge.updateMany({ where: { mobile, role, verifiedAt: null }, data: { verifiedAt: new Date() } });
    return tx.otpChallenge.create({ data: { mobile, role, codeHash: await bcrypt.hash(code, 10), expiresAt } });
  });
  try {
    await deliverOtp(mobile, code, expiresAt);
  } catch (error) {
    // Never leave an OTP valid when its delivery could not be confirmed.
    await prisma.otpChallenge.updateMany({ where: { id: challenge.id, verifiedAt: null }, data: { verifiedAt: new Date() } });
    throw error;
  }

  return { expiresAt, ...(env.NODE_ENV === 'development' || env.NODE_ENV === 'test' ? { developmentCode: code } : {}) };
};

export const verifyOtp = async (rawMobile: string, role: Role, code: string): Promise<User> => {
  const mobile = normalizeMobile(rawMobile);
  const challenge = await prisma.otpChallenge.findFirst({
    where: { mobile, role, verifiedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge || challenge.expiresAt <= new Date()) throw new ApiError(400, 'This OTP has expired. Request a new one.');
  if (challenge.attempts >= 5) throw new ApiError(429, 'Too many incorrect OTP attempts. Request a new code.');

  const matches = await bcrypt.compare(code, challenge.codeHash);
  if (!matches) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    throw new ApiError(400, 'Incorrect OTP.');
  }

  const user = await prisma.user.findUnique({ where: { mobile_role: { mobile, role } } });
  if (!user || user.status !== UserStatus.ACTIVE) throw new ApiError(401, 'This account is unavailable.');
  const consumed = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, verifiedAt: null },
    data: { verifiedAt: new Date() },
  });
  if (consumed.count !== 1) throw new ApiError(400, 'This OTP has already been used. Request a new one.');
  return user;
};
