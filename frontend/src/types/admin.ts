import { type LucideIcon } from "lucide-react";

export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  role: RegisteredUserRole;
};

export type AdminStats = {
  pendingRequests: number;
  verifiedRequests: number;
  rejectedRequests: number;
  registeredUsers: number;
  establishments: number;
  independentDoctors: number;
};

export type AdminDashboardStats = {
  pendingVerifications: number;
  verifiedRequests: number;
  rejectedRequests: number;
  totalUsers: number;
  establishments: number;
  independentDoctors: number;
};

export type VerificationRequestType = "ESTABLISHMENT" | "INDEPENDENT_DOCTOR";

export type VerificationStatus =
  | "NOT_STARTED"
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "REJECTED"
  | "SUSPENDED";

export type VerificationPriority = "NORMAL" | "REVIEW" | "URGENT";

export type VerificationDocument = {
  id: string;
  title: string;
  originalName?: string;
  type: string;
  required: boolean;
  status: "READY" | "UPLOADED" | "REJECTED";
  size: string;
  uploadedAt: string;
};

export type VerificationRequest = {
  id: string;
  requesterName: string;
  email: string;
  phone: string;
  type: VerificationRequestType;
  wilaya: string;
  commune: string;
  status: VerificationStatus;
  documentsCompleted: number;
  documentsTotal: number;
  submittedAt: string;
  updatedAt: string;
  completenessScore: number;
  priority: VerificationPriority;
};

export type AdminDashboardVerificationRequest = {
  id: string;
  type: VerificationRequestType;
  requesterName: string;
  email: string;
  phone: string;
  wilaya: string;
  status: VerificationStatus;
  submittedAt: string | null;
  updatedAt: string;
  documentsCount: number;
  requiredDocumentsCount: number;
  completenessScore: number;
};

export type AdminWeeklyVerificationActivity = {
  date: string;
  pending: number;
  verified: number;
  rejected: number;
};

export type AdminDashboardOverviewResponse = {
  stats: AdminDashboardStats;
  recentVerificationRequests: AdminDashboardVerificationRequest[];
  weeklyVerificationActivity: AdminWeeklyVerificationActivity[];
  usersDistribution: {
    establishments: number;
    independentDoctors: number;
  };
};

export type VerificationDecision = "APPROVED" | "REJECTED";

export type VerificationDetail = VerificationRequest & {
  registeredAt: string;
  mainInfo: Record<string, string>;
  legalInfo: Record<string, string>;
  documents: VerificationDocument[];
  timeline: Array<{
    id: string;
    label: string;
    date: string;
    status: "DONE" | "CURRENT" | "WAITING";
  }>;
};

export type RegisteredUserRole =
  | "SUPER_ADMIN"
  | "ADMIN_VERIFICATION"
  | "ESTABLISHMENT_ADMIN"
  | "INDEPENDENT_DOCTOR";

export type RegisteredUserStatus =
  | "BASIC_ACCOUNT"
  | "PENDING_VERIFICATION"
  | "VERIFIED_NO_PLAN"
  | "PAYMENT_PENDING"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED";

export type RegisteredUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: RegisteredUserRole;
  accountStatus: RegisteredUserStatus;
  verificationStatus: VerificationStatus;
  wilaya: string | null;
  createdAt: string;
};

export type AuditAction =
  | "ADMIN_LOGIN_SUCCESS"
  | "ADMIN_LOGIN_FAILED"
  | "ESTABLISHMENT_VERIFICATION_SUBMITTED"
  | "DOCTOR_VERIFICATION_SUBMITTED"
  | "VERIFICATION_APPROVED"
  | "VERIFICATION_REJECTED"
  | "LOGOUT";

export type AuditLog = {
  id: string;
  date: string;
  user: string;
  role: RegisteredUserRole;
  action: AuditAction;
  entity: string;
  ipAddress: string;
  userAgent: string;
  status: "SUCCESS" | "FAILED" | "INFO";
  details: string;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type SortOrder = "asc" | "desc";

export type AdminVerificationsQuery = {
  limit?: number;
  page?: number;
  search?: string;
  sortBy?: "submittedAt" | "updatedAt" | "status" | "type";
  sortOrder?: SortOrder;
  status?: VerificationStatus;
  submittedFrom?: string;
  submittedTo?: string;
  type?: VerificationRequestType;
  wilaya?: string;
};

export type AdminVerificationListItem = AdminDashboardVerificationRequest;

export type AdminVerificationsResponse = {
  data: AdminVerificationListItem[];
  meta: PaginationMeta;
};

export type AdminVerificationDocumentItem = {
  documentType: string;
  id: string;
  mimeType: string;
  originalName: string;
  size: number;
  status: "READY" | "UPLOADED" | "REJECTED";
  uploadedAt: string;
};

export type AdminVerificationDetailResponse = {
  adminChecklist: {
    canApprove: boolean;
    identityProvided: boolean;
    legalInfoProvided: boolean;
    professionalAuthorizationProvided: boolean;
    requiredDocumentsPresent: boolean;
    warnings: string[];
  };
  doctorProfile: Record<string, unknown> | null;
  documents: AdminVerificationDocumentItem[];
  establishment: Record<string, unknown> | null;
  history: AdminAuditLogItem[];
  id: string;
  rejectionReason: string | null;
  requester: {
    accountStatus: RegisteredUserStatus;
    email: string;
    name: string;
    phone: string;
    role: RegisteredUserRole;
    userId: string;
  };
  reviewedAt: string | null;
  status: VerificationStatus;
  submittedAt: string | null;
  type: VerificationRequestType;
  verificationData: Record<string, unknown> | null;
};

export type AdminVerificationDecisionResponse = {
  message: string;
  reason?: string;
  status: VerificationStatus;
};

export type AdminUsersQuery = {
  accountStatus?: RegisteredUserStatus;
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
  page?: number;
  role?: RegisteredUserRole;
  search?: string;
  sortBy?: "createdAt" | "fullName" | "email" | "role" | "accountStatus";
  sortOrder?: SortOrder;
  verificationStatus?: VerificationStatus;
  wilaya?: string;
};

export type AdminUsersResponse = {
  data: RegisteredUser[];
  meta: PaginationMeta;
};

export type AdminAuditLogItem = {
  action: string;
  createdAt: string;
  entityId: string | null;
  entityType: string;
  id: string;
  ipAddress: string | null;
  metadata: unknown;
  userAgent: string | null;
  userId: string | null;
  userName: string | null;
  userRole: RegisteredUserRole | null;
};

export type AdminAuditLogsQuery = {
  action?: string;
  entityType?: string;
  from?: string;
  ipAddress?: string;
  limit?: number;
  page?: number;
  role?: RegisteredUserRole;
  search?: string;
  sortBy?: "createdAt" | "action" | "entityType";
  sortOrder?: SortOrder;
  to?: string;
  userId?: string;
};

export type AdminAuditLogsResponse = {
  data: AdminAuditLogItem[];
  meta: PaginationMeta;
};

export type AdminNavItem = {
  href: string;
  icon: LucideIcon;
  key: string;
  labelKey: string;
  disabled?: boolean;
};
