import { NotFoundException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { UserRole } from '../common/enums/user-role.enum';
import { VerificationStatus } from '../common/enums/verification-status.enum';

// The fields of GET /account that PATCH /account/profile can change.
export type ProfileField =
  | 'fullName'
  | 'speciality'
  | 'wilaya'
  | 'establishmentName'
  | 'establishmentType'
  | 'phone'
  | 'address';

export type AccountKind = 'DOCTOR' | 'ESTABLISHMENT';

// The identity the professional verification checked: read-only once the
// account is VERIFIED. Changing it goes through a new verification request.
const IDENTITY_FIELDS: Record<AccountKind, readonly ProfileField[]> = {
  DOCTOR: ['fullName', 'speciality', 'wilaya'],
  ESTABLISHMENT: [
    'fullName',
    'establishmentName',
    'establishmentType',
    'wilaya',
  ],
};

// What each kind of account has: a doctor has no establishment name.
const KIND_FIELDS: Record<AccountKind, readonly ProfileField[]> = {
  DOCTOR: ['fullName', 'speciality', 'wilaya', 'phone', 'address'],
  ESTABLISHMENT: [
    'fullName',
    'establishmentName',
    'establishmentType',
    'wilaya',
    'phone',
    'address',
  ],
};

export const accountProfileSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  accountStatus: true,
  isEmailVerified: true,
  isPhoneVerified: true,
  createdAt: true,
  doctorProfile: {
    select: {
      id: true,
      speciality: true,
      wilaya: true,
      professionalAddress: true,
      isIndependent: true,
      verificationStatus: true,
      subscriptionStatus: true,
      establishment: { select: { name: true } },
    },
  },
  establishment: {
    select: {
      id: true,
      name: true,
      type: true,
      wilaya: true,
      address: true,
      professionalEmail: true,
      phone: true,
      managerFullName: true,
      verificationStatus: true,
      subscriptionStatus: true,
    },
  },
} satisfies Prisma.UserSelect;

export type AccountUserRow = Prisma.UserGetPayload<{
  select: typeof accountProfileSelect;
}>;

export function accountKindOf(role: string): AccountKind | null {
  if (role === UserRole.ESTABLISHMENT_ADMIN) {
    return 'ESTABLISHMENT';
  }

  if (
    role === UserRole.INDEPENDENT_DOCTOR ||
    role === UserRole.AFFILIATED_DOCTOR
  ) {
    return 'DOCTOR';
  }

  return null;
}

export function fieldsOfKind(kind: AccountKind): readonly ProfileField[] {
  return KIND_FIELDS[kind];
}

export function verificationStatusOf(user: AccountUserRow): string | null {
  return (
    user.doctorProfile?.verificationStatus ??
    user.establishment?.verificationStatus ??
    null
  );
}

export function lockedFieldsOf(
  kind: AccountKind,
  verificationStatus: string | null,
): readonly ProfileField[] {
  return verificationStatus === VerificationStatus.VERIFIED
    ? IDENTITY_FIELDS[kind]
    : [];
}

export function toAccountProfile(user: AccountUserRow) {
  const kind = accountKindOf(user.role);
  const verificationStatus = verificationStatusOf(user);
  const profile = user.doctorProfile ?? user.establishment;

  if (!kind || !profile || !verificationStatus) {
    throw new NotFoundException({
      code: 'ACCOUNT_PROFILE_NOT_FOUND',
      message: 'Profil introuvable.',
    });
  }

  return {
    id: user.id,
    kind,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    accountStatus: user.accountStatus,
    verificationStatus,
    subscriptionStatus: profile.subscriptionStatus,
    createdAt: user.createdAt,
    doctor: user.doctorProfile
      ? {
          speciality: user.doctorProfile.speciality,
          wilaya: user.doctorProfile.wilaya,
          address: user.doctorProfile.professionalAddress,
          isIndependent: user.doctorProfile.isIndependent,
          establishmentName: user.doctorProfile.establishment?.name ?? null,
        }
      : null,
    establishment: user.establishment
      ? {
          name: user.establishment.name,
          type: user.establishment.type,
          wilaya: user.establishment.wilaya,
          address: user.establishment.address,
          professionalEmail: user.establishment.professionalEmail,
          phone: user.establishment.phone,
          managerFullName: user.establishment.managerFullName,
        }
      : null,
    lockedFields: [...lockedFieldsOf(kind, verificationStatus)],
  };
}

export type AccountProfile = ReturnType<typeof toAccountProfile>;
