import {
  type AuditLog,
  type DoctorProfile,
  type Establishment,
  type EstablishmentVerificationData,
  type DoctorVerificationData,
  type User,
  type VerificationDocument,
  type VerificationRequest,
} from '@prisma/client';

export type VerificationRequestForAdmin = VerificationRequest & {
  data?: EstablishmentVerificationData | null;
  doctorData?: DoctorVerificationData | null;
  documents?: VerificationDocument[];
  establishment?: Establishment | null;
  doctorProfile?: DoctorProfile | null;
  user: Pick<User, 'id' | 'fullName' | 'email' | 'phone' | 'role' | 'accountStatus'>;
};

export type PublicAdminVerificationDocument = {
  id: string;
  documentType: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: string;
  uploadedAt: Date;
};

export type PublicAdminVerificationListItem = {
  id: string;
  type: string;
  requesterName: string;
  email: string;
  phone: string;
  wilaya: string;
  status: string;
  submittedAt: Date | null;
  updatedAt: Date;
  documentsCount: number;
  requiredDocumentsCount: number;
  completenessScore: number;
};

export type PublicAdminUserListItem = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  accountStatus: string;
  verificationStatus: string;
  wilaya: string | null;
  createdAt: Date;
};

export type PublicAdminAuditLog = {
  id: string;
  userId: string | null;
  userName: string | null;
  userRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: unknown;
  createdAt: Date;
};

function getRequesterName(request: VerificationRequestForAdmin): string {
  if (request.type === 'ESTABLISHMENT') {
    return request.data?.name ?? request.establishment?.name ?? request.user.fullName;
  }

  return request.doctorData?.fullName ?? request.user.fullName;
}

function getRequesterWilaya(request: VerificationRequestForAdmin): string {
  if (request.type === 'ESTABLISHMENT') {
    return request.data?.wilaya ?? request.establishment?.wilaya ?? '';
  }

  return request.doctorData?.wilaya ?? request.doctorProfile?.wilaya ?? '';
}

function getVerificationEmail(request: VerificationRequestForAdmin): string {
  if (request.type === 'ESTABLISHMENT') {
    return request.data?.professionalEmail ?? request.user.email;
  }

  return request.doctorData?.professionalEmail ?? request.user.email;
}

function getVerificationPhone(request: VerificationRequestForAdmin): string {
  if (request.type === 'ESTABLISHMENT') {
    return request.data?.phone ?? request.user.phone;
  }

  return request.doctorData?.phone ?? request.user.phone;
}

export function mapVerificationListItem(
  request: VerificationRequestForAdmin,
  requiredDocumentsCount: number,
): PublicAdminVerificationListItem {
  const documentsCount =
    request.documents?.filter((document) => document.status === 'UPLOADED')
      .length ?? 0;

  return {
    id: request.id,
    type: request.type,
    requesterName: getRequesterName(request),
    email: getVerificationEmail(request),
    phone: getVerificationPhone(request),
    wilaya: getRequesterWilaya(request),
    status: request.status,
    submittedAt: request.submittedAt,
    updatedAt: request.updatedAt,
    documentsCount,
    requiredDocumentsCount,
    completenessScore:
      requiredDocumentsCount > 0
        ? Math.min(100, Math.round((documentsCount / requiredDocumentsCount) * 100))
        : 100,
  };
}

export function mapVerificationDocument(
  document: VerificationDocument,
): PublicAdminVerificationDocument {
  return {
    id: document.id,
    documentType: document.documentType,
    originalName: document.originalName,
    mimeType: document.mimeType,
    size: document.size,
    status: document.status,
    uploadedAt: document.uploadedAt,
  };
}

export function mapAdminUserListItem(
  user: Pick<
    User,
    'id' | 'fullName' | 'email' | 'phone' | 'role' | 'accountStatus' | 'createdAt'
  > & {
    establishment?: Pick<Establishment, 'wilaya' | 'verificationStatus'> | null;
    doctorProfile?: Pick<DoctorProfile, 'wilaya' | 'verificationStatus'> | null;
  },
): PublicAdminUserListItem {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    accountStatus: user.accountStatus,
    verificationStatus:
      user.establishment?.verificationStatus ??
      user.doctorProfile?.verificationStatus ??
      'NOT_STARTED',
    wilaya: user.establishment?.wilaya ?? user.doctorProfile?.wilaya ?? null,
    createdAt: user.createdAt,
  };
}

export function mapAuditLog(
  auditLog: AuditLog & {
    user?: Pick<User, 'fullName' | 'role'> | null;
  },
): PublicAdminAuditLog {
  return {
    id: auditLog.id,
    userId: auditLog.userId,
    userName: auditLog.user?.fullName ?? null,
    userRole: auditLog.user?.role ?? null,
    action: auditLog.action,
    entityType: auditLog.entityType,
    entityId: auditLog.entityId,
    ipAddress: auditLog.ipAddress,
    userAgent: auditLog.userAgent,
    metadata: auditLog.metadata,
    createdAt: auditLog.createdAt,
  };
}
