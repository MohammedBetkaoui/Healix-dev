import { NotFoundException } from '@nestjs/common';
import {
  WorkspaceMembershipRole,
  WorkspaceMembershipStatus,
  WorkspaceType,
  type Prisma,
} from '@prisma/client';

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
// An establishment account only carries its user-level identity here: the
// establishment's own identity lives in the verification, not in the account,
// and the account settings are no longer a back door into it.
const IDENTITY_FIELDS: Record<AccountKind, readonly ProfileField[]> = {
  DOCTOR: ['fullName', 'speciality', 'wilaya'],
  ESTABLISHMENT: [],
};

// What each kind of account has. An establishment account manages only its
// personal data (the administrator's own name and phone): the establishment
// name, type, address and professional contacts belong to the organization
// module; the legal identity stays in the verification data.
const KIND_FIELDS: Record<AccountKind, readonly ProfileField[]> = {
  DOCTOR: ['fullName', 'speciality', 'wilaya', 'phone', 'address'],
  ESTABLISHMENT: ['fullName', 'phone'],
};

// The establishment an account context may read, whatever way it is reached.
// Display context only: writing any of these fields goes through
// /establishment/organization, never through the account.
const establishmentContextSelect = {
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
} satisfies Prisma.EstablishmentSelect;

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
  establishment: { select: establishmentContextSelect },
  // A secondary administrator owns no establishment: the readable context
  // goes through their workspace instead. Same rules as the establishment
  // selection of WorkspaceContextService (an ACTIVE membership, an
  // establishment workspace, OWNER or ADMIN), same choice of the first
  // compatible workspace (createdAt then id): the account must always agree
  // with what the workspace-guarded routes serve.
  workspaceMemberships: {
    where: {
      role: {
        in: [WorkspaceMembershipRole.ADMIN, WorkspaceMembershipRole.OWNER],
      },
      status: WorkspaceMembershipStatus.ACTIVE,
      workspace: { type: WorkspaceType.ESTABLISHMENT },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      role: true,
      workspace: {
        select: { establishment: { select: establishmentContextSelect } },
      },
    },
    take: 1,
  },
} satisfies Prisma.UserSelect;

export type AccountUserRow = Prisma.UserGetPayload<{
  select: typeof accountProfileSelect;
}>;

// The establishment row an account context is built from: the row owned by
// the user, or the row of the workspace they manage — both come from the
// same establishmentContextSelect, so one type covers the two readings.
export type EstablishmentAccountRow = NonNullable<
  AccountUserRow['establishment']
>;

// How the establishment was reached, with the row itself: an owner reads the
// establishment they created, a secondary administrator reads the one their
// membership governs. The membership role (OWNER or ADMIN) names which one;
// an owner whose establishment carry no membership at all is still an owner.
export type EstablishmentAccountContext = {
  membershipRole: WorkspaceMembershipRole | null;
  profile: EstablishmentAccountRow;
};

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

// One resolver for the establishment of an establishment account, whatever
// the caller (the profile, the verification status of it):
// 1. the establishment the user owns, when there is one;
// 2. otherwise the establishment of the first ACTIVE membership an
//    establishment workspace carries (OWNER or ADMIN — the workspace rules);
// 3. otherwise no context at all.
// A workspace without its establishment row (deleted establishment) serves
// nothing: the context stays null.
export function resolveEstablishmentAccountContext(
  user: AccountUserRow,
): EstablishmentAccountContext | null {
  if (user.establishment) {
    return { membershipRole: null, profile: user.establishment };
  }

  const membership = user.workspaceMemberships[0];

  return membership?.workspace.establishment
    ? {
        membershipRole: membership.role,
        profile: membership.workspace.establishment,
      }
    : null;
}

// The professional verification of the account, read from the profile that
// carries it: a doctor reads their own profile, an establishment account —
// owner or managed — reads the establishment of their workspace.
export function verificationStatusOf(user: AccountUserRow): string | null {
  return (
    user.doctorProfile?.verificationStatus ??
    resolveEstablishmentAccountContext(user)?.profile.verificationStatus ??
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

const accountProfileNotFound = () =>
  new NotFoundException({
    code: 'ACCOUNT_PROFILE_NOT_FOUND',
    message: 'Profil introuvable.',
  });

export function toAccountProfile(user: AccountUserRow) {
  const kind = accountKindOf(user.role);
  const verificationStatus = verificationStatusOf(user);
  const establishmentContext =
    kind === 'ESTABLISHMENT' ? resolveEstablishmentAccountContext(user) : null;
  const profile = user.doctorProfile ?? establishmentContext?.profile ?? null;

  if (!kind || !profile || !verificationStatus) {
    throw accountProfileNotFound();
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
    // The workspace or establishment context, for display. Read-only in this
    // endpoint: the editable fields stay the account's own, the organization
    // fields answer on /establishment/organization.
    establishment: establishmentContext
      ? {
          name: establishmentContext.profile.name,
          type: establishmentContext.profile.type,
          wilaya: establishmentContext.profile.wilaya,
          address: establishmentContext.profile.address,
          professionalEmail: establishmentContext.profile.professionalEmail,
          phone: establishmentContext.profile.phone,
          managerFullName: establishmentContext.profile.managerFullName,
        }
      : null,
    lockedFields: [...lockedFieldsOf(kind, verificationStatus)],
  };
}

export type AccountProfile = ReturnType<typeof toAccountProfile>;
