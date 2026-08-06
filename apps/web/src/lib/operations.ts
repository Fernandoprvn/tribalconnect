import { apiDownload, apiRequest } from './api';

type UnknownRecord = Record<string, unknown>;
type QueryValue = string | number | boolean | null | undefined;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const numberValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const booleanValue = (value: unknown): boolean | undefined => typeof value === 'boolean' ? value : undefined;

const unwrapData = (value: unknown): unknown => {
  const record = isRecord(value) ? value : undefined;
  return record && 'data' in record ? record.data : value;
};

const pick = (record: UnknownRecord | undefined, keys: string[]): unknown => {
  if (!record) return undefined;
  for (const key of keys) {
    if (key in record) return record[key];
  }
  return undefined;
};

function withQuery(path: string, values: Record<string, QueryValue>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export interface OperationsOption {
  id: string;
  label: string;
}

export interface DashboardFilters {
  districtId?: string;
  villageId?: string;
  officerId?: string;
  schemeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface DashboardFilterOptions {
  districts: OperationsOption[];
  villages: OperationsOption[];
  officers: OperationsOption[];
  schemes: OperationsOption[];
}

export interface DashboardMetric {
  value: number;
  change?: string;
  helper?: string;
  direction?: 'up' | 'down' | 'neutral';
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface SchemePerformancePoint {
  label: string;
  approved: number;
  inProgress: number;
}

export interface DashboardAttentionItem {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  href?: string;
  kind?: string;
}

export interface DashboardTarget {
  current: number;
  target: number;
  label?: string;
}

export interface DashboardData {
  kpis: {
    totalFamilies: DashboardMetric;
    verifiedFamilies: DashboardMetric;
    pendingVerification: DashboardMetric;
    approvedApplications: DashboardMetric;
    activeSchemes: DashboardMetric;
    villagesCovered: DashboardMetric;
    fieldVisits: DashboardMetric;
  };
  charts: {
    registrations: ChartPoint[];
    villageCoverage: ChartPoint[];
    applicationOutcomes: { approved: number; inProgress: number; pendingDocuments: number; rejected: number };
    schemePerformance: SchemePerformancePoint[];
  };
  attention: DashboardAttentionItem[];
  filters: DashboardFilterOptions;
  target: DashboardTarget | null;
  generatedAt?: string;
}

const emptyFilters: DashboardFilterOptions = { districts: [], villages: [], officers: [], schemes: [] };

function normalizeOption(value: unknown, index: number): OperationsOption | null {
  if (typeof value === 'string' && value.trim()) return { id: value, label: value };
  const record = isRecord(value) ? value : undefined;
  if (!record) return null;
  const label = stringValue(pick(record, ['label', 'name', 'fullName', 'title', 'code'])) ?? `Option ${index + 1}`;
  const id = stringValue(pick(record, ['id', 'value', 'code'])) ?? label;
  return { id, label };
}

function normalizeOptions(value: unknown): OperationsOption[] {
  return asArray(value)
    .map(normalizeOption)
    .filter((item): item is OperationsOption => item !== null);
}

function normalizeFilters(value: unknown): DashboardFilterOptions {
  const record = isRecord(value) ? value : undefined;
  if (!record) return emptyFilters;
  return {
    districts: normalizeOptions(pick(record, ['districts', 'districtOptions'])),
    villages: normalizeOptions(pick(record, ['villages', 'villageOptions'])),
    officers: normalizeOptions(pick(record, ['officers', 'officerOptions', 'users'])),
    schemes: normalizeOptions(pick(record, ['schemes', 'schemeOptions'])),
  };
}

function normalizeMetric(value: unknown): DashboardMetric {
  const numeric = numberValue(value);
  if (numeric !== undefined) return { value: numeric };
  const record = isRecord(value) ? value : undefined;
  const rawDirection = stringValue(record ? pick(record, ['direction', 'trendDirection']) : undefined)?.toLowerCase();
  const direction = rawDirection === 'up' || rawDirection === 'down' || rawDirection === 'neutral' ? rawDirection : undefined;
  return {
    value: numberValue(record ? pick(record, ['value', 'count', 'total', 'current']) : undefined) ?? 0,
    change: stringValue(record ? pick(record, ['change', 'delta', 'trend']) : undefined),
    helper: stringValue(record ? pick(record, ['helper', 'label', 'description']) : undefined),
    direction,
  };
}

function normalizePoint(value: unknown, index: number, labels: string[] = []): ChartPoint {
  const numeric = numberValue(value);
  if (numeric !== undefined) return { label: labels[index] ?? `Period ${index + 1}`, value: numeric };
  const record = isRecord(value) ? value : undefined;
  return {
    label: stringValue(record ? pick(record, ['label', 'name', 'month', 'village', 'scheme', 'period']) : undefined) ?? labels[index] ?? `Period ${index + 1}`,
    value: numberValue(record ? pick(record, ['value', 'count', 'total', 'families', 'registered', 'registeredFamilies', 'verified', 'coverage']) : undefined) ?? 0,
  };
}

function normalizePoints(value: unknown): ChartPoint[] {
  const record = isRecord(value) ? value : undefined;
  const labels = asArray(record?.labels).map(stringValue).filter((label): label is string => Boolean(label));
  const entries = asArray(record?.data).length ? asArray(record?.data) : asArray(value);
  if (entries.length) return entries.map((item, index) => normalizePoint(item, index, labels));
  if (record) {
    return Object.entries(record)
      .map(([label, count]) => ({ label, value: numberValue(count) }))
      .filter((item): item is ChartPoint => item.value !== undefined);
  }
  return [];
}

function normalizeOutcomes(value: unknown) {
  if (Array.isArray(value)) {
    const counts = new Map(asArray(value).map((item) => {
      const record = isRecord(item) ? item : {};
      return [stringValue(record.status)?.toUpperCase() ?? '', numberValue(record.count) ?? 0] as const;
    }));
    return {
      approved: counts.get('APPROVED') ?? 0,
      inProgress: ['RECOMMENDED', 'SUBMITTED', 'UNDER_REVIEW'].reduce((total, status) => total + (counts.get(status) ?? 0), 0),
      pendingDocuments: counts.get('PENDING_DOCUMENTS') ?? 0,
      rejected: counts.get('REJECTED') ?? 0,
    };
  }
  const record = isRecord(value) ? value : undefined;
  return {
    approved: numberValue(pick(record, ['approved', 'APPROVED'])) ?? 0,
    inProgress: numberValue(pick(record, ['inProgress', 'in_progress', 'underReview', 'submitted'])) ?? 0,
    pendingDocuments: numberValue(pick(record, ['pendingDocuments', 'pending_documents', 'documentVerification'])) ?? 0,
    rejected: numberValue(pick(record, ['rejected', 'REJECTED'])) ?? 0,
  };
}

function normalizeSchemePerformance(value: unknown): SchemePerformancePoint[] {
  return asArray(value).map((item, index) => {
    const record = isRecord(item) ? item : undefined;
    return {
      label: stringValue(record ? pick(record, ['label', 'name', 'scheme']) : undefined) ?? `Scheme ${index + 1}`,
      approved: numberValue(record ? pick(record, ['approved', 'approvedApplications']) : undefined) ?? 0,
      inProgress: numberValue(record ? pick(record, ['inProgress', 'in_progress', 'pending', 'submitted']) : undefined) ?? 0,
    };
  });
}

function normalizeAttention(value: unknown): DashboardAttentionItem[] {
  return asArray(value).map((item, index) => {
    const record = isRecord(item) ? item : undefined;
    const id = stringValue(record ? pick(record, ['id', 'familyId', 'applicationId']) : undefined) ?? `attention-${index + 1}`;
    const familyId = stringValue(record?.familyId);
    return {
      id,
      title: stringValue(record ? pick(record, ['title', 'label', 'headName', 'name', 'familyName']) : undefined) ?? 'Case needs attention',
      subtitle: stringValue(record ? pick(record, ['subtitle', 'description', 'village', 'applicationNumber']) : undefined) ?? (numberValue(record?.count) !== undefined ? `${numberValue(record?.count)} record${numberValue(record?.count) === 1 ? '' : 's'} require attention` : undefined),
      status: stringValue(record ? pick(record, ['status', 'workflowStatus', 'type']) : undefined),
      href: stringValue(record?.href) ?? (familyId ? `/families/${familyId}` : undefined),
      kind: stringValue(record ? pick(record, ['kind', 'type']) : undefined),
    };
  });
}

function normalizeTarget(value: unknown): DashboardTarget | null {
  const record = isRecord(value) ? value : undefined;
  if (!record) return null;
  const current = numberValue(pick(record, ['current', 'value', 'verifiedFamilies', 'registeredFamilies'])) ?? 0;
  const target = numberValue(pick(record, ['target', 'goal', 'targetFamilies'])) ?? 0;
  return target > 0 ? { current, target, label: stringValue(record.label) } : null;
}

function normalizeDashboard(payload: unknown): DashboardData {
  const data = isRecord(unwrapData(payload)) ? unwrapData(payload) as UnknownRecord : {};
  const kpis = isRecord(pick(data, ['kpis', 'metrics', 'summary'])) ? pick(data, ['kpis', 'metrics', 'summary']) as UnknownRecord : {};
  const charts = isRecord(pick(data, ['charts', 'chartData'])) ? pick(data, ['charts', 'chartData']) as UnknownRecord : {};
  const outcomes = pick(charts, ['applicationOutcomes', 'outcomes', 'applications']) ?? pick(data, ['applicationOutcomes', 'outcomes']);
  const villageCoverage = normalizePoints(pick(charts, ['villageCoverage', 'coverageByVillage', 'familiesByVillage']) ?? pick(data, ['villageCoverage']));
  return {
    kpis: {
      totalFamilies: normalizeMetric(pick(kpis, ['totalFamilies', 'families', 'registeredFamilies'])),
      verifiedFamilies: normalizeMetric(pick(kpis, ['verifiedFamilies', 'verifiedProfiles', 'approvedFamilies'])),
      pendingVerification: normalizeMetric(pick(kpis, ['pendingVerification', 'pendingFamilies', 'pendingProfiles'])),
      approvedApplications: normalizeMetric(pick(kpis, ['approvedApplications', 'approved'])),
      activeSchemes: normalizeMetric(pick(kpis, ['activeSchemes', 'schemes'])),
      villagesCovered: normalizeMetric(pick(kpis, ['villagesCovered', 'coveredVillages']) ?? villageCoverage.filter((point) => point.value > 0).length),
      fieldVisits: normalizeMetric(pick(kpis, ['fieldVisits', 'completedVisits', 'fieldVisitsCompleted'])),
    },
    charts: {
      registrations: normalizePoints(pick(charts, ['registrations', 'registrationTrend', 'familyRegistrations']) ?? pick(data, ['registrationTrend'])),
      villageCoverage,
      applicationOutcomes: normalizeOutcomes(outcomes),
      schemePerformance: normalizeSchemePerformance(pick(charts, ['schemePerformance', 'schemes']) ?? pick(data, ['schemePerformance'])),
    },
    attention: normalizeAttention(pick(data, ['attention', 'attentionNeeded', 'actionRequired']) ?? pick(charts, ['attention'])),
    filters: normalizeFilters(pick(data, ['filters', 'filterOptions'])),
    target: normalizeTarget(pick(data, ['target', 'deliveryTarget']) ?? pick(kpis, ['target', 'deliveryTarget'])),
    generatedAt: stringValue(pick(data, ['generatedAt', 'updatedAt', 'refreshedAt'])),
  };
}

export const dashboardApi = {
  get: async (filters: DashboardFilters) => normalizeDashboard(await apiRequest<unknown>(withQuery('/dashboard', filters))),
  filters: async () => normalizeFilters(unwrapData(await apiRequest<unknown>('/dashboard/filters'))),
};

export type ReportKind = 'officers' | 'beneficiaries' | 'monthly';
export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ReportFilters extends DashboardFilters {
  report?: ReportKind;
}

export interface ReportSummary {
  schemePerformance: SchemePerformancePoint[];
  filters: DashboardFilterOptions;
  generatedAt?: string;
  totals: Record<string, number>;
}

function normalizeReportSummary(payload: unknown): ReportSummary {
  const data = isRecord(unwrapData(payload)) ? unwrapData(payload) as UnknownRecord : {};
  const summary = isRecord(pick(data, ['summary', 'report'])) ? pick(data, ['summary', 'report']) as UnknownRecord : data;
  const charts = isRecord(pick(summary, ['charts', 'chartData'])) ? pick(summary, ['charts', 'chartData']) as UnknownRecord : {};
  const totalsSource = isRecord(pick(summary, ['totals', 'kpis', 'metrics'])) ? pick(summary, ['totals', 'kpis', 'metrics']) as UnknownRecord : summary;
  const totals = Object.entries(totalsSource).reduce<Record<string, number>>((result, [key, value]) => {
    const metric = numberValue(value) ?? (isRecord(value) ? numberValue(pick(value, ['value', 'count', 'total'])) : undefined);
    if (metric !== undefined) result[key] = metric;
    return result;
  }, {});
  return {
    schemePerformance: normalizeSchemePerformance(pick(charts, ['schemePerformance', 'schemes']) ?? pick(summary, ['schemePerformance', 'byScheme'])),
    filters: normalizeFilters(pick(data, ['filters', 'filterOptions']) ?? pick(summary, ['filters', 'filterOptions'])),
    generatedAt: stringValue(pick(summary, ['generatedAt', 'updatedAt', 'refreshedAt']) ?? pick(data, ['generatedAt', 'updatedAt'])),
    totals,
  };
}

export const reportsApi = {
  summary: async (filters: ReportFilters) => normalizeReportSummary(await apiRequest<unknown>(withQuery('/reports/summary', filters))),
  download: async (format: ExportFormat, filters: ReportFilters) => {
    const { blob, filename } = await apiDownload(withQuery('/reports/export', { ...filters, format }));
    return { blob, fileName: filename || `tribalconnect-report.${format}` };
  },
};

export type NotificationStatusFilter = 'all' | 'unread' | 'read';

export interface OperationsNotification {
  id: string;
  title: string;
  body: string;
  status: string;
  read: boolean;
  channel?: string;
  createdAt?: string;
  metadata?: unknown;
}

export interface NotificationPreferences {
  sms: boolean;
  whatsapp: boolean;
  email: boolean;
  inApp: boolean;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function normalizeNotification(value: unknown, index: number): OperationsNotification {
  const record = isRecord(value) ? value : {};
  const status = stringValue(record.status)?.toUpperCase() ?? 'SENT';
  const read = booleanValue(record.read) ?? (Boolean(record.readAt) || status === 'READ');
  return {
    id: stringValue(record.id) ?? `notification-${index + 1}`,
    title: stringValue(pick(record, ['title', 'subject'])) ?? 'Portal update',
    body: stringValue(pick(record, ['body', 'message', 'content'])) ?? '',
    status,
    read,
    channel: stringValue(record.channel),
    createdAt: stringValue(pick(record, ['createdAt', 'sentAt', 'updatedAt'])),
    metadata: record.metadata,
  };
}

function normalizeMeta(value: unknown): PageMeta {
  const record = isRecord(value) ? value : {};
  const page = numberValue(record.page) ?? 1;
  const limit = numberValue(record.limit) ?? 25;
  const total = numberValue(record.total) ?? 0;
  return { page, limit, total, totalPages: numberValue(record.totalPages) ?? Math.max(1, Math.ceil(total / limit)) };
}

function normalizePreferences(value: unknown): NotificationPreferences {
  const record = isRecord(unwrapData(value)) ? unwrapData(value) as UnknownRecord : {};
  const channels = isRecord(record.channels) ? record.channels : record;
  return {
    sms: booleanValue(pick(channels, ['sms', 'SMS'])) ?? false,
    whatsapp: booleanValue(pick(channels, ['whatsapp', 'whatsApp', 'WHATSAPP'])) ?? false,
    email: booleanValue(pick(channels, ['email', 'EMAIL'])) ?? false,
    inApp: booleanValue(pick(channels, ['inApp', 'in_app', 'IN_APP'])) ?? true,
  };
}

export const notificationsApi = {
  list: async ({ page = 1, limit = 25, status = 'all' }: { page?: number; limit?: number; status?: NotificationStatusFilter } = {}) => {
    const payload = await apiRequest<unknown>(withQuery('/notifications', {
      page,
      limit,
      status: status === 'read' ? 'READ' : undefined,
      unread: status === 'unread' ? true : undefined,
    }));
    const envelope = isRecord(payload) ? payload : {};
    const data = unwrapData(payload);
    const dataRecord = isRecord(data) ? data : undefined;
    const entries = asArray(dataRecord?.items).length ? asArray(dataRecord?.items) : asArray(data);
    const normalized = entries.map(normalizeNotification);
    return {
      items: normalized,
      meta: normalizeMeta(envelope.meta ?? dataRecord?.meta),
    };
  },
  markRead: async (id: string) => {
    await apiRequest<unknown>(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
  },
  markAllRead: async () => { await apiRequest<unknown>('/notifications/read-all', { method: 'POST' }); },
  preferences: async () => normalizePreferences(await apiRequest<unknown>('/notifications/preferences')),
  updatePreferences: async (input: Partial<NotificationPreferences>) =>
    normalizePreferences(await apiRequest<unknown>('/notifications/preferences', { method: 'PATCH', json: input })),
};

export interface PortalSettings {
  profile: {
    fullName?: string;
    email?: string;
    mobile?: string;
    employeeId?: string;
    assignedGeography?: string;
  };
  language: string;
  system: Record<string, unknown>;
  notifications?: NotificationPreferences;
}

export interface SettingsUpdateInput {
  profile?: PortalSettings['profile'];
  language?: Record<string, unknown>;
  system?: Record<string, unknown>;
  notifications?: Partial<NotificationPreferences>;
}

function normalizeSettings(value: unknown): PortalSettings {
  const data = isRecord(unwrapData(value)) ? unwrapData(value) as UnknownRecord : {};
  const profileSource = isRecord(pick(data, ['profile', 'user', 'account'])) ? pick(data, ['profile', 'user', 'account']) as UnknownRecord : data;
  const wrappedSystem = pick(data, ['system', 'systemSettings']);
  const system = isRecord(wrappedSystem)
    ? wrappedSystem
    : Object.fromEntries(Object.entries(data).filter(([key]) => !['profile', 'user', 'account', 'notifications', 'notificationPreferences', 'preferences', 'language', 'locale'].includes(key)));
  const notificationValue = pick(data, ['notifications', 'notificationPreferences', 'preferences']);
  const rawLanguage = pick(data, ['language', 'locale']);
  const language = stringValue(rawLanguage) ?? (isRecord(rawLanguage) ? stringValue(pick(rawLanguage, ['value', 'locale', 'default'])) : undefined) ?? 'English';
  return {
    profile: {
      fullName: stringValue(pick(profileSource, ['fullName', 'name', 'displayName'])),
      email: stringValue(profileSource.email),
      mobile: stringValue(profileSource.mobile),
      employeeId: stringValue(pick(profileSource, ['employeeId', 'staffId'])),
      assignedGeography: stringValue(pick(profileSource, ['assignedGeography', 'geography', 'districtName'])),
    },
    language,
    system,
    notifications: notificationValue === undefined ? undefined : normalizePreferences(notificationValue),
  };
}

export const settingsApi = {
  get: async () => normalizeSettings(await apiRequest<unknown>('/settings')),
  update: async (input: SettingsUpdateInput) => normalizeSettings(await apiRequest<unknown>('/settings', { method: 'PATCH', json: input })),
};

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  actorName?: string;
  createdAt?: string;
}

export const auditApi = {
  list: async ({ page = 1, limit = 10 }: { page?: number; limit?: number } = {}) => {
    const payload = await apiRequest<unknown>(withQuery('/audit-logs', { page, limit }));
    const envelope = isRecord(payload) ? payload : {};
    const data = unwrapData(payload);
    const dataRecord = isRecord(data) ? data : undefined;
    const entries = asArray(dataRecord?.items).length ? asArray(dataRecord?.items) : asArray(data);
    return {
      items: entries.map((value, index): AuditLogEntry => {
        const record = isRecord(value) ? value : {};
        return {
          id: stringValue(record.id) ?? `audit-${index + 1}`,
          action: stringValue(record.action) ?? 'Updated record',
          entityType: stringValue(record.entityType) ?? 'System',
          entityId: stringValue(record.entityId),
          actorName: stringValue(pick(record, ['actorName', 'userName'])) ?? (isRecord(record.actor) ? stringValue(record.actor.fullName) : undefined),
          createdAt: stringValue(record.createdAt),
        };
      }),
      meta: normalizeMeta(envelope.meta ?? dataRecord?.meta),
    };
  },
};
