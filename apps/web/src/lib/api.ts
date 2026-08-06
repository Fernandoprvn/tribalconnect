import type { UserRole } from '../types';

const configuredBaseUrl = import.meta.env.VITE_API_URL?.trim() || '/api';
export const API_BASE_URL = configuredBaseUrl.replace(/\/+$/, '');

export interface ApiUser {
  id: string;
  fullName: string;
  mobile: string;
  email: string | null;
  role: UserRole;
  familyId: string | null;
  avatarUrl: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  user: ApiUser;
}

export interface OtpRequestResponse {
  message: string;
  mobile: string;
  expiresAt: string;
  /** Present only when the API is intentionally running in development OTP mode. */
  developmentCode?: string;
}

export interface ApiListResponse<T> {
  data: T[];
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiDataResponse<T> {
  data: T;
}

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type AuthRuntime = {
  getAccessToken: () => string | null;
  refresh: () => Promise<boolean>;
  onUnauthorized: () => void;
};

let authRuntime: AuthRuntime | null = null;

/**
 * Keeps the API module independent of Redux while allowing one transparent retry
 * after an expired access token has been refreshed by the session store.
 */
export function configureApiAuthentication(runtime: AuthRuntime | null) {
  authRuntime = runtime;
}

type RequestOptions = Omit<RequestInit, 'body' | 'headers'> & {
  body?: BodyInit | null;
  headers?: HeadersInit;
  json?: unknown;
  authenticated?: boolean;
  retryOnUnauthorized?: boolean;
};

function apiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function responseMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'object' && payload !== null) {
    const candidate = payload as { message?: unknown; error?: unknown };
    if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message;
    if (typeof candidate.error === 'string' && candidate.error.trim()) return candidate.error;
    if (
      typeof candidate.error === 'object'
      && candidate.error !== null
      && 'message' in candidate.error
      && typeof candidate.error.message === 'string'
      && candidate.error.message.trim()
    ) return candidate.error.message;
  }
  return fallback;
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  const text = await response.text();
  return text || undefined;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    authenticated = true,
    retryOnUnauthorized = true,
    headers: suppliedHeaders,
    json,
    body,
    ...init
  } = options;
  const headers = new Headers(suppliedHeaders);
  const accessToken = authenticated ? authRuntime?.getAccessToken() : null;
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (json !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      body: json !== undefined ? JSON.stringify(json) : body,
      headers,
      credentials: init.credentials ?? 'include',
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? `Could not reach the service: ${error.message}` : 'Could not reach the service.',
      0,
    );
  }

  if (response.status === 401 && authenticated && retryOnUnauthorized && authRuntime) {
    const refreshed = await authRuntime.refresh();
    if (refreshed) return apiRequest<T>(path, { ...options, retryOnUnauthorized: false });
    authRuntime.onUnauthorized();
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw new ApiError(responseMessage(payload, `Request failed (${response.status}).`), response.status, payload);
  }
  return payload as T;
}

function filenameFromDisposition(value: string | null) {
  const match = value?.match(/filename\*?=(?:UTF-8''|\")?([^;\"]+)/i);
  return match?.[1] ? decodeURIComponent(match[1].trim()) : undefined;
}

/**
 * Fetches an authenticated file and retries once after refreshing an expired
 * access token. Supplying a filename also starts a browser download.
 */
export async function apiDownload(path: string, filename?: string) {
  const fetchFile = async (retryOnUnauthorized: boolean): Promise<Response> => {
    const headers = new Headers();
    const accessToken = authRuntime?.getAccessToken();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    let response: Response;
    try {
      response = await fetch(apiUrl(path), { headers, credentials: 'include' });
    } catch (error) {
      throw new ApiError(error instanceof Error ? `Could not reach the service: ${error.message}` : 'Could not reach the service.', 0);
    }
    if (response.status === 401 && retryOnUnauthorized && authRuntime && await authRuntime.refresh()) {
      return fetchFile(false);
    }
    if (response.status === 401) authRuntime?.onUnauthorized();
    if (!response.ok) {
      const payload = await readPayload(response);
      throw new ApiError(responseMessage(payload, `Download failed (${response.status}).`), response.status, payload);
    }
    return response;
  };

  const response = await fetchFile(true);
  const blob = await response.blob();
  const resolvedFilename = filename || filenameFromDisposition(response.headers.get('content-disposition')) || 'tribalconnect-download';
  if (filename && typeof document !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = resolvedFilename;
    link.click();
    URL.revokeObjectURL(url);
  }
  return { blob, filename: resolvedFilename };
}

export const authApi = {
  requestOtp: (input: { mobile: string; role: UserRole }) => apiRequest<OtpRequestResponse>('/auth/request-otp', {
    method: 'POST',
    authenticated: false,
    retryOnUnauthorized: false,
    json: input,
  }),
  verifyOtp: (input: { mobile: string; role: UserRole; code: string }) => apiRequest<AuthSession>('/auth/verify-otp', {
    method: 'POST',
    authenticated: false,
    retryOnUnauthorized: false,
    json: input,
  }),
  refresh: (refreshToken?: string) => apiRequest<AuthSession>('/auth/refresh', {
    method: 'POST',
    authenticated: false,
    retryOnUnauthorized: false,
    json: refreshToken ? { refreshToken } : {},
  }),
  logout: (refreshToken?: string) => apiRequest<void>('/auth/logout', {
    method: 'POST',
    authenticated: false,
    retryOnUnauthorized: false,
    json: refreshToken ? { refreshToken } : {},
  }),
  me: () => apiRequest<{ user: ApiUser }>('/auth/me'),
};

export type FamilyMemberInput = {
  name: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  dateOfBirth?: string;
  age?: number;
  relationship: string;
  occupation?: string;
  education?: string;
  hasDisability?: boolean;
  disabilityType?: string;
  aadhaarNumber?: string;
  isStudent?: boolean;
};

export type FamilyIncomeInput = {
  annualIncome: number;
  primaryOccupation?: string;
  landOwnershipAcres?: number;
  houseType?: 'PUCCA' | 'SEMI_PUCCA' | 'KUTCHA' | 'TEMPORARY';
  livestockCount?: number;
  hasBankAccount?: boolean;
  bankAccountNumber?: string;
  ifscCode?: string;
  rationCardNumber?: string;
};

export type FamilyUpdateInput = Omit<Partial<FamilyMutationInput>, 'income'> & {
  income?: Partial<FamilyIncomeInput>;
};

export interface FamilyMutationInput {
  headName: string;
  fatherOrHusbandName?: string;
  mobile: string;
  aadhaarNumber: string;
  tribalCommunity: string;
  casteCertificateNo?: string;
  address: string;
  panchayatName?: string;
  districtId: string;
  villageId: string;
  state: string;
  isWidow?: boolean;
  latitude?: number;
  longitude?: number;
  members: FamilyMemberInput[];
  income: FamilyIncomeInput;
}

export interface ApiFamily {
  id: string;
  familyCode: string;
  headName: string;
  mobile: string;
  aadhaarMasked: string;
  status: string;
  district?: { id: string; name: string };
  village?: { id: string; name: string };
  [key: string]: unknown;
}

export interface UploadedFamilyDocument {
  id: string;
  type: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url?: string;
}

export interface EligibilityResult {
  schemeId: string;
  schemeCode: string;
  schemeName: string;
  eligible: boolean;
  reasons: string[];
  conditions: Array<{ key: string; passed: boolean; message: string }>;
  evaluatedAt: string;
  /** Kept optional for richer scheme responses added by later API versions. */
  scheme?: {
    id: string;
    code?: string;
    name: string;
    department?: string;
    description?: string;
    benefits?: string[];
    eligibilitySummary?: string | null;
    requiredDocuments?: string[];
  };
  [key: string]: unknown;
}

export interface EligibilityResponse {
  eligibleSchemes: EligibilityResult[];
  notEligibleSchemes: EligibilityResult[];
}

export const familiesApi = {
  list: async (filters: { search?: string; page?: number; limit?: number; districtId?: string; villageId?: string; status?: string[] } = {}) => {
    const query = new URLSearchParams();
    if (filters.search) query.set('search', filters.search);
    if (filters.page) query.set('page', String(filters.page));
    if (filters.limit) query.set('limit', String(filters.limit));
    if (filters.districtId) query.set('districtId', filters.districtId);
    if (filters.villageId) query.set('villageId', filters.villageId);
    if (filters.status?.length) query.set('status', filters.status.join(','));
    const suffix = query.size ? `?${query}` : '';
    return apiRequest<ApiListResponse<ApiFamily>>(`/families${suffix}`);
  },
  create: async (input: FamilyMutationInput) => (await apiRequest<ApiDataResponse<ApiFamily>>('/families', {
    method: 'POST',
    json: input,
  })).data,
  update: async (id: string, input: FamilyUpdateInput) => (await apiRequest<ApiDataResponse<ApiFamily>>(`/families/${id}`, {
    method: 'PATCH',
    json: input,
  })).data,
  get: async (id: string) => (await apiRequest<ApiDataResponse<ApiFamily>>(`/families/${id}`)).data,
  submit: async (id: string) => (await apiRequest<ApiDataResponse<ApiFamily>>(`/families/${id}/submit`, { method: 'POST' })).data,
  uploadDocument: async (familyId: string, type: string, file: File) => {
    const formData = new FormData();
    formData.set('type', type);
    formData.set('file', file);
    return (await apiRequest<ApiDataResponse<UploadedFamilyDocument>>(`/families/${familyId}/documents`, {
      method: 'POST',
      body: formData,
    })).data;
  },
  eligibility: async (familyId: string) => (await apiRequest<ApiDataResponse<EligibilityResponse>>(`/families/${familyId}/eligibility`)).data,
};

export interface GeographyDistrict {
  id: string;
  name: string;
  code?: string;
}

export interface GeographyVillage {
  id: string;
  name: string;
  districtId: string;
  panchayatName?: string | null;
}

/** Small geography endpoints keep onboarding aligned with the persisted district and village IDs. */
export const geographyApi = {
  districts: async () => (await apiRequest<ApiDataResponse<GeographyDistrict[]>>('/geography/districts')).data,
  villages: async (districtId: string) => (await apiRequest<ApiDataResponse<GeographyVillage[]>>(`/villages?districtId=${encodeURIComponent(districtId)}`)).data,
};

export interface SearchResult {
  id: string;
  type: 'family' | 'scheme' | 'village' | 'application';
  title: string;
  subtitle?: string;
  href?: string;
}

export const searchApi = {
  global: async (query: string) => (await apiRequest<ApiDataResponse<SearchResult[]>>(`/search?q=${encodeURIComponent(query)}`)).data,
};
