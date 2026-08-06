import { apiRequest, type ApiDataResponse, type ApiListResponse, type EligibilityResponse, type EligibilityResult } from './api';

export type FamilyStatus = 'DRAFT' | 'SUBMITTED' | 'DOCUMENT_VERIFICATION' | 'FIELD_VISIT' | 'APPROVED' | 'REJECTED';
export type ApplicationStatus = 'RECOMMENDED' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'BENEFIT_RECEIVED';
export type SchemeStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type DocumentType = 'AADHAAR' | 'COMMUNITY_CERTIFICATE' | 'INCOME_CERTIFICATE' | 'RATION_CARD' | 'BANK_PASSBOOK' | 'PASSPORT_PHOTO' | 'HOUSE_PHOTO' | 'LAND_DOCUMENT' | 'OTHER';

export type NamedRecord = { id: string; name: string };
export type Officer = { id: string; fullName: string; mobile?: string | null };

export interface FamilyIncome {
  annualIncome: number | string;
  primaryOccupation?: string | null;
  landOwnershipAcres?: number | string | null;
  houseType?: string | null;
  livestockCount?: number | null;
  hasBankAccount?: boolean;
  bankAccountLast4?: string | null;
  ifscCode?: string | null;
  rationCardNumber?: string | null;
}

export interface FamilyMember {
  id: string;
  name: string;
  gender: string;
  dateOfBirth?: string | null;
  age?: number | null;
  relationship: string;
  occupation?: string | null;
  education?: string | null;
  hasDisability?: boolean;
  disabilityType?: string | null;
  aadhaarMasked?: string | null;
  isStudent?: boolean;
}

export interface FamilyDocument {
  id: string;
  type: DocumentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  rejectionNote?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
}

export interface FamilyWorkflowEvent {
  id: string;
  stage: string;
  title: string;
  note?: string | null;
  actorName?: string | null;
  actorId?: string | null;
  createdAt: string;
}

export interface FamilyFieldVisit {
  id: string;
  scheduledAt: string;
  completedAt?: string | null;
  status: string;
  purpose: string;
  notes?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  volunteer?: Officer | null;
}

export interface SchemeApplication {
  id: string;
  applicationNumber: string;
  status: ApplicationStatus;
  notes?: string | null;
  submittedAt?: string | null;
  decidedAt?: string | null;
  benefitReceivedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  family: Pick<PrimaryFamily, 'id' | 'familyCode' | 'headName' | 'mobile' | 'aadhaarMasked' | 'tribalCommunity'> & { district?: NamedRecord; village?: NamedRecord; assignedOfficer?: Officer | null };
  scheme: Pick<PrimaryScheme, 'id' | 'code' | 'name' | 'department' | 'status' | 'benefits'>;
  statusEvents?: ApplicationStatusEvent[];
}

export interface ApplicationStatusEvent {
  id: string;
  status: ApplicationStatus;
  note?: string | null;
  actorId?: string | null;
  createdAt: string;
}

export interface PrimaryFamily {
  id: string;
  familyCode: string;
  headName: string;
  fatherOrHusbandName?: string | null;
  mobile: string;
  aadhaarMasked: string;
  tribalCommunity: string;
  casteCertificateNo?: string | null;
  address?: string;
  panchayatName?: string | null;
  state?: string;
  status: FamilyStatus;
  isWidow?: boolean;
  district?: NamedRecord;
  village?: NamedRecord & { hamlet?: string | null; block?: NamedRecord | null; panchayat?: NamedRecord | null };
  assignedOfficer?: Officer | null;
  income?: FamilyIncome | null;
  members?: FamilyMember[];
  documents?: FamilyDocument[];
  applications?: SchemeApplication[];
  fieldVisits?: FamilyFieldVisit[];
  workflowEvents?: FamilyWorkflowEvent[];
  _count?: { members: number; documents: number; applications: number };
  createdAt: string;
  updatedAt: string;
}

export interface PrimaryScheme {
  id: string;
  code: string;
  name: string;
  department: string;
  description: string;
  benefits: string[];
  eligibilitySummary?: string | null;
  criteria: Record<string, unknown>;
  requiredDocuments: string[];
  lastDate?: string | null;
  status: SchemeStatus;
  applicationLink?: string | null;
  _count?: { applications: number };
  createdAt: string;
  updatedAt: string;
}

export interface PrimaryVillage {
  id: string;
  name: string;
  hamlet?: string | null;
  population: number;
  tribalFamilyCount: number;
  mapLatitude?: number | string | null;
  mapLongitude?: number | string | null;
  districtId: string;
  district: NamedRecord & { code?: string };
  block?: NamedRecord | null;
  panchayat?: NamedRecord | null;
  assignedOfficer?: Officer | null;
  _count?: { families: number; fieldVisits: number };
  statistics: { familyCount: number; pendingFamilies: number; applicationCount: number; schemeCount?: number; fieldVisitCount?: number };
  createdAt: string;
  updatedAt: string;
}

export interface District extends NamedRecord { code?: string }
export interface Block extends NamedRecord { districtId: string }
export interface Panchayat extends NamedRecord { blockId: string }

type QueryValue = string | number | boolean | undefined | null | string[];

function withQuery(path: string, query: Record<string, QueryValue>) {
  const values = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    values.set(key, Array.isArray(value) ? value.join(',') : String(value));
  });
  const suffix = values.size ? `?${values.toString()}` : '';
  return `${path}${suffix}`;
}

export function numberValue(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function dateLabel(value?: string | null, includeTime = false) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', includeTime ? { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' });
}

export function titleCase(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const primaryApi = {
  families: {
    list: (filters: { page?: number; limit?: number; search?: string; districtId?: string; villageId?: string; status?: FamilyStatus[] }) => apiRequest<ApiListResponse<PrimaryFamily>>(withQuery('/families', filters)),
    get: async (id: string) => (await apiRequest<ApiDataResponse<PrimaryFamily>>(`/families/${id}`)).data,
    timeline: async (id: string) => (await apiRequest<ApiDataResponse<{ workflow: FamilyWorkflowEvent[]; fieldVisits: FamilyFieldVisit[]; applications: Array<{ id: string; applicationNumber: string; scheme: string; status: ApplicationStatus; events: ApplicationStatusEvent[] }> }>>(`/families/${id}/timeline`)).data,
    eligibility: async (id: string) => (await apiRequest<ApiDataResponse<EligibilityResponse>>(`/families/${id}/eligibility`)).data,
    setStatus: async (id: string, input: { status: FamilyStatus; note?: string; rejectionReason?: string }) => (await apiRequest<ApiDataResponse<PrimaryFamily>>(`/families/${id}/status`, { method: 'POST', json: input })).data,
    verifyDocument: async (familyId: string, documentId: string, input: { status: DocumentStatus; rejectionNote?: string }) => (await apiRequest<ApiDataResponse<FamilyDocument>>(`/families/${familyId}/documents/${documentId}`, { method: 'PATCH', json: input })).data,
    addVisit: async (familyId: string, input: { scheduledAt: string; purpose: string; notes?: string; latitude?: number; longitude?: number; status?: 'SCHEDULED' | 'COMPLETED' }) => (await apiRequest<ApiDataResponse<FamilyFieldVisit>>(`/families/${familyId}/field-visits`, { method: 'POST', json: input })).data,
  },
  applications: {
    list: (filters: { page?: number; limit?: number; search?: string; familyId?: string; schemeId?: string; districtId?: string; villageId?: string; officerId?: string; status?: ApplicationStatus[] }) => apiRequest<ApiListResponse<SchemeApplication>>(withQuery('/applications', filters)),
    create: async (input: { familyId: string; schemeId: string; notes?: string }) => (await apiRequest<ApiDataResponse<SchemeApplication>>('/applications', { method: 'POST', json: input })).data,
    get: async (id: string) => (await apiRequest<ApiDataResponse<SchemeApplication>>(`/applications/${id}`)).data,
    history: async (id: string) => (await apiRequest<ApiDataResponse<{ applicationId: string; statuses: ApplicationStatusEvent[]; workflow: FamilyWorkflowEvent[] }>>(`/applications/${id}/history`)).data,
    setStatus: async (id: string, input: { status: ApplicationStatus; note?: string; rejectionReason?: string }) => (await apiRequest<ApiDataResponse<SchemeApplication>>(`/applications/${id}/status`, { method: 'POST', json: input })).data,
  },
  schemes: {
    list: (filters: { page?: number; limit?: number; search?: string; department?: string; status?: SchemeStatus[] }) => apiRequest<ApiListResponse<PrimaryScheme>>(withQuery('/schemes', filters)),
    get: async (id: string) => (await apiRequest<ApiDataResponse<PrimaryScheme>>(`/schemes/${id}`)).data,
    create: async (input: SchemeInput) => (await apiRequest<ApiDataResponse<PrimaryScheme>>('/schemes', { method: 'POST', json: input })).data,
    update: async (id: string, input: Partial<SchemeInput>) => (await apiRequest<ApiDataResponse<PrimaryScheme>>(`/schemes/${id}`, { method: 'PATCH', json: input })).data,
    activate: async (id: string) => (await apiRequest<ApiDataResponse<PrimaryScheme>>(`/schemes/${id}/activate`, { method: 'POST' })).data,
    deactivate: async (id: string, status: 'DRAFT' | 'ARCHIVED' = 'ARCHIVED') => (await apiRequest<ApiDataResponse<PrimaryScheme>>(`/schemes/${id}/deactivate`, { method: 'POST', json: { status } })).data,
    remove: (id: string) => apiRequest<void>(`/schemes/${id}`, { method: 'DELETE' }),
    eligibility: async (id: string, familyId: string) => (await apiRequest<ApiDataResponse<EligibilityResult>>(`/schemes/${id}/eligibility/${familyId}`)).data,
  },
  villages: {
    list: (filters: { page?: number; limit?: number; search?: string; districtId?: string }) => apiRequest<ApiListResponse<PrimaryVillage>>(withQuery('/villages', filters)),
    map: async (districtId?: string) => (await apiRequest<ApiDataResponse<PrimaryVillage[]>>(withQuery('/villages/map', { districtId }))).data,
    get: async (id: string) => (await apiRequest<ApiDataResponse<PrimaryVillage>>(`/villages/${id}`)).data,
    create: async (input: VillageInput) => (await apiRequest<ApiDataResponse<PrimaryVillage>>('/villages', { method: 'POST', json: input })).data,
    update: async (id: string, input: Partial<VillageInput>) => (await apiRequest<ApiDataResponse<PrimaryVillage>>(`/villages/${id}`, { method: 'PATCH', json: input })).data,
    assignOfficer: async (id: string, assignedOfficerId: string | null) => (await apiRequest<ApiDataResponse<PrimaryVillage>>(`/villages/${id}/assign-officer`, { method: 'POST', json: { assignedOfficerId } })).data,
    remove: (id: string) => apiRequest<void>(`/villages/${id}`, { method: 'DELETE' }),
  },
  geography: {
    districts: async () => (await apiRequest<ApiDataResponse<District[]>>('/geography/districts')).data,
    blocks: async (districtId?: string) => (await apiRequest<ApiDataResponse<Block[]>>(withQuery('/geography/blocks', { districtId }))).data,
    panchayats: async (districtId?: string, blockId?: string) => (await apiRequest<ApiDataResponse<Panchayat[]>>(withQuery('/geography/panchayats', { districtId, blockId }))).data,
    officers: async (districtId?: string) => (await apiRequest<ApiListResponse<Officer>>(withQuery('/admin/users', { districtId, role: 'DEVELOPMENT_OFFICER', status: 'ACTIVE', limit: 100 }))).data,
  },
};

export interface SchemeInput {
  code: string;
  name: string;
  department: string;
  description: string;
  benefits: string[];
  eligibilitySummary?: string;
  criteria: Record<string, unknown>;
  requiredDocuments: string[];
  lastDate?: string;
  status?: SchemeStatus;
  applicationLink?: string;
}

export interface VillageInput {
  name: string;
  hamlet?: string;
  population: number;
  tribalFamilyCount: number;
  mapLatitude?: number;
  mapLongitude?: number;
  districtId: string;
  blockId?: string | null;
  panchayatId?: string | null;
  assignedOfficerId?: string | null;
}
