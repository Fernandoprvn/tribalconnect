import { NotificationStatus, Role } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { allowRoles, requireAuth } from '../middleware/auth';
import { notificationPreferenceSchema, notificationSendSchema } from '../schemas';
import { createNotifications, retryNotification } from '../services/notification.service';
import { writeAuditLog } from '../services/audit.service';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';
import { getPagination, pageMeta } from '../utils/pagination';

export const notificationsRouter = Router();

const idSchema = z.string().uuid();

notificationsRouter.use(requireAuth);

const listNotifications = asyncHandler(async (request, response) => {
  const { page, limit, skip } = getPagination(request);
  const status = typeof request.query.status === 'string' && Object.values(NotificationStatus).includes(request.query.status as NotificationStatus)
    ? request.query.status as NotificationStatus
    : undefined;
  const requestedUserId = typeof request.query.userId === 'string' ? idSchema.parse(request.query.userId) : undefined;
  const unread = request.query.unread === 'true' || request.query.read === 'false';
  const userId = request.auth!.role === Role.SUPER_ADMIN && requestedUserId ? requestedUserId : request.auth!.userId;
  const where = { userId, ...(status ? { status } : {}), ...(unread ? { channel: 'IN_APP' as const, readAt: null } : {}) };
  const [notifications, total] = await prisma.$transaction([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.notification.count({ where }),
  ]);
  response.json({ data: notifications, meta: pageMeta(page, limit, total) });
});

notificationsRouter.get('/', listNotifications);
notificationsRouter.get('/history', listNotifications);

notificationsRouter.get('/preferences', asyncHandler(async (request, response) => {
  const preference = await prisma.notificationPreference.upsert({
    where: { userId: request.auth!.userId },
    update: {},
    create: { userId: request.auth!.userId },
  });
  response.json({ data: preference });
}));

notificationsRouter.put('/preferences', asyncHandler(async (request, response) => {
  const input = notificationPreferenceSchema.parse(request.body);
  const preference = await prisma.notificationPreference.upsert({
    where: { userId: request.auth!.userId },
    update: input,
    create: { userId: request.auth!.userId, ...input },
  });
  response.json({ data: preference });
}));

notificationsRouter.patch('/preferences', asyncHandler(async (request, response) => {
  const input = notificationPreferenceSchema.parse(request.body);
  const preference = await prisma.notificationPreference.upsert({
    where: { userId: request.auth!.userId },
    update: input,
    create: { userId: request.auth!.userId, ...input },
  });
  response.json({ data: preference });
}));

notificationsRouter.post('/', allowRoles(Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER), asyncHandler(async (request, response) => {
  const input = notificationSendSchema.parse(request.body);
  const recipient = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, districtId: true } });
  if (!recipient) throw new ApiError(404, 'Notification recipient not found.');
  if (request.auth!.role !== Role.SUPER_ADMIN && request.auth!.districtId !== recipient.districtId) {
    throw new ApiError(403, 'The recipient is outside your assigned district.');
  }
  const notifications = await createNotifications(input);
  await writeAuditLog(request, 'CREATE', 'Notification', notifications[0]?.id ?? input.userId, { userId: input.userId, channels: input.channels });
  response.status(201).json({ data: notifications });
}));

notificationsRouter.patch('/:id/read', asyncHandler(async (request, response) => {
  const notificationId = idSchema.parse(request.params.id);
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification) throw new ApiError(404, 'Notification not found.');
  if (notification.userId !== request.auth!.userId && request.auth!.role !== Role.SUPER_ADMIN) throw new ApiError(403, 'You cannot update this notification.');
  const updated = await prisma.notification.update({ where: { id: notificationId }, data: { status: NotificationStatus.READ, readAt: new Date() } });
  response.json({ data: updated });
}));

notificationsRouter.post('/read-all', asyncHandler(async (request, response) => {
  const result = await prisma.notification.updateMany({
    where: { userId: request.auth!.userId, readAt: null, channel: 'IN_APP' },
    data: { status: NotificationStatus.READ, readAt: new Date() },
  });
  response.json({ data: { updated: result.count } });
}));

notificationsRouter.post('/:id/retry', allowRoles(Role.SUPER_ADMIN), asyncHandler(async (request, response) => {
  const notification = await retryNotification(idSchema.parse(request.params.id));
  if (!notification) throw new ApiError(404, 'Notification not found.');
  response.json({ data: notification });
}));
