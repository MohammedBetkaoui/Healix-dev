// Wire types of backend/src/account (controller, DTOs, mapper).

export type AccountKind = "DOCTOR" | "ESTABLISHMENT";

// The fields PATCH /account/profile can change.
export type ProfileField =
  | "fullName"
  | "speciality"
  | "wilaya"
  | "establishmentName"
  | "establishmentType"
  | "phone"
  | "address";

export type AccountVerificationStatus =
  | "NOT_STARTED"
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "REJECTED"
  | "SUSPENDED";

export type AccountSubscriptionStatus = "NO_PLAN" | "PAYMENT_PENDING" | "TRIALING" | "ACTIVE" | "EXPIRED" | "CANCELED";

export type EstablishmentTypeValue = "CLINIC" | "HOSPITAL" | "IMAGING_CENTER" | "LABORATORY" | "GROUP_PRACTICE";

/** GET /account. */
export type AccountProfile = {
  id: string;
  kind: AccountKind;
  role: string;
  fullName: string;
  /** The login: read-only. */
  email: string;
  phone: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  accountStatus: string;
  verificationStatus: AccountVerificationStatus;
  subscriptionStatus: AccountSubscriptionStatus;
  createdAt: string;
  doctor: {
    speciality: string;
    wilaya: string;
    address: string;
    isIndependent: boolean;
    establishmentName: string | null;
  } | null;
  establishment: {
    name: string;
    type: EstablishmentTypeValue;
    wilaya: string;
    address: string;
    professionalEmail: string;
    phone: string;
    managerFullName: string;
  } | null;
  /** Read-only once the verification is approved. */
  lockedFields: ProfileField[];
};

/** PATCH /account/profile: only what changes. */
export type UpdateProfilePayload = Partial<Record<ProfileField, string>>;

/** POST /account/password. The confirmation never leaves the form. */
export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResult = {
  /** False when the request was tied to no session: all of them were closed. */
  keptCurrentSession: boolean;
  message: string;
  revokedSessions: number;
};

/** GET /account/sessions. */
export type AccountSession = {
  id: string;
  /** The session of this very request. */
  current: boolean;
  browser: string | null;
  os: string | null;
  /** Masked by the backend (41.200.x.x). */
  ipAddress: string | null;
  /** When the device last renewed its session. */
  createdAt: string;
  expiresAt: string;
};

export type RevokeSessionsResult = { revoked: number };
