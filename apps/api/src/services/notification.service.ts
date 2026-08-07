import { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

type CreateNotificationInput = {
  userId: string;
  title: string;
  body: string;
  channels?: NotificationChannel[];
  metadata?: Record<string, unknown>;
};

const externalChannels = new Set<NotificationChannel>([
  NotificationChannel.SMS,
  NotificationChannel.WHATSAPP,
  NotificationChannel.EMAIL,
]);

const metadataRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const preferredChannels = async (userId: string, requested?: NotificationChannel[]) => {
  const preference = await prisma.notificationPreference.findUnique({ where: { userId } });
  const defaults = [NotificationChannel.IN_APP, NotificationChannel.SMS, NotificationChannel.EMAIL];
  const channels = requested ?? defaults;
  return channels.filter((channel) => {
    if (!preference) return true;
    return channel === NotificationChannel.IN_APP ? preference.inApp
      : channel === NotificationChannel.SMS ? preference.sms
        : channel === NotificationChannel.WHATSAPP ? preference.whatsapp
          : preference.email;
  });
};

const postToConfiguredProvider = async (notification: {
  id: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  user: { mobile: string | null; email: string | null; fullName: string };
  metadata: unknown;
}) => {
  if (!env.NOTIFICATION_WEBHOOK_URL) return false;
  const response = await fetch(env.NOTIFICATION_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      notificationId: notification.id,
      channel: notification.channel,
      recipient: { mobile: notification.user.mobile, email: notification.user.email, name: notification.user.fullName },
      title: notification.title,
      body: notification.body,
      metadata: notification.metadata,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Notification provider returned ${response.status}.`);
  return true;
};

export const createNotifications = async (input: CreateNotificationInput) => {
  const channels = await preferredChannels(input.userId, input.channels);
  if (!channels.length) return [];
  const records = await Promise.all(channels.map((channel) => prisma.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      body: input.body,
      channel,
      status: channel === NotificationChannel.IN_APP ? NotificationStatus.SENT : NotificationStatus.QUEUED,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
    include: { user: { select: { mobile: true, email: true, fullName: true } } },
  })));
  await Promise.all(records.filter((record) => externalChannels.has(record.channel)).map(async (record) => {
    try {
      const delivered = await postToConfiguredProvider(record);
      if (delivered) await prisma.notification.update({ where: { id: record.id }, data: { status: NotificationStatus.SENT } });
    } catch (error) {
      await prisma.notification.update({
        where: { id: record.id },
        data: { status: NotificationStatus.FAILED, metadata: { ...(input.metadata ?? {}), deliveryError: error instanceof Error ? error.message : 'Unknown provider error' } as Prisma.InputJsonValue },
      });
    }
  }));
  return prisma.notification.findMany({ where: { id: { in: records.map((record) => record.id) } }, orderBy: { createdAt: 'asc' } });
};

export const retryNotification = async (notificationId: string) => {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { user: { select: { mobile: true, email: true, fullName: true } } },
  });
  if (!notification) return null;
  if (!externalChannels.has(notification.channel)) return notification;
  await prisma.notification.update({ where: { id: notification.id }, data: { status: NotificationStatus.QUEUED } });
  try {
    const delivered = await postToConfiguredProvider(notification);
    return prisma.notification.update({ where: { id: notification.id }, data: { status: delivered ? NotificationStatus.SENT : NotificationStatus.QUEUED } });
  } catch (error) {
    return prisma.notification.update({
      where: { id: notification.id },
      data: { status: NotificationStatus.FAILED, metadata: { ...metadataRecord(notification.metadata), deliveryError: error instanceof Error ? error.message : 'Unknown provider error' } as Prisma.InputJsonValue },
    });
  }
};
