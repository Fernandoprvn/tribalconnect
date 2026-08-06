export type UserRole = 'SUPER_ADMIN' | 'DEVELOPMENT_OFFICER' | 'FIELD_VOLUNTEER' | 'FAMILY';
export type WorkflowStatus = 'Submitted' | 'Verification' | 'Field visit' | 'Approved' | 'Applied' | 'Benefit received' | 'Rejected';

export interface Family {
  id: string;
  applicationNo: string;
  headName: string;
  mobile: string;
  aadhaarMasked: string;
  community: string;
  village: string;
  panchayat: string;
  district: string;
  members: number;
  annualIncome: number;
  occupation: string;
  status: WorkflowStatus;
  registeredOn: string;
  officer: string;
  avatar: string;
  lastVisit?: string;
}

export interface Scheme {
  id: string;
  name: string;
  department: string;
  category: string;
  description: string;
  benefits: string;
  eligibility: string;
  requiredDocuments: string[];
  deadline: string;
  status: 'Active' | 'Closing soon' | 'Paused';
  applicants: number;
  approved: number;
  accent: string;
}

export interface Village {
  id: string;
  name: string;
  block: string;
  district: string;
  population: number;
  tribalFamilies: number;
  pendingCases: number;
  applications: number;
  officer: string;
  lat: number;
  lng: number;
  coverage: number;
}

export interface TimelineEvent {
  title: string;
  description: string;
  date: string;
  done: boolean;
  actor: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: string;
  type: 'success' | 'warning' | 'info';
  read: boolean;
}
