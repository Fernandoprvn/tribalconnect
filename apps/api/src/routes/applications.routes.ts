import { ApplicationStatus, Prisma, Role, SchemeStatus, WorkflowStage } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { allowPermission, requireAuth } from '../middleware/auth';
import { applicationCreateSchema, applicationStatusSchema } from '../schemas';
import { writeAuditLog } from '../services/audit.service';
import { evaluateSchemeEligibility } from '../services/eligibility.service';
import { ensureFamilyAccess, withFamilyScope } from '../services/family-access.service';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';
import { identifier } from '../utils/identifiers';
import { getPagination, pageMeta } from '../utils/pagination';

export const applicationsRouter = Router();

const idSchema = z.string().uuid();
const jsonSnapshot = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const applicationInclude = {
  family: {
    select: {
      id: true,
      familyCode: true,
      headName: true,
      mobile: true,
      aadhaarMasked: true,
      tribalCommunity: true,
      district: { select: { id: true, name: true } },
      village: { select: { id: true, name: true } },
      assignedOfficer: { select: { id: true, fullName: true } },
    },
  },
  scheme: { select: { id: true, code: true, name: true, department: true, status: true, benefits: true } },
  statusEvents: { orderBy: { createdAt: 'desc' as const } },
} as const;

const allowedTransitions: Record<ApplicationStatus, ApplicationStatus[]> = {
  [ApplicationStatus.RECOMMENDED]: [ApplicationStatus.SUBMITTED, ApplicationStatus.REJECTED],
  [ApplicationStatus.SUBMITTED]: [ApplicationStatus.UNDER_REVIEW, ApplicationStatus.REJECTED],
  [ApplicationStatus.UNDER_REVIEW]: [ApplicationStatus.APPROVED, ApplicationStatus.REJECTED],
  [ApplicationStatus.APPROVED]: [ApplicationStatus.BENEFIT_RECEIVED],
  [ApplicationStatus.REJECTED]: [],
  [ApplicationStatus.BENEFIT_RECEIVED]: [],
};

const parseStatuses = (value: unknown) =>
  typeof value === 'string'
    ? value.split(',').filter((status): status is ApplicationStatus => Object.values(ApplicationStatus).includes(status as ApplicationStatus))
    : [];

applicationsRouter.use(requireAuth);

applicationsRouter.get('/', asyncHandler(async (request, response) => {
  const { page, limit, skip } = getPagination(request);
  const familyId = typeof request.query.familyId === 'string' ? idSchema.parse(request.query.familyId) : undefined;
  const schemeId = typeof request.query.schemeId === 'string' ? idSchema.parse(request.query.schemeId) : undefined;
  const districtId = typeof request.query.districtId === 'string' ? idSchema.parse(request.query.districtId) : undefined;
  const villageId = typeof request.query.villageId === 'string' ? idSchema.parse(request.query.villageId) : undefined;
  const officerId = typeof request.query.officerId === 'string' ? idSchema.parse(request.query.officerId) : undefined;
  const statuses = parseStatuses(request.query.status);
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
  const familyWhere = withFamilyScope(request, {
    ...(familyId ? { id: familyId } : {}),
    ...(districtId ? { districtId } : {}),
    ...(villageId ? { villageId } : {}),
    ...(officerId ? { assignedOfficerId: officerId } : {}),
  });
  const where: Prisma.SchemeApplicationWhereInput = {
    family: familyWhere,
    ...(schemeId ? { schemeId } : {}),
    ...(statuses.length ? { status: { in: statuses } } : {}),
    ...(search ? {
      OR: [
        { applicationNumber: { contains: search, mode: 'insensitive' } },
        { family: { headName: { contains: search, mode: 'insensitive' } } },
        { scheme: { name: { contains: search, mode: 'insensitive' } } },
      ],
    } : {}),
  };
  const [applications, total] = await prisma.$transaction([
    prisma.schemeApplication.findMany({ where, include: applicationInclude, orderBy: { updatedAt: 'desc' }, skip, take: limit }),
    prisma.schemeApplication.count({ where }),
  ]);
  response.json({ data: applications, meta: pageMeta(page, limit, total) });
}));

applicationsRouter.post('/', asyncHandler(async (request, response) => {
  const input = applicationCreateSchema.parse(request.body);
  const [family, scheme] = await Promise.all([
    prisma.family.findUnique({ where: { id: input.familyId }, include: { income: true, members: true } }),
    prisma.scheme.findUnique({ where: { id: input.schemeId } }),
  ]);
  if (!family || !scheme) throw new ApiError(404, 'Family or scheme not found.');
  ensureFamilyAccess(request, family);
  if (scheme.status !== SchemeStatus.ACTIVE) throw new ApiError(409, 'Only active schemes can receive applications.');
  const eligibility = evaluateSchemeEligibility(family, scheme);
  if (!eligibility.eligible) {
    throw new ApiError(422, 'This family does not meet the scheme eligibility criteria.', eligibility);
  }
  const isFamilyPortal = request.auth!.role === Role.FAMILY;
  const initialStatus = isFamilyPortal ? ApplicationStatus.SUBMITTED : ApplicationStatus.RECOMMENDED;
  const application = await prisma.schemeApplication.create({
    data: {
      applicationNumber: identifier('APP'),
      familyId: family.id,
      schemeId: scheme.id,
      status: initialStatus,
      eligibilitySnapshot: jsonSnapshot(eligibility),
      notes: input.notes,
      submittedById: request.auth!.userId,
      ...(initialStatus === ApplicationStatus.SUBMITTED ? { submittedAt: new Date() } : {}),
      statusEvents: { create: { status: initialStatus, note: input.notes, actorId: request.auth!.userId } },
      workflowEvents: {
        create: {
          familyId: family.id,
          stage: initialStatus === ApplicationStatus.SUBMITTED ? WorkflowStage.APPLICATION_SUBMITTED : WorkflowStage.SCHEME_RECOMMENDATION,
          title: initialStatus === ApplicationStatus.SUBMITTED ? 'Scheme application submitted' : 'Scheme application recommended',
          actorId: request.auth!.userId,
        },
      },
    },
    include: applicationInclude,
  });
  await writeAuditLog(request, 'CREATE', 'SchemeApplication', application.id, { familyId: family.id, schemeId: scheme.id });
  response.status(201).json({ data: application });
}));

applicationsRouter.get('/:id', asyncHandler(async (request, response) => {
  const application = await prisma.schemeApplication.findUnique({ where: { id: idSchema.parse(request.params.id) }, include: applicationInclude });
  if (!application) throw new ApiError(404, 'Application not found.');
  const family = await prisma.family.findUniqueOrThrow({ where: { id: application.familyId } });
  ensureFamilyAccess(request, family);
  response.json({ data: application });
}));

applicationsRouter.get('/:id/history', asyncHandler(async (request, response) => {
  const application = await prisma.schemeApplication.findUnique({
    where: { id: idSchema.parse(request.params.id) },
    include: { family: true, statusEvents: { orderBy: { createdAt: 'asc' } }, workflowEvents: { orderBy: { createdAt: 'asc' } } },
  });
  if (!application) throw new ApiError(404, 'Application not found.');
  ensureFamilyAccess(request, application.family);
  response.json({ data: { applicationId: application.id, statuses: application.statusEvents, workflow: application.workflowEvents } });
}));

applicationsRouter.post('/:id/status', allowPermission('applications.review', Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER), asyncHandler(async (request, response) => {
  const applicationId = idSchema.parse(request.params.id);
  const input = applicationStatusSchema.parse(request.body);
  const application = await prisma.schemeApplication.findUnique({ where: { id: applicationId }, include: { family: true } });
  if (!application) throw new ApiError(404, 'Application not found.');
  ensureFamilyAccess(request, application.family);
  if (!allowedTransitions[application.status].includes(input.status)) {
    throw new ApiError(409, `Cannot move an application from ${application.status} to ${input.status}.`);
  }
  if (input.status === ApplicationStatus.REJECTED && !input.rejectionReason) {
    throw new ApiError(422, 'A rejection reason is required.');
  }
  const now = new Date();
  const updated = await prisma.schemeApplication.update({
    where: { id: applicationId },
    data: {
      status: input.status,
      ...(input.status === ApplicationStatus.SUBMITTED ? { submittedAt: now } : {}),
      ...(input.status === ApplicationStatus.APPROVED || input.status === ApplicationStatus.REJECTED ? { decidedAt: now } : {}),
      ...(input.status === ApplicationStatus.REJECTED ? { rejectionReason: input.rejectionReason } : {}),
      ...(input.status === ApplicationStatus.BENEFIT_RECEIVED ? { benefitReceivedAt: now } : {}),
      statusEvents: { create: { status: input.status, note: input.note ?? input.rejectionReason, actorId: request.auth!.userId } },
      workflowEvents: {
        create: {
          familyId: application.familyId,
          stage: input.status === ApplicationStatus.BENEFIT_RECEIVED
            ? WorkflowStage.BENEFIT_RECEIVED
            : input.status === ApplicationStatus.REJECTED
              ? WorkflowStage.REJECTED
              : input.status === ApplicationStatus.SUBMITTED
                ? WorkflowStage.APPLICATION_SUBMITTED
                : WorkflowStage.SCHEME_RECOMMENDATION,
          title: `Application status changed to ${input.status.replaceAll('_', ' ').toLowerCase()}`,
          note: input.note ?? input.rejectionReason,
          actorId: request.auth!.userId,
        },
      },
    },
    include: applicationInclude,
  });
  await writeAuditLog(request, 'STATUS_CHANGE', 'SchemeApplication', applicationId, { status: input.status });
  response.json({ data: updated });
}));

applicationsRouter.get('/:id/approval-letter', asyncHandler(async (request, response) => {
  const application = await prisma.schemeApplication.findUnique({
    where: { id: idSchema.parse(request.params.id) },
    include: { family: true, scheme: true },
  });
  if (!application) throw new ApiError(404, 'Application not found.');
  ensureFamilyAccess(request, application.family);
  if (application.status !== ApplicationStatus.APPROVED && application.status !== ApplicationStatus.BENEFIT_RECEIVED) {
    throw new ApiError(409, 'An approval letter is available only after approval.');
  }
  const filename = `approval-letter-${application.applicationNumber}.pdf`;
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const document = new PDFDocument({ margin: 56, size: 'A4' });
  document.pipe(response);
  document.fontSize(19).text('TribalConnect', { align: 'center' });
  document.moveDown(0.4).fontSize(14).text('Scheme Approval Letter', { align: 'center' });
  document.moveDown(2).fontSize(11).text(`Application number: ${application.applicationNumber}`);
  document.text(`Date: ${(application.decidedAt ?? application.updatedAt).toLocaleDateString('en-IN')}`);
  document.moveDown().text(`Dear ${application.family.headName},`);
  document.moveDown().text(`Your application for ${application.scheme.name} has been approved.`);
  document.moveDown().text(`Family code: ${application.family.familyCode}`);
  document.text(`Scheme code: ${application.scheme.code}`);
  document.moveDown().text('Please contact your Development Officer for benefit disbursement and any next steps.');
  document.moveDown(3).text('This is a system-generated letter.', { align: 'center' });
  document.end();
}));
