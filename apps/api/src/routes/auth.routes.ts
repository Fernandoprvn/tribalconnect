import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import { prisma } from '../lib/prisma';
import { createAccessToken, requireAuth } from '../middleware/auth';
import { loginSchema } from '../schemas';
import { issueRefreshToken, revokeAllRefreshTokens, revokeRefreshToken, rotateRefreshToken, type AuthenticatedUser } from '../services/session.service';
import { asyncHandler } from '../utils/async-handler';
import { ApiError } from '../utils/api-error';
import { serializeUser } from '../utils/serializers';

export const authRouter = Router();
const refreshCookie = 'tribalconnect_refresh';
const sessionContext = (request: { ip?: string; header(name: string): string | undefined }) => ({ ipAddress: request.ip ?? 'unknown', userAgent: request.header('user-agent') });
const readCookie = (value: string | undefined, name: string) => value?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
const cookieOptions = (persistent = false) => ({ httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/api/auth', ...(persistent ? { maxAge: 30 * 24 * 60 * 60_000 } : {}) });

const sendSession = (response: Response, user: AuthenticatedUser, refreshToken: string, persistent: boolean) => {
  response.cookie(refreshCookie, refreshToken, cookieOptions(persistent));
  response.json({ accessToken: createAccessToken(user), tokenType: 'Bearer', user: serializeUser(user) });
};

authRouter.post('/login', asyncHandler(async (request, response) => {
  const input = loginSchema.parse(request.body);
  const identifier = input.identifier.toLowerCase();
  const user = await prisma.user.findFirst({ where: { OR: [{ username: identifier }, { email: identifier }] } });
  if (!user || user.status !== 'ACTIVE' || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new ApiError(401, 'Invalid username/email or password.');
  }
  const refreshToken = await issueRefreshToken(user.id, sessionContext(request));
  sendSession(response, user, refreshToken, input.rememberMe);
}));

authRouter.post('/refresh', asyncHandler(async (request, response) => {
  const rawToken = readCookie(request.header('cookie'), refreshCookie);
  if (!rawToken) throw new ApiError(401, 'Your session has expired. Please sign in again.');
  const { refreshToken, user } = await rotateRefreshToken(rawToken, sessionContext(request));
  sendSession(response, user, refreshToken, true);
}));

authRouter.post('/logout', asyncHandler(async (request, response) => {
  await revokeRefreshToken(readCookie(request.header('cookie'), refreshCookie));
  response.clearCookie(refreshCookie, cookieOptions());
  response.status(204).send();
}));

authRouter.post('/logout-all', requireAuth, asyncHandler(async (request, response) => {
  await revokeAllRefreshTokens(request.auth!.userId);
  response.clearCookie(refreshCookie, cookieOptions());
  response.status(204).send();
}));

authRouter.get('/me', requireAuth, asyncHandler(async (request, response) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: request.auth!.userId }, select: { id: true, fullName: true, username: true, mobile: true, email: true, role: true, familyId: true, avatarUrl: true } });
  response.json({ user: serializeUser(user) });
}));
