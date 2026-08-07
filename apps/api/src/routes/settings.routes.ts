import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/auth';
import { notificationPreferenceSchema, settingsSchema } from '../schemas';
import { asyncHandler } from '../utils/async-handler';
import { maskMobile } from '../utils/identifiers';

export const settingsRouter = Router();

const profileInputSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(254).optional(),
  mobile: z.string().optional(),
  employeeId: z.string().trim().max(120).optional(),
  assignedGeography: z.string().trim().max(200).optional(),
});

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const settingsPayload = (
  user: { fullName: string; email: string | null; mobile: string | null; avatarUrl: string | null; district: { name: string } | null },
  preference: { value: Prisma.JsonValue },
  notification: { sms: boolean; whatsapp: boolean; email: boolean; inApp: boolean },
) => {
  const stored = asRecord(preference.value);
  const storedProfile = asRecord(stored.profile);
  return {
    profile: {
      fullName: user.fullName,
      email: user.email,
      mobile: user.mobile ? maskMobile(user.mobile) : null,
      avatarUrl: user.avatarUrl,
      employeeId: typeof storedProfile.employeeId === 'string' ? storedProfile.employeeId : '',
      assignedGeography: user.district?.name ?? '',
    },
    language: stored.language ?? { value: 'English' },
    system: asRecord(stored.system),
    notifications: notification,
  };
};

settingsRouter.use(requireAuth);

settingsRouter.get('/', asyncHandler(async (request, response) => {
  const [user, preference, notification] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: request.auth!.userId }, include: { district: { select: { name: true } } } }),
    prisma.userPreference.upsert({ where: { userId: request.auth!.userId }, update: {}, create: { userId: request.auth!.userId } }),
    prisma.notificationPreference.upsert({ where: { userId: request.auth!.userId }, update: {}, create: { userId: request.auth!.userId } }),
  ]);
  response.json({ data: settingsPayload(user, preference, notification) });
}));

const updateSettings = asyncHandler(async (request, response) => {
  const input = settingsSchema.parse(request.body);
  const profileInput = input.profile && typeof input.profile === 'object' && !Array.isArray(input.profile)
    ? profileInputSchema.parse(input.profile)
    : undefined;
  const notificationInput = input.notifications && typeof input.notifications === 'object' && !Array.isArray(input.notifications)
    ? notificationPreferenceSchema.partial().parse(input.notifications)
    : undefined;
  const { notifications: _notifications, profile: _profile, ...preferenceValues } = input;
  const [existing, currentUser] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId: request.auth!.userId } }),
    prisma.user.findUniqueOrThrow({ where: { id: request.auth!.userId }, include: { district: { select: { name: true } } } }),
  ]);
  const currentPreference = asRecord(existing?.value);
  const storedProfile = asRecord(currentPreference.profile);
  const mergedPreferenceValues = {
    ...currentPreference,
    ...preferenceValues,
    ...(profileInput?.employeeId !== undefined ? { profile: { ...storedProfile, employeeId: profileInput.employeeId } } : {}),
  };
  const userUpdate = {
    ...(profileInput?.fullName ? { fullName: profileInput.fullName } : {}),
    ...(profileInput?.email ? { email: profileInput.email } : {}),
  };
  const [user, preference, notification] = await Promise.all([
    Object.keys(userUpdate).length ? prisma.user.update({ where: { id: request.auth!.userId }, data: userUpdate, include: { district: { select: { name: true } } } }) : Promise.resolve(currentUser),
    prisma.userPreference.upsert({
      where: { userId: request.auth!.userId },
      update: { value: mergedPreferenceValues as Prisma.InputJsonValue },
      create: { userId: request.auth!.userId, value: mergedPreferenceValues as Prisma.InputJsonValue },
    }),
    notificationInput
      ? prisma.notificationPreference.upsert({ where: { userId: request.auth!.userId }, update: notificationInput, create: { userId: request.auth!.userId, ...notificationInput } })
      : prisma.notificationPreference.upsert({ where: { userId: request.auth!.userId }, update: {}, create: { userId: request.auth!.userId } }),
  ]);
  response.json({ data: settingsPayload(user, preference, notification) });
});

settingsRouter.put('/', updateSettings);
settingsRouter.patch('/', updateSettings);
