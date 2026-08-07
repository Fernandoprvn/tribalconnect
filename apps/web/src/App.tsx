import { Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { FamilyOnboardingPage, type FamilyOnboardingFiles, type FamilyOnboardingValues } from './features/onboarding';
import { familiesApi, geographyApi, type ApiFamily, type FamilyMutationInput, type FamilyUpdateInput } from './lib/api';
import ApplicationsPage from './pages/ApplicationsPage';
import AdminPage from './pages/AdminPage';
import DashboardPage from './pages/DashboardPage';
import EligibilityPage from './pages/EligibilityPage';
import FamiliesPage from './pages/FamiliesPage';
import FamilyDetailPage from './pages/FamilyDetailPage';
import FamilyPortalPage from './pages/FamilyPortalPage';
import FieldVolunteerPage from './pages/FieldVolunteerPage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import NotificationsPage from './pages/NotificationsPage';
import ReportsPage from './pages/ReportsPage';
import SchemesPage from './pages/SchemesPage';
import SettingsPage from './pages/SettingsPage';
import VillagesPage from './pages/VillagesPage';
import { restoreSession, type RootState } from './store';
import type { UserRole } from './types';

const staffRoles: UserRole[] = ['SUPER_ADMIN', 'DEVELOPMENT_OFFICER', 'FIELD_VOLUNTEER'];
const onboardingDocumentTypes = {
  aadhaar: 'AADHAAR',
  communityCertificate: 'COMMUNITY_CERTIFICATE',
  incomeCertificate: 'INCOME_CERTIFICATE',
  rationCard: 'RATION_CARD',
  bankPassbook: 'BANK_PASSBOOK',
  passportPhoto: 'PASSPORT_PHOTO',
  housePhoto: 'HOUSE_PHOTO',
  landDocuments: 'LAND_DOCUMENT',
} as const;

function FullPageLoader() {
  return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default' }}><Stack alignItems="center" spacing={1.4}><CircularProgress /><Typography variant="body2" color="text.secondary">Restoring your secure session…</Typography></Stack></Box>;
}

function SessionBootstrap({ children }: { children: ReactNode }) {
  const session = useSelector((state: RootState) => state.session);
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (previousUserId.current !== undefined && previousUserId.current !== session.userId) {
      // Query keys are intentionally concise across the app. Clear cached data
      // whenever the authenticated identity changes so a shared device cannot
      // momentarily display the previous person's records.
      queryClient.clear();
    }
    previousUserId.current = session.userId;
  }, [queryClient, session.userId]);
  useEffect(() => { void restoreSession(); }, []);
  if (!session.initialized) return <FullPageLoader />;
  return <>{children}</>;
}

function RequireAuth() {
  const session = useSelector((state: RootState) => state.session);
  const location = useLocation();
  if (!session.authenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

function RequireRole({ roles }: { roles: UserRole[] }) {
  const role = useSelector((state: RootState) => state.session.role);
  if (!role || !roles.includes(role)) return <AccessDenied />;
  return <Outlet />;
}

function PublicOnly() {
  const session = useSelector((state: RootState) => state.session);
  if (!session.authenticated) return <Outlet />;
  return <Navigate to={session.role === 'SUPER_ADMIN' ? '/admin/dashboard' : session.role === 'DEVELOPMENT_OFFICER' ? '/officer/dashboard' : session.role === 'FIELD_VOLUNTEER' ? '/volunteer/dashboard' : '/family/dashboard'} replace />;
}

function AccessDenied() {
  return <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center', p: 2 }}><Paper variant="outlined" sx={{ maxWidth: 520, p: { xs: 3, sm: 4 }, textAlign: 'center' }}><Typography variant="h4">Access restricted</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Your current role does not have permission to open this workspace.</Typography><Button href="/" variant="contained" sx={{ mt: 2.25 }}>Return to portal</Button></Paper></Box>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function landLabel(value: unknown) {
  const acres = asNumber(value);
  if (acres === 0) return 'Landless';
  if (acres < 1) return 'Less than 1 acre';
  if (acres <= 2) return '1–2 acres';
  return 'More than 2 acres';
}

function houseLabel(value: unknown) {
  if (value === 'PUCCA') return 'Pucca';
  if (value === 'SEMI_PUCCA') return 'Semi-pucca';
  if (value === 'KUTCHA') return 'Kutcha';
  if (value === 'TEMPORARY') return 'Homeless / temporary';
  return '';
}

function genderLabel(value: unknown): 'Female' | 'Male' | 'Other' | 'Prefer not to say' {
  if (value === 'FEMALE') return 'Female';
  if (value === 'MALE') return 'Male';
  if (value === 'OTHER') return 'Other';
  return 'Prefer not to say';
}

function toOnboardingValues(family: ApiFamily): Partial<FamilyOnboardingValues> {
  const details = family as ApiFamily & Record<string, unknown>;
  const income = asRecord(details.income);
  const members = Array.isArray(details.members) ? details.members.map((entry) => {
    const member = asRecord(entry);
    const disabilityType = typeof member.disabilityType === 'string' ? member.disabilityType : '';
    return {
      name: typeof member.name === 'string' ? member.name : '',
      gender: genderLabel(member.gender),
      age: asNumber(member.age),
      dob: typeof member.dateOfBirth === 'string' ? member.dateOfBirth.slice(0, 10) : '',
      relationship: typeof member.relationship === 'string' ? member.relationship : '',
      occupation: typeof member.occupation === 'string' ? member.occupation : '',
      education: typeof member.education === 'string' ? member.education : '',
      disability: member.hasDisability === true ? disabilityType || 'Disability declared' : 'No disability declared',
      aadhaarNumber: '',
    };
  }) : undefined;
  return {
    familyDetails: {
      familyHeadName: family.headName,
      fatherOrHusbandName: typeof details.fatherOrHusbandName === 'string' ? details.fatherOrHusbandName : '',
      mobileNumber: family.mobile.replace(/\D/g, ''),
      aadhaarNumber: '',
      tribalCommunity: typeof details.tribalCommunity === 'string' ? details.tribalCommunity : '',
      casteCertificateNumber: typeof details.casteCertificateNo === 'string' ? details.casteCertificateNo : '',
      address: typeof details.address === 'string' ? details.address : '',
      village: family.village?.name ?? '',
      panchayat: typeof details.panchayatName === 'string' ? details.panchayatName : '',
      district: family.district?.name ?? '',
      state: typeof details.state === 'string' ? details.state : 'Tamil Nadu',
    },
    members,
    income: {
      annualIncome: asNumber(income.annualIncome),
      occupation: typeof income.primaryOccupation === 'string' ? income.primaryOccupation : '',
      landOwnership: landLabel(income.landOwnershipAcres),
      houseType: houseLabel(income.houseType),
      livestock: String(income.livestockCount ?? 'None declared'),
      bankAccount: '',
      ifsc: typeof income.ifscCode === 'string' ? income.ifscCode : '',
      rationCardNumber: typeof income.rationCardNumber === 'string' ? income.rationCardNumber : '',
    },
  };
}

function landOwnershipAcres(value: string) {
  if (value === 'Landless') return 0;
  if (value === 'Less than 1 acre') return 0.5;
  if (value === '1–2 acres') return 1.5;
  if (value === 'More than 2 acres') return 2.1;
  return undefined;
}

function houseType(value: string): FamilyMutationInput['income']['houseType'] {
  if (value === 'Pucca') return 'PUCCA';
  if (value === 'Semi-pucca') return 'SEMI_PUCCA';
  if (value === 'Kutcha') return 'KUTCHA';
  if (value === 'Homeless / temporary') return 'TEMPORARY';
  return undefined;
}

function uploadedDocumentTypes(family: ApiFamily) {
  const documents = (family as { documents?: unknown }).documents;
  if (!Array.isArray(documents)) return new Set<string>();
  return new Set(documents.flatMap((document) => {
    const type = asRecord(document).type;
    return typeof type === 'string' ? [type] : [];
  }));
}

function toFamilyInput(values: FamilyOnboardingValues, districtId: string, villageId: string): FamilyMutationInput {
  const details = values.familyDetails;
  return {
    headName: details.familyHeadName,
    fatherOrHusbandName: details.fatherOrHusbandName || undefined,
    mobile: details.mobileNumber.replace(/\D/g, ''),
    aadhaarNumber: details.aadhaarNumber.replace(/\D/g, ''),
    tribalCommunity: details.tribalCommunity,
    casteCertificateNo: details.casteCertificateNumber || undefined,
    address: details.address,
    panchayatName: details.panchayat || undefined,
    districtId,
    villageId,
    state: details.state,
    members: values.members.map((member) => {
      const disabilityDeclared = !/^(no|none) disability declared$/i.test(member.disability.trim());
      return {
        name: member.name,
        gender: member.gender === 'Female' ? 'FEMALE' : member.gender === 'Male' ? 'MALE' : 'OTHER',
        dateOfBirth: member.dob || undefined,
        age: member.age,
        relationship: member.relationship,
        occupation: member.occupation || undefined,
        education: member.education || undefined,
        hasDisability: disabilityDeclared,
        disabilityType: disabilityDeclared ? member.disability : undefined,
        aadhaarNumber: member.aadhaarNumber.replace(/\D/g, '') || undefined,
        isStudent: /student|school|college|university/i.test(`${member.occupation} ${member.education}`),
      };
    }),
    income: {
      annualIncome: values.income.annualIncome,
      primaryOccupation: values.income.occupation || undefined,
      landOwnershipAcres: landOwnershipAcres(values.income.landOwnership),
      houseType: houseType(values.income.houseType),
      livestockCount: Number.parseInt(values.income.livestock, 10) || 0,
      hasBankAccount: Boolean(values.income.bankAccount),
      bankAccountNumber: values.income.bankAccount || undefined,
      ifscCode: values.income.ifsc || undefined,
      rationCardNumber: values.income.rationCardNumber || undefined,
    },
  };
}

function FamilyOnboardingRoute() {
  const { familyId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = Boolean(familyId);
  const familyQuery = useQuery({ queryKey: ['family', familyId], queryFn: () => familiesApi.get(familyId!), enabled: isEditing });
  const districtsQuery = useQuery({ queryKey: ['geography', 'districts'], queryFn: geographyApi.districts, staleTime: 5 * 60_000 });
  const [districtId, setDistrictId] = useState('');
  // A network interruption can happen after the draft is created but before all
  // documents are uploaded. Reuse that draft on retry instead of creating a
  // second household record.
  const [pendingFamilyId, setPendingFamilyId] = useState<string | null>(null);
  const familyDistrictId = familyQuery.data?.district?.id ?? '';
  useEffect(() => { if (familyDistrictId) setDistrictId(familyDistrictId); }, [familyDistrictId]);
  const villagesQuery = useQuery({ queryKey: ['geography', 'villages', districtId], queryFn: () => geographyApi.villages(districtId), enabled: Boolean(districtId), staleTime: 5 * 60_000 });

  const initialValues = useMemo(() => familyQuery.data ? toOnboardingValues(familyQuery.data) : undefined, [familyQuery.data]);
  const errors = [familyQuery.error, districtsQuery.error, villagesQuery.error].filter(Boolean);
  if ((isEditing && familyQuery.isLoading) || districtsQuery.isLoading || (Boolean(districtId) && villagesQuery.isLoading)) return <FullPageLoader />;
  if (errors.length) return <Box sx={{ maxWidth: 760, mx: 'auto', py: 5 }}><Paper variant="outlined" sx={{ p: 3 }}><Typography variant="h6">Could not prepare family onboarding</Typography><Typography color="text.secondary" sx={{ mt: 0.7 }}>{errors[0] instanceof Error ? errors[0].message : 'Please check your connection and try again.'}</Typography><Button sx={{ mt: 2 }} variant="contained" onClick={() => { void familyQuery.refetch(); void districtsQuery.refetch(); void villagesQuery.refetch(); }}>Try again</Button></Paper></Box>;

  const districts = districtsQuery.data ?? [];
  const villages = villagesQuery.data ?? [];
  const submit = async (values: FamilyOnboardingValues, files: FamilyOnboardingFiles) => {
    const selectedDistrict = districts.find((district) => district.name === values.familyDetails.district);
    const selectedVillage = villages.find((village) => village.name === values.familyDetails.village);
    if (!selectedDistrict || !selectedVillage) throw new Error('Choose a valid district and village before submitting.');
    const input = toFamilyInput(values, selectedDistrict.id, selectedVillage.id);
    const { aadhaarNumber: _aadhaarNumber, ...withoutAadhaar } = input;
    let updateInput: FamilyUpdateInput = withoutAadhaar;
    // Existing accounts never return raw banking values. Leaving them blank while
    // editing must preserve the protected values instead of marking the account absent.
    if (!values.income.bankAccount.trim()) {
      const { bankAccountNumber: _bankAccountNumber, ifscCode: _ifscCode, hasBankAccount: _hasBankAccount, ...safeIncome } = input.income;
      updateInput = { ...withoutAadhaar, income: safeIncome };
    }
    const family = familyId
      ? await familiesApi.update(familyId, updateInput)
      : pendingFamilyId
        ? await familiesApi.update(pendingFamilyId, updateInput)
        : await familiesApi.create(input);
    if (!familyId && !pendingFamilyId) setPendingFamilyId(family.id);
    const existingDocumentTypes = uploadedDocumentTypes(family);
    for (const [key, file] of Object.entries(files)) {
      if (!file) continue;
      const type = onboardingDocumentTypes[key as keyof typeof onboardingDocumentTypes];
      if (existingDocumentTypes.has(type)) continue;
      await familiesApi.uploadDocument(family.id, type, file);
      existingDocumentTypes.add(type);
    }
    if (!familyId && family.status === 'DRAFT') await familiesApi.submit(family.id);
    setPendingFamilyId(null);
    await queryClient.invalidateQueries({ queryKey: ['families'] });
    await queryClient.invalidateQueries({ queryKey: ['family', family.id] });
    navigate(`/families/${family.id}`, { replace: true });
  };

  return <FamilyOnboardingPage
    initialValues={initialValues}
    districts={districts.map((district) => district.name)}
    villages={villages.map((village) => village.name)}
    onDistrictChange={(districtName) => setDistrictId(districts.find((district) => district.name === districtName)?.id ?? '')}
    onSubmit={submit}
    offlineDraftKey={`tribalconnect:family-onboarding:${familyId ?? 'new'}`}
    requiredDocuments={isEditing ? [] : undefined}
    allowExistingAadhaar={isEditing}
    submitLabel={isEditing ? 'Update family profile' : 'Submit family registration'}
  />;
}

export default function App() {
  return <SessionBootstrap><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route element={<PublicOnly />}><Route path="/login" element={<LoginPage />} /></Route>

    <Route element={<RequireAuth />}>
      <Route element={<AppShell />}>
        <Route path="/eligibility" element={<EligibilityPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        <Route element={<RequireRole roles={staffRoles} />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/families" element={<FamiliesPage />} />
          <Route path="/families/:familyId" element={<FamilyDetailPage />} />
          <Route path="/families/:familyId/edit" element={<FamilyOnboardingRoute />} />
          <Route path="/onboarding" element={<FamilyOnboardingRoute />} />
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/villages" element={<VillagesPage />} />
        </Route>

        <Route element={<RequireRole roles={['SUPER_ADMIN']} />}><Route path="/admin/dashboard" element={<DashboardPage />} /></Route>
        <Route element={<RequireRole roles={['DEVELOPMENT_OFFICER']} />}><Route path="/officer/dashboard" element={<DashboardPage />} /></Route>
        <Route element={<RequireRole roles={['FIELD_VOLUNTEER']} />}><Route path="/volunteer/dashboard" element={<DashboardPage />} /></Route>

        <Route element={<RequireRole roles={['FIELD_VOLUNTEER']} />}><Route path="/field-visits" element={<FieldVolunteerPage />} /></Route>

        <Route element={<RequireRole roles={['SUPER_ADMIN', 'DEVELOPMENT_OFFICER']} />}>
          <Route path="/schemes" element={<SchemesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
        <Route element={<RequireRole roles={['SUPER_ADMIN']} />}><Route path="/admin" element={<AdminPage />} /></Route>
        <Route element={<RequireRole roles={['FAMILY']} />}><Route path="/portal" element={<FamilyPortalPage />} /><Route path="/family/dashboard" element={<FamilyPortalPage />} /></Route>
      </Route>
    </Route>
    <Route path="*" element={<NotFoundPage />} />
  </Routes></SessionBootstrap>;
}
