import {
  ApplicationStatus,
  DocumentStatus,
  DocumentType,
  FamilyStatus,
  Gender,
  HouseType,
  PrismaClient,
  Role,
  SchemeStatus,
  VisitStatus,
  WorkflowStage,
} from '@prisma/client';
import { hashAadhaar } from '../src/utils/identifiers';

const prisma = new PrismaClient();

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function ensureFamily(input: {
  familyCode: string;
  headName: string;
  fatherOrHusbandName?: string;
  mobile: string;
  aadhaarHash: string;
  aadhaarMasked: string;
  tribalCommunity: string;
  casteCertificateNo?: string;
  address: string;
  panchayatName?: string;
  districtId: string;
  villageId: string;
  assignedOfficerId: string;
  status: FamilyStatus;
  isWidow?: boolean;
  annualIncome: number;
  primaryOccupation: string;
  landOwnershipAcres?: number;
  houseType: HouseType;
  livestockCount?: number;
  members: Array<{
    name: string;
    gender: Gender;
    dateOfBirth: Date;
    relationship: string;
    occupation?: string;
    education?: string;
    hasDisability?: boolean;
    isStudent?: boolean;
  }>;
}) {
  const existing = await prisma.family.findUnique({ where: { familyCode: input.familyCode } });
  if (existing) {
    return prisma.family.update({ where: { id: existing.id }, data: { aadhaarHash: input.aadhaarHash, aadhaarMasked: input.aadhaarMasked } });
  }

  return prisma.family.create({
    data: {
      familyCode: input.familyCode,
      headName: input.headName,
      fatherOrHusbandName: input.fatherOrHusbandName,
      mobile: input.mobile,
      aadhaarHash: input.aadhaarHash,
      aadhaarMasked: input.aadhaarMasked,
      tribalCommunity: input.tribalCommunity,
      casteCertificateNo: input.casteCertificateNo,
      address: input.address,
      panchayatName: input.panchayatName,
      districtId: input.districtId,
      villageId: input.villageId,
      assignedOfficerId: input.assignedOfficerId,
      status: input.status,
      submittedAt: input.status === FamilyStatus.DRAFT ? undefined : new Date(),
      approvedAt: input.status === FamilyStatus.APPROVED ? new Date() : undefined,
      isWidow: input.isWidow ?? false,
      income: {
        create: {
          annualIncome: input.annualIncome,
          primaryOccupation: input.primaryOccupation,
          landOwnershipAcres: input.landOwnershipAcres,
          houseType: input.houseType,
          livestockCount: input.livestockCount ?? 0,
          hasBankAccount: true,
          bankAccountLast4: '4321',
          ifscCode: 'SBIN0001234',
          rationCardNumber: `RC-${input.familyCode.slice(-4)}`,
        },
      },
      members: { create: input.members },
      documents: {
        create: [
          {
            type: DocumentType.AADHAAR,
            fileName: 'aadhaar.pdf',
            storageKey: `seed/${input.familyCode}/aadhaar.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: 154_200,
            status: input.status === FamilyStatus.APPROVED ? DocumentStatus.VERIFIED : DocumentStatus.PENDING,
          },
          {
            type: DocumentType.COMMUNITY_CERTIFICATE,
            fileName: 'community-certificate.pdf',
            storageKey: `seed/${input.familyCode}/community-certificate.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: 84_300,
            status: input.status === FamilyStatus.APPROVED ? DocumentStatus.VERIFIED : DocumentStatus.PENDING,
          },
        ],
      },
      workflowEvents: {
        create: [
          {
            stage: WorkflowStage.SUBMITTED,
            title: 'Family profile submitted',
            note: 'Seeded demonstration record.',
            actorName: 'Development Officer',
          },
        ],
      },
    },
  });
}

async function main() {
  const nilgiris = await prisma.district.upsert({
    where: { code: 'TN-NLG' },
    update: { name: 'The Nilgiris' },
    create: { code: 'TN-NLG', name: 'The Nilgiris' },
  });
  const dharmapuri = await prisma.district.upsert({
    where: { code: 'TN-DMP' },
    update: { name: 'Dharmapuri' },
    create: { code: 'TN-DMP', name: 'Dharmapuri' },
  });

  const uddhagai = await prisma.block.upsert({
    where: { districtId_name: { districtId: nilgiris.id, name: 'Udhagamandalam' } },
    update: {},
    create: { districtId: nilgiris.id, name: 'Udhagamandalam' },
  });
  const pennagaram = await prisma.block.upsert({
    where: { districtId_name: { districtId: dharmapuri.id, name: 'Pennagaram' } },
    update: {},
    create: { districtId: dharmapuri.id, name: 'Pennagaram' },
  });
  const ootyPanchayat = await prisma.panchayat.upsert({
    where: { blockId_name: { blockId: uddhagai.id, name: 'Ooty Rural' } },
    update: {},
    create: { blockId: uddhagai.id, name: 'Ooty Rural' },
  });
  const hogenakkalPanchayat = await prisma.panchayat.upsert({
    where: { blockId_name: { blockId: pennagaram.id, name: 'Hogenakkal' } },
    update: {},
    create: { blockId: pennagaram.id, name: 'Hogenakkal' },
  });

  const admin = await prisma.user.upsert({
    where: { mobile_role: { mobile: '9876543210', role: Role.SUPER_ADMIN } },
    update: { fullName: 'Meera Krishnan' },
    create: { fullName: 'Meera Krishnan', mobile: '9876543210', role: Role.SUPER_ADMIN, districtId: nilgiris.id },
  });
  const officer = await prisma.user.upsert({
    where: { mobile_role: { mobile: '9876543210', role: Role.DEVELOPMENT_OFFICER } },
    update: { fullName: 'Arun Kumar' },
    create: { fullName: 'Arun Kumar', mobile: '9876543210', role: Role.DEVELOPMENT_OFFICER, districtId: nilgiris.id },
  });
  const volunteer = await prisma.user.upsert({
    where: { mobile_role: { mobile: '9876543210', role: Role.FIELD_VOLUNTEER } },
    update: { fullName: 'Kavitha M' },
    create: { fullName: 'Kavitha M', mobile: '9876543210', role: Role.FIELD_VOLUNTEER, districtId: nilgiris.id },
  });

  const permissions = [
    { key: 'families.manage', description: 'Create, update, and submit family records.', roles: [Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER, Role.FIELD_VOLUNTEER] },
    { key: 'schemes.manage', description: 'Create and manage welfare schemes.', roles: [Role.SUPER_ADMIN] },
    { key: 'applications.review', description: 'Review and decide scheme applications.', roles: [Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER] },
    { key: 'villages.manage', description: 'Manage village geography and assignments.', roles: [Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER] },
    { key: 'reports.export', description: 'Export operational reports.', roles: [Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER] },
    { key: 'admin.manage', description: 'Manage users, permissions, settings, and backups.', roles: [Role.SUPER_ADMIN] },
  ];
  await Promise.all(permissions.map((permission) => prisma.permission.upsert({ where: { key: permission.key }, update: {}, create: permission })));

  const kandal = await prisma.village.upsert({
    where: { districtId_name: { districtId: nilgiris.id, name: 'Kandal' } },
    update: { assignedOfficerId: officer.id },
    create: {
      districtId: nilgiris.id,
      blockId: uddhagai.id,
      panchayatId: ootyPanchayat.id,
      name: 'Kandal',
      hamlet: 'Kandal Tribal Hamlet',
      population: 1_240,
      tribalFamilyCount: 163,
      mapLatitude: 11.4161,
      mapLongitude: 76.7023,
      assignedOfficerId: officer.id,
    },
  });
  const thummanatti = await prisma.village.upsert({
    where: { districtId_name: { districtId: nilgiris.id, name: 'Thummanatti' } },
    update: { assignedOfficerId: officer.id },
    create: {
      districtId: nilgiris.id,
      blockId: uddhagai.id,
      panchayatId: ootyPanchayat.id,
      name: 'Thummanatti',
      population: 980,
      tribalFamilyCount: 126,
      mapLatitude: 11.3567,
      mapLongitude: 76.7011,
      assignedOfficerId: officer.id,
    },
  });
  const hogenakkal = await prisma.village.upsert({
    where: { districtId_name: { districtId: dharmapuri.id, name: 'Hogenakkal' } },
    update: {},
    create: {
      districtId: dharmapuri.id,
      blockId: pennagaram.id,
      panchayatId: hogenakkalPanchayat.id,
      name: 'Hogenakkal',
      population: 1_815,
      tribalFamilyCount: 214,
      mapLatitude: 12.1197,
      mapLongitude: 77.7726,
    },
  });

  await prisma.developmentCenter.upsert({
    where: { code: 'RDC-NLG-01' },
    update: {},
    create: {
      code: 'RDC-NLG-01',
      name: 'Nilgiris Rural Development Center',
      address: 'Kandal Road, Udhagamandalam, The Nilgiris',
      phone: '0423-2440000',
      districtId: nilgiris.id,
      villageId: kandal.id,
    },
  });

  const familyOne = await ensureFamily({
    familyCode: 'TC-2026-0001',
    headName: 'Ravi Kurumba',
    fatherOrHusbandName: 'Muthu Kurumba',
    mobile: '9000000001',
    aadhaarHash: hashAadhaar('100000000001'),
    aadhaarMasked: 'XXXX XXXX 1001',
    tribalCommunity: 'Kurumba',
    casteCertificateNo: 'CC-NLG-1001',
    address: '12, Kandal Tribal Hamlet',
    panchayatName: 'Ooty Rural',
    districtId: nilgiris.id,
    villageId: kandal.id,
    assignedOfficerId: officer.id,
    status: FamilyStatus.APPROVED,
    annualIncome: 118_000,
    primaryOccupation: 'Small Farmer',
    landOwnershipAcres: 0.75,
    houseType: HouseType.KUTCHA,
    livestockCount: 4,
    members: [
      { name: 'Ravi Kurumba', gender: Gender.MALE, dateOfBirth: date('1978-08-14'), relationship: 'Family Head', occupation: 'Farmer' },
      { name: 'Malliga Ravi', gender: Gender.FEMALE, dateOfBirth: date('1984-05-20'), relationship: 'Spouse', occupation: 'Self Help Group Member' },
      { name: 'Selvi Ravi', gender: Gender.FEMALE, dateOfBirth: date('2010-03-02'), relationship: 'Daughter', education: 'Class 10', isStudent: true },
    ],
  });
  const familyTwo = await ensureFamily({
    familyCode: 'TC-2026-0002',
    headName: 'Lakshmi Toda',
    fatherOrHusbandName: 'Late Balan Toda',
    mobile: '9000000002',
    aadhaarHash: hashAadhaar('100000000002'),
    aadhaarMasked: 'XXXX XXXX 1002',
    tribalCommunity: 'Toda',
    casteCertificateNo: 'CC-NLG-1002',
    address: '7, Thummanatti Village',
    panchayatName: 'Ooty Rural',
    districtId: nilgiris.id,
    villageId: thummanatti.id,
    assignedOfficerId: officer.id,
    status: FamilyStatus.DOCUMENT_VERIFICATION,
    isWidow: true,
    annualIncome: 96_000,
    primaryOccupation: 'Livestock Rearing',
    landOwnershipAcres: 0.25,
    houseType: HouseType.SEMI_PUCCA,
    livestockCount: 8,
    members: [
      { name: 'Lakshmi Toda', gender: Gender.FEMALE, dateOfBirth: date('1963-11-19'), relationship: 'Family Head', occupation: 'Livestock Rearer' },
      { name: 'Nila Lakshmi', gender: Gender.FEMALE, dateOfBirth: date('2005-07-15'), relationship: 'Daughter', education: 'Diploma', isStudent: true },
    ],
  });
  const familyThree = await ensureFamily({
    familyCode: 'TC-2026-0003',
    headName: 'Suresh Irula',
    fatherOrHusbandName: 'Rangan Irula',
    mobile: '9000000003',
    aadhaarHash: hashAadhaar('100000000003'),
    aadhaarMasked: 'XXXX XXXX 1003',
    tribalCommunity: 'Irula',
    casteCertificateNo: 'CC-DMP-1003',
    address: '4, Hogenakkal Settlement',
    panchayatName: 'Hogenakkal',
    districtId: dharmapuri.id,
    villageId: hogenakkal.id,
    assignedOfficerId: officer.id,
    status: FamilyStatus.FIELD_VISIT,
    annualIncome: 145_000,
    primaryOccupation: 'Daily Wage Worker',
    houseType: HouseType.TEMPORARY,
    livestockCount: 1,
    members: [
      { name: 'Suresh Irula', gender: Gender.MALE, dateOfBirth: date('1989-01-07'), relationship: 'Family Head', occupation: 'Daily Wage Worker' },
      { name: 'Devi Suresh', gender: Gender.FEMALE, dateOfBirth: date('1992-09-27'), relationship: 'Spouse', occupation: 'Daily Wage Worker', hasDisability: true },
      { name: 'Arun Suresh', gender: Gender.MALE, dateOfBirth: date('2016-06-03'), relationship: 'Son', education: 'Class 4', isStudent: true },
    ],
  });

  await prisma.user.upsert({
    where: { mobile_role: { mobile: '9876543210', role: Role.FAMILY } },
    update: { fullName: familyOne.headName, familyId: familyOne.id },
    create: { fullName: familyOne.headName, mobile: '9876543210', role: Role.FAMILY, familyId: familyOne.id },
  });

  const schemes = [
    {
      code: 'TN-TRIBAL-HOUSE',
      name: 'Tribal Housing Assistance',
      department: 'Rural Development & Panchayat Raj',
      description: 'Financial assistance to build or upgrade safe homes for eligible tribal families.',
      benefits: ['Up to ₹3,50,000 housing grant', 'Priority technical support'],
      eligibilitySummary: 'Low-income tribal families living in kutcha or temporary housing.',
      criteria: { maxAnnualIncome: 180000, allowedHouseTypes: ['KUTCHA', 'TEMPORARY', 'SEMI_PUCCA'] },
      requiredDocuments: ['Aadhaar', 'Community Certificate', 'Income Certificate', 'House Photo'],
    },
    {
      code: 'TN-TRIBAL-SCHOLAR',
      name: 'Tribal Student Scholarship',
      department: 'Adidravidar and Tribal Welfare',
      description: 'Annual education support for school and college students from tribal families.',
      benefits: ['Tuition support', 'Annual learning allowance'],
      eligibilitySummary: 'Students aged 6–25 from low-income tribal households.',
      criteria: { maxAnnualIncome: 250000, requireStudent: true, minAge: 6, maxAge: 25 },
      requiredDocuments: ['Aadhaar', 'Community Certificate', 'Income Certificate', 'Education Certificate'],
    },
    {
      code: 'TN-TRIBAL-FARM',
      name: 'Small Farmer Assistance',
      department: 'Agriculture and Farmers Welfare',
      description: 'Input, irrigation, and advisory support for small tribal farmers.',
      benefits: ['Seasonal input grant', 'Free soil testing'],
      eligibilitySummary: 'Tribal farmers with small land holdings.',
      criteria: { maxAnnualIncome: 300000, requireFarmer: true, minLandOwnershipAcres: 0.01, maxLandOwnershipAcres: 5 },
      requiredDocuments: ['Aadhaar', 'Land Document', 'Bank Passbook'],
    },
    {
      code: 'TN-SENIOR-PENSION',
      name: 'Senior Citizen Pension',
      department: 'Social Welfare',
      description: 'Monthly income support for senior citizens in vulnerable households.',
      benefits: ['₹1,200 monthly pension'],
      eligibilitySummary: 'Households with a member aged 60 or older and low annual income.',
      criteria: { maxAnnualIncome: 200000, minAge: 60, requireSeniorCitizen: true },
      requiredDocuments: ['Aadhaar', 'Age Proof', 'Income Certificate', 'Bank Passbook'],
    },
    {
      code: 'TN-HEALTH-SHIELD',
      name: 'Tribal Health Insurance',
      department: 'Health and Family Welfare',
      description: 'Cashless hospital-care insurance for low-income tribal households.',
      benefits: ['Cashless cover up to ₹5 lakh', 'Annual family health check'],
      eligibilitySummary: 'Tribal households below the stated income threshold.',
      criteria: { maxAnnualIncome: 250000 },
      requiredDocuments: ['Aadhaar', 'Community Certificate', 'Ration Card'],
    },
    {
      code: 'TN-WOMEN-SHG',
      name: 'Women Self Help Group Support',
      department: 'Tamil Nadu Rural Livelihood Mission',
      description: 'Training and revolving-fund support for tribal women’s groups.',
      benefits: ['Skill training', 'Revolving fund access'],
      eligibilitySummary: 'Low-income tribal households with an adult woman member.',
      criteria: { maxAnnualIncome: 250000, gender: 'FEMALE', minAge: 18 },
      requiredDocuments: ['Aadhaar', 'Community Certificate', 'Bank Passbook'],
    },
  ];

  const schemeRecords = new Map<string, { id: string }>();
  for (const scheme of schemes) {
    const record = await prisma.scheme.upsert({
      where: { code: scheme.code },
      update: { ...scheme, status: SchemeStatus.ACTIVE, lastDate: date('2026-12-31') },
      create: { ...scheme, status: SchemeStatus.ACTIVE, lastDate: date('2026-12-31'), createdById: admin.id },
    });
    schemeRecords.set(scheme.code, record);
  }

  const housing = schemeRecords.get('TN-TRIBAL-HOUSE')!;
  const scholarship = schemeRecords.get('TN-TRIBAL-SCHOLAR')!;
  const pension = schemeRecords.get('TN-SENIOR-PENSION')!;

  const housingApplication = await prisma.schemeApplication.upsert({
    where: { familyId_schemeId: { familyId: familyOne.id, schemeId: housing.id } },
    update: {},
    create: {
      applicationNumber: 'APP-2026-00001',
      familyId: familyOne.id,
      schemeId: housing.id,
      status: ApplicationStatus.APPROVED,
      submittedAt: new Date(),
      decidedAt: new Date(),
      submittedById: officer.id,
      eligibilitySnapshot: { eligible: true, checkedAt: new Date().toISOString(), reasons: [] },
    },
  });
  await prisma.schemeApplication.upsert({
    where: { familyId_schemeId: { familyId: familyOne.id, schemeId: scholarship.id } },
    update: {},
    create: {
      applicationNumber: 'APP-2026-00002',
      familyId: familyOne.id,
      schemeId: scholarship.id,
      status: ApplicationStatus.SUBMITTED,
      submittedAt: new Date(),
      submittedById: officer.id,
      eligibilitySnapshot: { eligible: true, checkedAt: new Date().toISOString(), reasons: [] },
    },
  });
  await prisma.schemeApplication.upsert({
    where: { familyId_schemeId: { familyId: familyTwo.id, schemeId: pension.id } },
    update: {},
    create: {
      applicationNumber: 'APP-2026-00003',
      familyId: familyTwo.id,
      schemeId: pension.id,
      status: ApplicationStatus.RECOMMENDED,
      submittedById: officer.id,
      eligibilitySnapshot: { eligible: true, checkedAt: new Date().toISOString(), reasons: [] },
    },
  });

  const applicationEvent = await prisma.applicationStatusEvent.findFirst({ where: { applicationId: housingApplication.id } });
  if (!applicationEvent) {
    await prisma.applicationStatusEvent.create({
      data: { applicationId: housingApplication.id, status: ApplicationStatus.APPROVED, note: 'Approved after field verification.', actorId: officer.id },
    });
  }
  const applicationWorkflow = await prisma.workflowEvent.findFirst({ where: { applicationId: housingApplication.id } });
  if (!applicationWorkflow) {
    await prisma.workflowEvent.create({
      data: {
        familyId: familyOne.id,
        applicationId: housingApplication.id,
        stage: WorkflowStage.APPLICATION_SUBMITTED,
        title: 'Housing application approved',
        actorId: officer.id,
        actorName: officer.fullName,
      },
    });
  }

  const scheduledVisit = await prisma.fieldVisit.findFirst({ where: { familyId: familyThree.id, volunteerId: volunteer.id } });
  if (!scheduledVisit) {
    await prisma.fieldVisit.create({
      data: {
        familyId: familyThree.id,
        villageId: hogenakkal.id,
        volunteerId: volunteer.id,
        scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
        status: VisitStatus.SCHEDULED,
        purpose: 'Household verification and GPS capture',
      },
    });
  }

  await prisma.announcement.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: { isPublished: true },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Scholarship applications are now open',
      content: 'Eligible tribal students can submit their 2026–27 scholarship application through their Development Officer.',
      isPublished: true,
      publishedAt: new Date(),
      createdById: admin.id,
    },
  });

  const existingNotification = await prisma.notification.findFirst({ where: { userId: volunteer.id, title: 'Field visit scheduled' } });
  if (!existingNotification) {
    await prisma.notification.create({
      data: {
        userId: volunteer.id,
        title: 'Field visit scheduled',
        body: 'A verification visit for Suresh Irula is scheduled in Hogenakkal.',
        status: 'SENT',
      },
    });
  }

  console.log('TribalConnect seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
