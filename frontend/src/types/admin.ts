import { type LucideIcon } from "lucide-react";

import { type PatientBloodGroupCode } from "@/features/patients/patients.types";

import { type EstablishmentType } from "./auth";
import {
  type PatientAdministrativeStatus,
  type PatientGender,
  type PatientInsurance,
  type PatientSector,
  type PatientStatus,
} from "./patient";
import {
  type AccountType,
  type BillingPeriod,
  type PaymentMethod,
  type SubscriptionStatus,
} from "./subscription";

// Re-exported rather than redefined: they already exist with the exact
// backend enum values (types/auth.ts, types/subscription.ts, types/patient.ts,
// features/patients/patients.types.ts).
export type {
  EstablishmentType,
  PatientAdministrativeStatus,
  PatientBloodGroupCode,
  PatientGender,
  PatientInsurance,
  PatientSector,
  PatientStatus,
  SubscriptionStatus,
};

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

// Wire shape returned by PATCH /admin/users/:id/suspend and /reactivate.
// Mirrors backend/src/admin/users/admin-users.service.ts#suspendUser and
// #reactivateUser. `status` is the resulting account status; after a
// reactivation it depends on prior verification, not always ACTIVE.
export type AdminUserStatusChangeResult = {
  message: string;
  status: RegisteredUserStatus;
};

// GET /admin/users/:id — mirrors backend/src/admin/users/admin-users.service.ts
// #getUserById. establishment/doctorProfile/verificationSummary are the raw
// Prisma records (subset of their fields), not the computed shapes of the
// verifications module (VerificationRequest/VerificationDocument above).
export type AdminUserEstablishmentSummary = {
  id: string;
  name: string;
  type: EstablishmentType;
  wilaya: string;
  address: string;
  professionalEmail: string;
  phone: string;
  managerFullName: string;
  verificationStatus: VerificationStatus;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
};

export type AdminUserDoctorProfileSummary = {
  id: string;
  speciality: string;
  wilaya: string;
  professionalAddress: string;
  isIndependent: boolean;
  establishmentId: string | null;
  verificationStatus: VerificationStatus;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
};

export type AdminUserVerificationSummary = {
  id: string;
  type: VerificationRequestType;
  status: VerificationStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  documents: {
    id: string;
    documentType: string;
    originalName: string;
    status: string;
    uploadedAt: string;
  }[];
};

export type AdminUserDetailResponse = {
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    role: RegisteredUserRole;
    accountStatus: RegisteredUserStatus;
    isEmailVerified: boolean;
    isPhoneVerified: boolean;
    createdAt: string;
    updatedAt: string;
  };
  establishment: AdminUserEstablishmentSummary | null;
  doctorProfile: AdminUserDoctorProfileSummary | null;
  verificationSummary: AdminUserVerificationSummary | null;
  // Actions performed BY this user (backend filters on AuditLog.userId).
  latestAuditLogs: AdminAuditLogItem[];
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

// GET /admin/patients — mirrors backend/src/admin/shared/admin-response.mapper.ts
// #mapAdminPatientListItem. ownerType is null when the owning establishment
// or doctor profile was deleted (onDelete: SetNull on Patient).
export type AdminPatientOwnerType = "ESTABLISHMENT" | "DOCTOR";

export type AdminPatientListItem = {
  id: string;
  firstName: string;
  firstNameAr: string;
  lastName: string;
  lastNameAr: string;
  gender: PatientGender;
  birthDate: string;
  nationalId: string;
  bloodGroup: PatientBloodGroupCode | null;
  phone: string;
  email: string | null;
  address: string;
  wilaya: string;
  commune: string;
  insurance: PatientInsurance;
  sector: PatientSector;
  hospitalRecordNumber: string | null;
  status: PatientStatus;
  administrativeStatus: PatientAdministrativeStatus;
  ownerType: AdminPatientOwnerType | null;
  ownerName: string;
  createdAt: string;
};

export type AdminPatientsQuery = {
  limit?: number;
  page?: number;
  search?: string;
  gender?: PatientGender;
  status?: PatientStatus;
  administrativeStatus?: PatientAdministrativeStatus;
  insurance?: PatientInsurance;
  sector?: PatientSector;
  bloodGroup?: PatientBloodGroupCode;
  wilaya?: string;
};

export type AdminPatientsResponse = {
  data: AdminPatientListItem[];
  meta: PaginationMeta;
};

// GET /admin/patients/:id — mirrors backend/src/admin/patients/
// admin-patients.service.ts#getPatientById. establishment/doctorProfile are
// the raw Prisma records (subset of their fields); latestAuditLogs spans the
// patient and its consultations/documents/AI analyses.
export type AdminPatientEstablishmentSummary = {
  id: string;
  name: string;
  wilaya: string;
  address: string;
  professionalEmail: string;
  phone: string;
  managerFullName: string;
};

export type AdminPatientDoctorProfileSummary = {
  id: string;
  speciality: string;
  wilaya: string;
  professionalAddress: string;
};

export type AdminPatientDetailResponse = {
  patient: AdminPatientListItem;
  establishment: AdminPatientEstablishmentSummary | null;
  doctorProfile: AdminPatientDoctorProfileSummary | null;
  latestAuditLogs: AdminAuditLogItem[];
};

// GET /admin/payments — mirrors backend/src/payments/admin/
// admin-payments.service.ts#listPayments (read-only in the admin UI for now).
export type AdminPaymentStatus =
  | "CREATED"
  | "WAITING_PAYMENT"
  | "WAITING_ADMIN_REVIEW"
  | "PAID"
  | "REJECTED"
  | "FAILED"
  | "CANCELED"
  | "EXPIRED";

// payment-proof.service.ts#toPublicProof (metadata only, never the file).
export type AdminPaymentProof = {
  id: string;
  documentType: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type AdminPaymentListItem = {
  id: string;
  reference: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  userRole: string;
  accountType: AccountType;
  plan: { id: string; name: string; code: string };
  amount: number;
  currency: string;
  billingPeriod: BillingPeriod;
  method: PaymentMethod;
  status: AdminPaymentStatus;
  createdAt: string;
  proof: AdminPaymentProof | null;
};

export type AdminPaymentsQuery = {
  limit?: number;
  page?: number;
  search?: string;
  method?: PaymentMethod;
  status?: AdminPaymentStatus;
  accountType?: AccountType;
  from?: string;
  to?: string;
};

export type AdminPaymentsResponse = {
  data: AdminPaymentListItem[];
  meta: PaginationMeta;
};

// GET /admin/payments/:id — #toAdminPaymentDetail. Not a superset of the list
// item: user fields are nested under `user` (no userName/userEmail/…), and
// plan carries accountType. subscription is the raw Prisma record, unused here.
export type AdminPaymentDetail = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  accountType: AccountType;
  billingPeriod: BillingPeriod;
  method: PaymentMethod;
  status: AdminPaymentStatus;
  provider: string | null;
  providerStatus: string | null;
  cardLast4: string | null;
  cardHolderName: string | null;
  paidAt: string | null;
  reviewedAt: string | null;
  adminNote: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    accountStatus: RegisteredUserStatus;
    email: string;
    fullName: string;
    phone: string;
    role: string;
  };
  plan: { id: string; name: string; code: string; accountType: AccountType };
  subscription: unknown;
  proof: AdminPaymentProof | null;
};

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
