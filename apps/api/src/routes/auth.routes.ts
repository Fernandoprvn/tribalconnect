import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { createAccessToken, requireAuth } from '../middleware/auth';
import { logoutSchema, otpRequestSchema, otpVerifySchema, refreshTokenSchema } from '../schemas';
import { requestOtp, verifyOtp } from '../services/otp.service';
import { issueRefreshToken, revokeAllRefreshTokens, revokeRefreshToken, rotateRefreshToken } from '../services/session.service';
import { asyncHandler } from '../utils/async-handler';
import { maskMobile, normalizeMobile } from '../utils/identifiers';
import { serializeUser } from '../utils/serializers';

export const authRouter = Router();

const sessionContext = (request: { ip: string; header(name: string): string | undefined }) => ({
  ipAddress: request.ip,
  userAgent: request.header('user-agent'),
});

authRouter.post('/request-otp', asyncHandler(async (request, response) => {
  const input = otpRequestSchema.parse(request.body);
  const result = await requestOtp(input.mobile, input.role);
  response.status(202).json({
    message: 'If an active account exists, an OTP has been sent.',
    mobile: maskMobile(normalizeMobile(input.mobile)),
    expiresAt: result.expiresAt,
    ...(result.developmentCode ? { developmentCode: result.developmentCode } : {}),
  });
}));

authRouter.post('/verify-otp', asyncHandler(async (request, response) => {
  const input = otpVerifySchema.parse(request.body);
  const user = await verifyOtp(input.mobile, input.role, input.code);
  const accessToken = createAccessToken(user);
  const refreshToken = await issueRefreshToken(user.id, sessionContext(request));
  response.json({ accessToken, refreshToken, tokenType: 'Bearer', user: serializeUser(user) });
}));

authRouter.post('/refresh', asyncHandler(async (request, response) => {
  const input = refreshTokenSchema.parse(request.body);
  const { refreshToken, user } = await rotateRefreshToken(input.refreshToken, sessionContext(request));
  response.json({
    accessToken: createAccessToken(user),
    refreshToken,
    tokenType: 'Bearer',
    user: serializeUser(user),
  });
}));

authRouter.post('/logout', asyncHandler(async (request, response) => {
  const input = logoutSchema.parse(request.body ?? {});
  await revokeRefreshToken(input.refreshToken);
  response.status(204).send();
}));

authRouter.post('/logout-all', requireAuth, asyncHandler(async (request, response) => {
  await revokeAllRefreshTokens(request.auth!.userId);
  response.status(204).send();
}));

authRouter.get('/me', requireAuth, asyncHandler(async (request, response) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: request.auth!.userId },
    select: { id: true, fullName: true, mobile: true, email: true, role: true, familyId: true, avatarUrl: true },
  });
  response.json({ user: serializeUser(user) });
}));
