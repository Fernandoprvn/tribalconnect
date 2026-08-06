import { BackupStatus, Prisma, Role, UserStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { allowPermission, requireAuth } from '../middleware/auth';
import { adminUserSchema, adminUserUpdateSchema, backupSchema, permissionUpdateSchema, settingsSchema } from '../schemas';
import { revokeAllRefreshTokens } from '../services/session.service';
import { writeAuditLog } from '../services/audit.service';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';
import { normalizeMobile } from '../utils/identifiers';
import { getPagination, pageMeta } from '../utils/pagination';
import { serializeUser } from '../utils/serializers';

export const adminRouter = Router();

const idSchema = z.string().uuid();
const userStatusSchema = z.object({ status: z.nativeEnum(UserStatus) });

const defaultPermissions: Array<{ key: string; description: string; roles: Role[] }> = [
  { key: 'families.manage', description: 'Create, update, and submit family records.', roles: [Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER, Role.FIELD_VOLUNTEER] },
  { key: 'schemes.manage', description: 'Create and manage welfare schemes.', roles: [Role.SUPER_ADMIN] },
  { key: 'applications.review', description: 'Review and decide scheme applications.', roles: [Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER] },
  { key: 'villages.manage', description: 'Manage village geography and assignments.', roles: [Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER] },
  { key: 'reports.export', description: 'Export operational reports.', roles: [Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER] },
  { key: 'admin.manage', description: 'Manage users, permissions, settings, and backups.', roles: [Role.SUPER_ADMIN] },
];

const ensurePermissions = async () => Promise.all(defaultPermissions.map((permission) => prisma.permission.upsert({
  where: { key: permission.key },
  update: {},
  create: permission,
})));

const validateUserRelations = async (input: { role?: Role; districtId?: string | null; familyId?: string | null }) => {
  if (input.districtId) {
    const district = await prisma.district.findUnique({ where: { id: input.districtId }, select: { id: true } });
    if (!district) throw new ApiError(422, 'Assigned district was not found.');
  }
  if (input.familyId) {
    const family = await prisma.family.findUnique({ where: { id: input.familyId }, select: { id: true } });
    if (!family) throw new ApiError(422, 'Linked family was not found.');
  }
  if (input.role === Role.FAMILY && !input.familyId) throw new ApiError(422, 'A family portal account must be linked to a family.');
  if (input.role && input.role !== Role.FAMILY && input.familyId) throw new ApiError(422, 'Only family portal accounts may be linked to a family.');
};

const settingsObject = (settings: Array<{ key: string; value: Prisma.JsonValue }>) => Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));

adminRouter.use(requireAuth, allowPermission('admin.manage', Role.SUPER_ADMIN));

adminRouter.get('/users', asyncHandler(async (request, response) => {
  const { page, limit, skip } = getPagination(request);
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
  const role = typeof request.query.role === 'string' && Object.values(Role).includes(request.query.role as Role) ? request.query.role as Role : undefined;
  const status = typeof request.query.status === 'string' && Object.values(UserStatus).includes(request.query.status as UserStatus) ? request.query.status as UserStatus : undefined;
  const districtId = typeof request.query.districtId === 'string' ? idSchema.parse(request.query.districtId) : undefined;
  const where = {
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(districtId ? { districtId } : {}),
    ...(search ? { OR: [{ fullName: { contains: search, mode: 'insensitive' as const } }, { mobile: { contains: search.replace(/\D/g, '') } }, { email: { contains: search, mode: 'insensitive' as const } }] } : {}),
  };
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({ where, include: { district: { select: { id: true, name: true } }, family: { select: { id: true, familyCode: true, headName: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.user.count({ where }),
  ]);
  response.json({ data: users.map((user) => ({ ...serializeUser(user), status: user.status, district: user.district, family: user.family, createdAt: user.createdAt, updatedAt: user.updatedAt })), meta: pageMeta(page, limit, total) });
}));

adminRouter.post('/users', asyncHandler(async (request, response) => {
  const input = adminUserSchema.parse(request.body);
  await validateUserRelations(input);
  const user = await prisma.user.create({
    data: { ...input, mobile: normalizeMobile(input.mobile) },
    include: { district: { select: { id: true, name: true } }, family: { select: { id: true, familyCode: true, headName: true } } },
  });
  await writeAuditLog(request, 'CREATE', 'User', user.id, { role: user.role });
  response.status(201).json({ data: { ...serializeUser(user), status: user.status, district: user.district, family: user.family } });
}));

adminRouter.patch('/users/:id', asyncHandler(async (request, response) => {
  const userId = idSchema.parse(request.params.id);
  const existing = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const input = adminUserUpdateSchema.parse(request.body);
  const next = { role: input.role ?? existing.role, districtId: input.districtId === undefined ? existing.districtId : input.districtId, familyId: input.familyId === undefined ? existing.familyId : input.familyId };
  await validateUserRelations(next);
  const user = await prisma.user.update({
    where: { id: userId },
    data: { ...input, ...(input.mobile ? { mobile: normalizeMobile(input.mobile) } : {}) },
    include: { district: { select: { id: true, name: true } }, family: { select: { id: true, familyCode: true, headName: true } } },
  });
  if (input.role || input.status && input.status !== UserStatus.ACTIVE) await revokeAllRefreshTokens(userId);
  await writeAuditLog(request, 'UPDATE', 'User', userId, { fields: Object.keys(input) });
  response.json({ data: { ...serializeUser(user), status: user.status, district: user.district, family: user.family } });
}));

adminRouter.post('/users/:id/status', asyncHandler(async (request, response) => {
  const userId = idSchema.parse(request.params.id);
  const input = userStatusSchema.parse(request.body);
  if (userId === request.auth!.userId && input.status !== UserStatus.ACTIVE) throw new ApiError(409, 'You cannot deactivate your own account.');
  const user = await prisma.user.update({ where: { id: userId }, data: { status: input.status } });
  if (input.status !== UserStatus.ACTIVE) await revokeAllRefreshTokens(userId);
  await writeAuditLog(request, 'STATUS_CHANGE', 'User', userId, { status: input.status });
  response.json({ data: { ...serializeUser(user), status: user.status } });
}));

adminRouter.get('/permissions', asyncHandler(async (_request, response) => {
  const permissions = await ensurePermissions();
  response.json({ data: permissions });
}));

adminRouter.patch('/permissions/:id', asyncHandler(async (request, response) => {
  const permissionId = z.string().min(1).max(120).parse(request.params.id);
  const input = permissionUpdateSchema.parse(request.body);
  const permission = await prisma.permission.findFirst({ where: { OR: [{ id: permissionId }, { key: permissionId }] } });
  if (!permission) throw new ApiError(404, 'Permission not found.');
  const updated = await prisma.permission.update({ where: { id: permission.id }, data: { ...input, updatedById: request.auth!.userId } });
  await writeAuditLog(request, 'UPDATE', 'Permission', updated.id, { key: updated.key, roles: updated.roles });
  response.json({ data: updated });
}));

const auditLogsHandler = asyncHandler(async (request, response) => {
  const { page, limit, skip } = getPagination(request);
  const entityType = typeof request.query.entityType === 'string' ? request.query.entityType.slice(0, 120) : undefined;
  const actorId = typeof request.query.actorId === 'string' ? idSchema.parse(request.query.actorId) : undefined;
  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({ where: { ...(entityType ? { entityType } : {}), ...(actorId ? { actorId } : {}) }, include: { actor: { select: { id: true, fullName: true, role: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.auditLog.count({ where: { ...(entityType ? { entityType } : {}), ...(actorId ? { actorId } : {}) } }),
  ]);
  response.json({ data: logs, meta: pageMeta(page, limit, total) });
});
adminRouter.get('/audit-logs', auditLogsHandler);
adminRouter.get('/activity-logs', auditLogsHandler);

adminRouter.get('/settings', asyncHandler(async (_request, response) => {
  const settings = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  response.json({ data: settingsObject(settings) });
}));

const updateSettings = asyncHandler(async (request, response) => {
  const input = settingsSchema.parse(request.body);
  const entries = Object.entries(input);
  if (entries.length) {
    await prisma.$transaction(entries.map(([key, value]) => prisma.systemSetting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue, updatedById: request.auth!.userId },
      create: { key, value: value as Prisma.InputJsonValue, updatedById: request.auth!.userId },
    })));
  }
  const settings = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
  await writeAuditLog(request, 'UPDATE', 'SystemSetting', 'settings', { keys: entries.map(([key]) => key) });
  response.json({ data: settingsObject(settings) });
});
adminRouter.put('/settings', updateSettings);
adminRouter.patch('/settings', updateSettings);

adminRouter.get('/backups', asyncHandler(async (request, response) => {
  const { page, limit, skip } = getPagination(request);
  const [backups, total] = await prisma.$transaction([
    prisma.backupRecord.findMany({ include: { createdBy: { select: { id: true, fullName: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.backupRecord.count(),
  ]);
  response.json({ data: backups, meta: pageMeta(page, limit, total) });
}));

adminRouter.post('/backups', asyncHandler(async (request, response) => {
  const input = backupSchema.parse(request.body ?? {});
  const [settings, userCount, familyCount, schemeCount, applicationCount] = await Promise.all([
    prisma.systemSetting.findMany({ select: { key: true, value: true } }),
    prisma.user.count(),
    prisma.family.count(),
    prisma.scheme.count(),
    prisma.schemeApplication.count(),
  ]);
  const backup = await prisma.backupRecord.create({
    data: {
      label: input.label ?? `Configuration snapshot ${new Date().toISOString()}`,
      createdById: request.auth!.userId,
      snapshot: { settings } as Prisma.InputJsonValue,
      summary: { userCount, familyCount, schemeCount, applicationCount, scope: 'system-settings-and-record-counts' } as Prisma.InputJsonValue,
    },
  });
  await writeAuditLog(request, 'CREATE', 'BackupRecord', backup.id, { label: backup.label });
  response.status(201).json({ data: backup });
}));

adminRouter.post('/backups/:id/restore', asyncHandler(async (request, response) => {
  const backupId = idSchema.parse(request.params.id);
  const backup = await prisma.backupRecord.findUnique({ where: { id: backupId } });
  if (!backup) throw new ApiError(404, 'Backup record not found.');
  const snapshot = backup.snapshot as { settings?: Array<{ key: string; value: Prisma.JsonValue }> } | null;
  if (!snapshot?.settings) throw new ApiError(409, 'This backup does not contain a restorable settings snapshot.');
  await prisma.$transaction(snapshot.settings.map((setting) => prisma.systemSetting.upsert({
    where: { key: setting.key },
    update: { value: setting.value as Prisma.InputJsonValue, updatedById: request.auth!.userId },
    create: { key: setting.key, value: setting.value as Prisma.InputJsonValue, updatedById: request.auth!.userId },
  })));
  const updated = await prisma.backupRecord.update({ where: { id: backupId }, data: { status: BackupStatus.RESTORED, restoredAt: new Date() } });
  await writeAuditLog(request, 'RESTORE', 'BackupRecord', backupId, { scope: 'system-settings' });
  response.json({ data: updated, message: 'System settings were restored. Database-level recovery remains a PostgreSQL operations task.' });
}));
