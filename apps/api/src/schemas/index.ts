import {
  ApplicationStatus,
  DocumentStatus,
  FamilyStatus,
  Gender,
  HouseType,
  Role,
  SchemeStatus,
  NotificationChannel,
  UserStatus,
  VisitStatus,
} from '@prisma/client';
import { z } from 'zod';

const mobile = z.string().trim().refine((value) => value.replace(/\D/g, '').length === 10, 'Enter a valid 10-digit mobile number.');
const aadhaar = z.string().trim().refine((value) => value.replace(/\D/g, '').length === 12, 'Enter a valid 12-digit Aadhaar number.');

export const otpRequestSchema = z.object({ mobile, role: z.nativeEnum(Role) });
export const otpVerifySchema = z.object({ mobile, role: z.nativeEnum(Role), code: z.string().regex(/^\d{4,8}$/) });
export const refreshTokenSchema = z.object({ refreshToken: z.string().trim().min(32).max(1_000) });
export const logoutSchema = z.object({ refreshToken: z.string().trim().min(32).max(1_000).optional() });

export const familyMemberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  gender: z.nativeEnum(Gender),
  dateOfBirth: z.coerce.date().optional(),
  age: z.coerce.number().int().min(0).max(130).optional(),
  relationship: z.string().trim().min(2).max(80),
  occupation: z.string().trim().max(120).optional(),
  education: z.string().trim().max(120).optional(),
  hasDisability: z.coerce.boolean().default(false),
  disabilityType: z.string().trim().max(120).optional(),
  aadhaarNumber: aadhaar.optional(),
  isStudent: z.coerce.boolean().default(false),
});

// Existing household members may be identified on edit. The identifier is never
// accepted during family creation, so callers cannot choose database primary keys.
export const familyMemberUpdateSchema = familyMemberSchema.extend({ id: z.string().uuid().optional() });

export const familyIncomeSchema = z.object({
  annualIncome: z.coerce.number().min(0).max(99_999_999),
  primaryOccupation: z.string().trim().max(120).optional(),
  landOwnershipAcres: z.coerce.number().min(0).max(100_000).optional(),
  houseType: z.nativeEnum(HouseType).optional(),
  livestockCount: z.coerce.number().int().min(0).max(100_000).default(0),
  hasBankAccount: z.coerce.boolean().default(false),
  bankAccountNumber: z.string().trim().min(4).max(34).optional(),
  ifscCode: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(),
  rationCardNumber: z.string().trim().max(60).optional(),
});

export const familyCreateSchema = z.object({
  headName: z.string().trim().min(2).max(120),
  fatherOrHusbandName: z.string().trim().max(120).optional(),
  mobile,
  aadhaarNumber: aadhaar,
  tribalCommunity: z.string().trim().min(2).max(120),
  casteCertificateNo: z.string().trim().max(80).optional(),
  address: z.string().trim().min(5).max(500),
  panchayatName: z.string().trim().max(120).optional(),
  districtId: z.string().uuid(),
  villageId: z.string().uuid(),
  state: z.string().trim().min(2).max(80).default('Tamil Nadu'),
  isWidow: z.coerce.boolean().default(false),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  members: z.array(familyMemberSchema).min(1).max(40),
  income: familyIncomeSchema,
});

export const familyUpdateSchema = familyCreateSchema
  .omit({ aadhaarNumber: true, members: true, income: true, districtId: true, villageId: true })
  .partial()
  .extend({
    aadhaarNumber: aadhaar.optional(),
    districtId: z.string().uuid().optional(),
    villageId: z.string().uuid().optional(),
    members: z.array(familyMemberUpdateSchema).min(1).max(40).optional(),
    income: familyIncomeSchema.partial().optional(),
  });

export const eligibilityCriteriaSchema = z.object({
  tribalCommunities: z.array(z.string().trim().min(2).max(120)).max(100).optional(),
  communities: z.array(z.string().trim().min(2).max(120)).max(100).optional(),
  minAnnualIncome: z.coerce.number().min(0).max(99_999_999).optional(),
  maxAnnualIncome: z.coerce.number().min(0).max(99_999_999).optional(),
  occupations: z.array(z.string().trim().min(2).max(120)).max(100).optional(),
  requireStudent: z.coerce.boolean().optional(),
  requireDisability: z.coerce.boolean().optional(),
  requireWidow: z.coerce.boolean().optional(),
  requireSeniorCitizen: z.coerce.boolean().optional(),
  requireFarmer: z.coerce.boolean().optional(),
  minAge: z.coerce.number().int().min(0).max(130).optional(),
  maxAge: z.coerce.number().int().min(0).max(130).optional(),
  minLandOwnershipAcres: z.coerce.number().min(0).max(100_000).optional(),
  maxLandOwnershipAcres: z.coerce.number().min(0).max(100_000).optional(),
  allowedHouseTypes: z.array(z.nativeEnum(HouseType)).max(10).optional(),
  gender: z.nativeEnum(Gender).optional(),
  requiresBankAccount: z.coerce.boolean().optional(),
}).superRefine((criteria, context) => {
  if (criteria.minAnnualIncome != null && criteria.maxAnnualIncome != null && criteria.minAnnualIncome > criteria.maxAnnualIncome) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Minimum income cannot exceed maximum income.', path: ['maxAnnualIncome'] });
  }
  if (criteria.minAge != null && criteria.maxAge != null && criteria.minAge > criteria.maxAge) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Minimum age cannot exceed maximum age.', path: ['maxAge'] });
  }
  if (criteria.minLandOwnershipAcres != null && criteria.maxLandOwnershipAcres != null && criteria.minLandOwnershipAcres > criteria.maxLandOwnershipAcres) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Minimum landholding cannot exceed maximum landholding.', path: ['maxLandOwnershipAcres'] });
  }
});

export const schemeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,40}$/),
  name: z.string().trim().min(3).max(180),
  department: z.string().trim().min(3).max(180),
  description: z.string().trim().min(10).max(4_000),
  benefits: z.array(z.string().trim().min(2).max(300)).min(1).max(20),
  eligibilitySummary: z.string().trim().max(1_000).optional(),
  criteria: eligibilityCriteriaSchema.default({}),
  requiredDocuments: z.array(z.string().trim().min(2).max(120)).max(30).default([]),
  lastDate: z.coerce.date().optional(),
  status: z.nativeEnum(SchemeStatus).default(SchemeStatus.DRAFT),
  applicationLink: z.string().url().optional(),
});

export const schemeUpdateSchema = schemeSchema.partial().omit({ code: true });

export const applicationCreateSchema = z.object({
  familyId: z.string().uuid(),
  schemeId: z.string().uuid(),
  notes: z.string().trim().max(2_000).optional(),
});

export const applicationStatusSchema = z.object({
  status: z.nativeEnum(ApplicationStatus),
  note: z.string().trim().max(2_000).optional(),
  rejectionReason: z.string().trim().max(1_000).optional(),
});

export const fieldVisitSchema = z.object({
  scheduledAt: z.coerce.date(),
  purpose: z.string().trim().min(3).max(500),
  volunteerId: z.string().uuid().optional(),
  notes: z.string().trim().max(2_000).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  status: z.nativeEnum(VisitStatus).default(VisitStatus.SCHEDULED),
});

export const volunteerVisitSchema = fieldVisitSchema.extend({
  familyId: z.string().uuid(),
  clientSyncId: z.string().trim().min(8).max(160).optional(),
});

export const volunteerVisitUpdateSchema = z.object({
  scheduledAt: z.coerce.date().optional(),
  purpose: z.string().trim().min(3).max(500).optional(),
  notes: z.string().trim().max(2_000).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  status: z.nativeEnum(VisitStatus).optional(),
});

export const volunteerSyncSchema = z.object({ records: z.array(volunteerVisitSchema.extend({ clientSyncId: z.string().trim().min(8).max(160) })).min(1).max(100) });

export const villageSchema = z.object({
  name: z.string().trim().min(2).max(120),
  hamlet: z.string().trim().max(120).optional(),
  population: z.coerce.number().int().min(0).max(10_000_000).default(0),
  tribalFamilyCount: z.coerce.number().int().min(0).max(1_000_000).default(0),
  mapLatitude: z.coerce.number().min(-90).max(90).optional(),
  mapLongitude: z.coerce.number().min(-180).max(180).optional(),
  districtId: z.string().uuid(),
  blockId: z.string().uuid().optional(),
  panchayatId: z.string().uuid().optional(),
  assignedOfficerId: z.string().uuid().optional(),
});

export const villageUpdateSchema = villageSchema.partial();

export const documentVerificationSchema = z.object({
  status: z.nativeEnum(DocumentStatus),
  rejectionNote: z.string().trim().max(1_000).optional(),
});

export const familyStatusSchema = z.object({
  status: z.nativeEnum(FamilyStatus),
  note: z.string().trim().max(2_000).optional(),
  rejectionReason: z.string().trim().max(1_000).optional(),
});

export const notificationSendSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  body: z.string().trim().min(2).max(2_000),
  channels: z.array(z.nativeEnum(NotificationChannel)).min(1).max(4).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const notificationPreferenceSchema = z.object({
  sms: z.coerce.boolean().optional(),
  whatsapp: z.coerce.boolean().optional(),
  email: z.coerce.boolean().optional(),
  inApp: z.coerce.boolean().optional(),
});

const announcementBaseSchema = z.object({
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(3).max(10_000),
  districtId: z.string().uuid().nullable().optional(),
  isPublished: z.coerce.boolean().default(false),
  publishedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
});

const validateAnnouncementDates = (input: { publishedAt?: Date; expiresAt?: Date }, context: z.RefinementCtx) => {
  if (input.publishedAt && input.expiresAt && input.publishedAt >= input.expiresAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Expiry must be after publication.', path: ['expiresAt'] });
  }
};

export const announcementSchema = announcementBaseSchema.superRefine(validateAnnouncementDates);
export const announcementUpdateSchema = announcementBaseSchema.partial().superRefine(validateAnnouncementDates);

export const adminUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  mobile,
  email: z.string().trim().email().max(254).nullable().optional(),
  role: z.nativeEnum(Role),
  status: z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
  districtId: z.string().uuid().nullable().optional(),
  familyId: z.string().uuid().nullable().optional(),
  avatarUrl: z.string().url().max(2_000).nullable().optional(),
});

export const adminUserUpdateSchema = adminUserSchema.partial();
export const permissionUpdateSchema = z.object({
  roles: z.array(z.nativeEnum(Role)).min(1).max(4),
  description: z.string().trim().min(3).max(300).optional(),
});
export const settingsSchema = z.record(z.string().regex(/^[a-z][a-z0-9_.-]{0,80}$/i), z.unknown());
export const backupSchema = z.object({ label: z.string().trim().min(3).max(160).optional() });
