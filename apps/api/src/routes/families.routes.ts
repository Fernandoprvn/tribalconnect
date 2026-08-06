import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { DocumentStatus, DocumentType, FamilyStatus, Prisma, Role, SchemeStatus, UserStatus, VisitStatus, WorkflowStage } from '@prisma/client';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { allowPermission, allowRoles, requireAuth } from '../middleware/auth';
import {
  documentVerificationSchema,
  familyCreateSchema,
  familyStatusSchema,
  familyUpdateSchema,
  fieldVisitSchema,
} from '../schemas';
import { writeAuditLog } from '../services/audit.service';
import { evaluateSchemeEligibility } from '../services/eligibility.service';
import { ensureDistrictAccess, ensureFamilyAccess, familyDetailInclude, sanitizeFamily, withFamilyScope } from '../services/family-access.service';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';
import { hashAadhaar, identifier, maskAadhaar } from '../utils/identifiers';
import { getPagination, pageMeta } from '../utils/pagination';

export const familiesRouter = Router();

const idSchema = z.string().uuid();
const privilegedRoles = [Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER, Role.FIELD_VOLUNTEER];

const uploadDirectory = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadDirectory, { recursive: true });
const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, uploadDirectory),
    filename: (_request, file, callback) => callback(null, `${Date.now()}-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    callback(null, allowed.includes(file.mimetype));
  },
});

const statusToStage: Record<FamilyStatus, WorkflowStage> = {
  [FamilyStatus.DRAFT]: WorkflowStage.SUBMITTED,
  [FamilyStatus.SUBMITTED]: WorkflowStage.SUBMITTED,
  [FamilyStatus.DOCUMENT_VERIFICATION]: WorkflowStage.DOCUMENT_VERIFICATION,
  [FamilyStatus.FIELD_VISIT]: WorkflowStage.FIELD_VISIT,
  [FamilyStatus.APPROVED]: WorkflowStage.APPROVAL,
  [FamilyStatus.REJECTED]: WorkflowStage.REJECTED,
};

const allowedFamilyTransitions: Record<FamilyStatus, FamilyStatus[]> = {
  [FamilyStatus.DRAFT]: [FamilyStatus.SUBMITTED],
  [FamilyStatus.SUBMITTED]: [FamilyStatus.DOCUMENT_VERIFICATION, FamilyStatus.REJECTED],
  [FamilyStatus.DOCUMENT_VERIFICATION]: [FamilyStatus.FIELD_VISIT, FamilyStatus.REJECTED],
  [FamilyStatus.FIELD_VISIT]: [FamilyStatus.APPROVED, FamilyStatus.REJECTED],
  [FamilyStatus.APPROVED]: [],
  [FamilyStatus.REJECTED]: [],
};

const familyListInclude = {
  district: { select: { id: true, name: true, code: true } },
  village: { select: { id: true, name: true, hamlet: true } },
  assignedOfficer: { select: { id: true, fullName: true } },
  income: { select: { annualIncome: true, primaryOccupation: true, houseType: true } },
  _count: { select: { members: true, documents: true, applications: true } },
} as const;

const getFamilyForRequest = async (requestId: string, request: Parameters<typeof ensureFamilyAccess>[0]) => {
  const family = await prisma.family.findUnique({ where: { id: requestId }, include: familyDetailInclude });
  if (!family) throw new ApiError(404, 'Family not found.');
  ensureFamilyAccess(request, family);
  return family;
};

const assertListFilterScope = async (request: Parameters<typeof ensureFamilyAccess>[0], districtId?: string, villageId?: string) => {
  if (request.auth!.role === Role.SUPER_ADMIN) return;
  if (request.auth!.role === Role.FAMILY) {
    if (!request.auth!.familyId) throw new ApiError(403, 'No family profile is linked to this account.');
    const ownFamily = await prisma.family.findUnique({ where: { id: request.auth!.familyId }, select: { districtId: true, villageId: true } });
    if (!ownFamily) throw new ApiError(403, 'No family profile is linked to this account.');
    if (districtId && districtId !== ownFamily.districtId) throw new ApiError(403, 'That district is outside your assigned scope.');
    if (villageId && villageId !== ownFamily.villageId) throw new ApiError(403, 'That village is outside your assigned scope.');
    return;
  }
  if (!request.auth!.districtId) throw new ApiError(403, 'Your account is not assigned to a district.');
  if (districtId && districtId !== request.auth!.districtId) throw new ApiError(403, 'That district is outside your assigned scope.');
  if (villageId) {
    const village = await prisma.village.findUnique({ where: { id: villageId }, select: { districtId: true } });
    if (!village || village.districtId !== request.auth!.districtId) throw new ApiError(403, 'That village is outside your assigned scope.');
  }
};

type MemberIdentity = {
  id?: string;
  name: string;
  gender: string;
  dateOfBirth?: Date | null;
  age?: number | null;
  relationship: string;
};

const memberIdentity = (member: MemberIdentity) => [
  member.name.trim().toLocaleLowerCase(),
  member.gender,
  member.dateOfBirth?.toISOString().slice(0, 10) ?? '',
  member.dateOfBirth ? '' : member.age ?? '',
  member.relationship.trim().toLocaleLowerCase(),
].join('|');

const memberSecondaryIdentity = (member: MemberIdentity) => [
  member.gender,
  member.dateOfBirth?.toISOString().slice(0, 10) ?? '',
  member.dateOfBirth ? '' : member.age ?? '',
  member.relationship.trim().toLocaleLowerCase(),
].join('|');

familiesRouter.use(requireAuth);

familiesRouter.get('/', asyncHandler(async (request, response) => {
  const { page, limit, skip } = getPagination(request);
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
  const districtId = typeof request.query.districtId === 'string' ? idSchema.parse(request.query.districtId) : undefined;
  const villageId = typeof request.query.villageId === 'string' ? idSchema.parse(request.query.villageId) : undefined;
  const statusInput = typeof request.query.status === 'string' ? request.query.status.split(',') : [];
  const statuses = statusInput.filter((status): status is FamilyStatus => Object.values(FamilyStatus).includes(status as FamilyStatus));
  await assertListFilterScope(request, districtId, villageId);
  const filters: Prisma.FamilyWhereInput = {
    ...(districtId ? { districtId } : {}),
    ...(villageId ? { villageId } : {}),
    ...(statuses.length ? { status: { in: statuses } } : {}),
  };

  if (search) {
    const mobileSearch = search.replace(/\D/g, '');
    filters.OR = [
      { familyCode: { contains: search, mode: 'insensitive' } },
      { headName: { contains: search, mode: 'insensitive' } },
      { mobile: { contains: mobileSearch || search } },
      { village: { name: { contains: search, mode: 'insensitive' } } },
      ...(mobileSearch.length === 12 ? [{ aadhaarHash: hashAadhaar(mobileSearch) }] : []),
    ];
  }
  const where = withFamilyScope(request, filters);

  const [families, total] = await prisma.$transaction([
    prisma.family.findMany({ where, include: familyListInclude, orderBy: { updatedAt: 'desc' }, skip, take: limit }),
    prisma.family.count({ where }),
  ]);
  response.json({ data: families.map(sanitizeFamily), meta: pageMeta(page, limit, total) });
}));

familiesRouter.post('/', allowPermission('families.manage', ...privilegedRoles), asyncHandler(async (request, response) => {
  const input = familyCreateSchema.parse(request.body);
  ensureDistrictAccess(request, input.districtId);
  const village = await prisma.village.findFirst({ where: { id: input.villageId, districtId: input.districtId }, select: { id: true } });
  if (!village) throw new ApiError(422, 'The selected village does not belong to the selected district.');

  const { aadhaarNumber, members, income, ...familyInput } = input;
  const { bankAccountNumber, ...incomeInput } = income;
  const family = await prisma.family.create({
    data: {
      ...familyInput,
      familyCode: identifier('FAM'),
      aadhaarHash: hashAadhaar(aadhaarNumber),
      aadhaarMasked: maskAadhaar(aadhaarNumber),
      assignedOfficerId: request.auth!.role === Role.DEVELOPMENT_OFFICER ? request.auth!.userId : undefined,
      members: {
        create: members.map(({ aadhaarNumber: memberAadhaar, ...member }) => ({
          ...member,
          ...(memberAadhaar ? { aadhaarHash: hashAadhaar(memberAadhaar), aadhaarMasked: maskAadhaar(memberAadhaar) } : {}),
        })),
      },
      income: {
        create: {
          ...incomeInput,
          ...(bankAccountNumber ? { bankAccountLast4: bankAccountNumber.slice(-4) } : {}),
        },
      },
      workflowEvents: {
        create: {
          stage: WorkflowStage.SUBMITTED,
          title: 'Family profile created',
          note: 'Profile saved as draft.',
          actorId: request.auth!.userId,
        },
      },
    },
    include: familyDetailInclude,
  });
  await writeAuditLog(request, 'CREATE', 'Family', family.id, { familyCode: family.familyCode });
  response.status(201).json({ data: sanitizeFamily(family) });
}));

familiesRouter.get('/:id', asyncHandler(async (request, response) => {
  const family = await getFamilyForRequest(idSchema.parse(request.params.id), request);
  response.json({ data: sanitizeFamily(family) });
}));

familiesRouter.patch('/:id', allowPermission('families.manage', ...privilegedRoles), asyncHandler(async (request, response) => {
  const familyId = idSchema.parse(request.params.id);
  const existing = await getFamilyForRequest(familyId, request);
  const input = familyUpdateSchema.parse(request.body);
  const { aadhaarNumber, members, income, ...familyInput } = input;
  const nextDistrictId = familyInput.districtId ?? existing.districtId;
  const nextVillageId = familyInput.villageId ?? existing.villageId;
  ensureDistrictAccess(request, nextDistrictId);
  if (nextDistrictId !== existing.districtId || nextVillageId !== existing.villageId) {
    const village = await prisma.village.findFirst({ where: { id: nextVillageId, districtId: nextDistrictId }, select: { id: true } });
    if (!village) throw new ApiError(422, 'The selected village does not belong to the selected district.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.family.update({
      where: { id: familyId },
      data: {
        ...familyInput,
        ...(aadhaarNumber ? { aadhaarHash: hashAadhaar(aadhaarNumber), aadhaarMasked: maskAadhaar(aadhaarNumber) } : {}),
      },
    });
    if (members) {
      const storedMembers = await tx.familyMember.findMany({
        where: { familyId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, gender: true, dateOfBirth: true, age: true, relationship: true, aadhaarHash: true, aadhaarMasked: true },
      });
      const usedMemberIds = new Set<string>();
      const memberData = members.map(({ id: suppliedMemberId, aadhaarNumber: memberAadhaar, ...member }, index) => {
        let prior = suppliedMemberId ? storedMembers.find((candidate) => candidate.id === suppliedMemberId) : undefined;
        if (suppliedMemberId && !prior) throw new ApiError(422, 'A household member identifier does not belong to this family.');
        if (prior && usedMemberIds.has(prior.id)) throw new ApiError(422, 'A household member may only be included once.');
        if (!prior) prior = storedMembers.find((candidate) => !usedMemberIds.has(candidate.id) && memberIdentity(candidate) === memberIdentity(member));
        if (!prior) {
          const secondaryMatches = storedMembers.filter((candidate) => !usedMemberIds.has(candidate.id) && memberSecondaryIdentity(candidate) === memberSecondaryIdentity(member));
          if (secondaryMatches.length === 1) prior = secondaryMatches[0];
        }
        // The edit UI deliberately omits protected Aadhaar values. Positional matching
        // is the final compatibility fallback for an unchanged member list.
        if (!prior && storedMembers.length === members.length && storedMembers[index] && !usedMemberIds.has(storedMembers[index].id)) {
          prior = storedMembers[index];
        }
        if (prior) usedMemberIds.add(prior.id);
        return {
          familyId,
          ...member,
          ...(memberAadhaar
            ? { aadhaarHash: hashAadhaar(memberAadhaar), aadhaarMasked: maskAadhaar(memberAadhaar) }
            : prior?.aadhaarHash
              ? { aadhaarHash: prior.aadhaarHash, aadhaarMasked: prior.aadhaarMasked }
              : {}),
        };
      });
      await tx.familyMember.deleteMany({ where: { familyId } });
      await tx.familyMember.createMany({ data: memberData });
    }
    if (income) {
      const { bankAccountNumber, ...incomeInput } = income;
      const incomeData = {
        ...incomeInput,
        ...(bankAccountNumber ? { bankAccountLast4: bankAccountNumber.slice(-4) } : {}),
      };
      await tx.familyIncome.upsert({
        where: { familyId },
        update: incomeData,
        create: { familyId, ...incomeData, annualIncome: income.annualIncome ?? 0 },
      });
    }
  });
  const updated = await getFamilyForRequest(familyId, request);
  await writeAuditLog(request, 'UPDATE', 'Family', familyId);
  response.json({ data: sanitizeFamily(updated) });
}));

familiesRouter.post('/:id/submit', allowPermission('families.manage', ...privilegedRoles), asyncHandler(async (request, response) => {
  const familyId = idSchema.parse(request.params.id);
  const family = await getFamilyForRequest(familyId, request);
  if (family.status !== FamilyStatus.DRAFT) throw new ApiError(409, 'Only draft family profiles can be submitted.');
  const requiredDocuments = [DocumentType.AADHAAR, DocumentType.COMMUNITY_CERTIFICATE, DocumentType.INCOME_CERTIFICATE];
  const missingDocuments = requiredDocuments.filter((type) => !family.documents.some((document) => document.type === type));
  if (!family.members.length || !family.income || missingDocuments.length) {
    throw new ApiError(422, 'Complete the household, income, and required document sections before submitting.', {
      missingMembers: !family.members.length,
      missingIncome: !family.income,
      missingDocuments,
    });
  }
  const updated = await prisma.family.update({
    where: { id: familyId },
    data: {
      status: FamilyStatus.SUBMITTED,
      submittedAt: new Date(),
      workflowEvents: { create: { stage: WorkflowStage.SUBMITTED, title: 'Family onboarding submitted', actorId: request.auth!.userId } },
    },
    include: familyDetailInclude,
  });
  await writeAuditLog(request, 'SUBMIT', 'Family', familyId);
  response.json({ data: sanitizeFamily(updated) });
}));

familiesRouter.post('/:id/status', allowRoles(Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER), asyncHandler(async (request, response) => {
  const familyId = idSchema.parse(request.params.id);
  const family = await getFamilyForRequest(familyId, request);
  const input = familyStatusSchema.parse(request.body);
  if (!allowedFamilyTransitions[family.status].includes(input.status)) {
    throw new ApiError(409, `Cannot move a ${family.status} profile to ${input.status}.`);
  }
  if (input.status === FamilyStatus.REJECTED && !input.rejectionReason) {
    throw new ApiError(422, 'A rejection reason is required.');
  }
  if (input.status === FamilyStatus.FIELD_VISIT) {
    const requiredDocuments = [DocumentType.AADHAAR, DocumentType.COMMUNITY_CERTIFICATE, DocumentType.INCOME_CERTIFICATE];
    const unverified = requiredDocuments.filter((type) => !family.documents.some((document) => document.type === type && document.status === DocumentStatus.VERIFIED));
    if (unverified.length) throw new ApiError(422, 'Verify all required documents before scheduling a field visit.', { unverifiedDocuments: unverified });
  }
  if (input.status === FamilyStatus.APPROVED && !family.fieldVisits.some((visit) => visit.status === VisitStatus.COMPLETED)) {
    throw new ApiError(422, 'Complete at least one field visit before approving a family profile.');
  }
  const updated = await prisma.family.update({
    where: { id: familyId },
    data: {
      status: input.status,
      ...(input.status === FamilyStatus.APPROVED ? { approvedAt: new Date() } : {}),
      ...(input.status === FamilyStatus.REJECTED ? { rejectionReason: input.rejectionReason } : {}),
      workflowEvents: {
        create: {
          stage: statusToStage[input.status],
          title: `Family status changed to ${input.status.replaceAll('_', ' ').toLowerCase()}`,
          note: input.note ?? input.rejectionReason,
          actorId: request.auth!.userId,
        },
      },
    },
    include: familyDetailInclude,
  });
  await writeAuditLog(request, 'STATUS_CHANGE', 'Family', familyId, { status: input.status });
  response.json({ data: sanitizeFamily(updated) });
}));

familiesRouter.post('/:id/documents', allowPermission('families.manage', ...privilegedRoles), documentUpload.single('file'), asyncHandler(async (request, response) => {
  const familyId = idSchema.parse(request.params.id);
  await getFamilyForRequest(familyId, request);
  if (!request.file) throw new ApiError(422, 'Attach a PDF, JPEG, PNG, or WebP document.');
  const type = z.nativeEnum(DocumentType).parse(request.body.type);
  const document = await prisma.familyDocument.create({
    data: {
      familyId,
      type,
      fileName: request.file.originalname,
      storageKey: request.file.filename,
      mimeType: request.file.mimetype,
      sizeBytes: request.file.size,
    },
  });
  await writeAuditLog(request, 'UPLOAD', 'FamilyDocument', document.id, { familyId, type });
  response.status(201).json({ data: { ...document, url: `/api/families/${familyId}/documents/${document.id}/file` } });
}));

familiesRouter.get('/:id/documents/:documentId/file', asyncHandler(async (request, response) => {
  const familyId = idSchema.parse(request.params.id);
  const documentId = idSchema.parse(request.params.documentId);
  await getFamilyForRequest(familyId, request);
  const document = await prisma.familyDocument.findFirst({ where: { id: documentId, familyId } });
  if (!document) throw new ApiError(404, 'Document not found.');
  const filePath = path.resolve(uploadDirectory, document.storageKey);
  if (!filePath.startsWith(`${uploadDirectory}${path.sep}`) || !fs.existsSync(filePath)) {
    throw new ApiError(404, 'The stored document is unavailable.');
  }
  response.type(document.mimeType);
  response.setHeader('Content-Disposition', `inline; filename="${document.fileName.replace(/[\r\n"]/g, '')}"`);
  response.sendFile(filePath);
}));

familiesRouter.patch('/:id/documents/:documentId', allowRoles(Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER), asyncHandler(async (request, response) => {
  const familyId = idSchema.parse(request.params.id);
  const documentId = idSchema.parse(request.params.documentId);
  await getFamilyForRequest(familyId, request);
  const input = documentVerificationSchema.parse(request.body);
  if (input.status === DocumentStatus.REJECTED && !input.rejectionNote) {
    throw new ApiError(422, 'A rejection note is required when rejecting a document.');
  }
  const document = await prisma.familyDocument.findFirst({ where: { id: documentId, familyId } });
  if (!document) throw new ApiError(404, 'Document not found.');
  const updated = await prisma.familyDocument.update({
    where: { id: documentId },
    data: {
      status: input.status,
      rejectionNote: input.status === DocumentStatus.REJECTED ? input.rejectionNote : null,
      verifiedById: input.status === DocumentStatus.VERIFIED ? request.auth!.userId : null,
      verifiedAt: input.status === DocumentStatus.VERIFIED ? new Date() : null,
    },
  });
  await writeAuditLog(request, 'VERIFY', 'FamilyDocument', documentId, { status: input.status });
  response.json({ data: updated });
}));

familiesRouter.post('/:id/field-visits', allowPermission('families.manage', ...privilegedRoles), asyncHandler(async (request, response) => {
  const familyId = idSchema.parse(request.params.id);
  const family = await getFamilyForRequest(familyId, request);
  const input = fieldVisitSchema.parse(request.body);
  const volunteerId = request.auth!.role === Role.FIELD_VOLUNTEER ? request.auth!.userId : input.volunteerId;
  if (!volunteerId) throw new ApiError(422, 'Select a field volunteer for this visit.');
  const volunteer = await prisma.user.findFirst({
    where: { id: volunteerId, role: Role.FIELD_VOLUNTEER, status: UserStatus.ACTIVE, districtId: family.districtId },
    select: { id: true },
  });
  if (!volunteer) throw new ApiError(422, 'The selected volunteer must be active and assigned to the family district.');
  const visit = await prisma.fieldVisit.create({
    data: {
      familyId,
      villageId: family.villageId,
      volunteerId,
      scheduledAt: input.scheduledAt,
      status: input.status,
      purpose: input.purpose,
      notes: input.notes,
      latitude: input.latitude,
      longitude: input.longitude,
      ...(input.status === VisitStatus.COMPLETED ? { completedAt: new Date() } : {}),
    },
    include: { volunteer: { select: { id: true, fullName: true, mobile: true } } },
  });
  await prisma.workflowEvent.create({
    data: {
      familyId,
      stage: WorkflowStage.FIELD_VISIT,
      title: input.status === VisitStatus.COMPLETED ? 'Field visit completed' : 'Field visit scheduled',
      note: input.purpose,
      actorId: request.auth!.userId,
    },
  });
  await writeAuditLog(request, 'CREATE', 'FieldVisit', visit.id, { familyId });
  response.status(201).json({ data: visit });
}));

familiesRouter.get('/:id/eligibility', asyncHandler(async (request, response) => {
  const familyId = idSchema.parse(request.params.id);
  const family = await prisma.family.findUnique({ where: { id: familyId }, include: { income: true, members: true } });
  if (!family) throw new ApiError(404, 'Family not found.');
  ensureFamilyAccess(request, family);
  const schemes = await prisma.scheme.findMany({ where: { status: SchemeStatus.ACTIVE }, orderBy: { name: 'asc' } });
  const results = schemes.map((scheme) => evaluateSchemeEligibility(family, scheme));
  response.json({
    data: {
      eligibleSchemes: results.filter((result) => result.eligible),
      notEligibleSchemes: results.filter((result) => !result.eligible),
    },
  });
}));

familiesRouter.get('/:id/timeline', asyncHandler(async (request, response) => {
  const family = await getFamilyForRequest(idSchema.parse(request.params.id), request);
  response.json({
    data: {
      workflow: family.workflowEvents,
      fieldVisits: family.fieldVisits,
      applications: family.applications.map((application) => ({
        id: application.id,
        applicationNumber: application.applicationNumber,
        scheme: application.scheme.name,
        status: application.status,
        events: application.statusEvents,
      })),
    },
  });
}));

familiesRouter.get('/:id/qr', asyncHandler(async (request, response) => {
  const family = await getFamilyForRequest(idSchema.parse(request.params.id), request);
  response.json({
    data: {
      familyCode: family.familyCode,
      verificationPayload: `tribalconnect:family:${family.id}:${family.familyCode}`,
      // The web client turns this stable payload into a rendered QR code without exposing Aadhaar data.
    },
  });
}));
