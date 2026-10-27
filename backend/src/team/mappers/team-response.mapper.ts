import { WorkspaceMembershipStatus } from '@prisma/client';

import { type WorkspaceCapability } from '../../common/authorization/capabilities';

import { sanitizeTextInput } from '../../common/utils/sanitize';
import type { TeamInvitation, TeamMember, TeamOverview } from '../team.types';

export type MappedMember = {
  id: string;
  createdAt: Date;
  role: string;
  status: string;
  workspaceId: string;
  user: {
    id: string;
    fullName: string;
    email: string | null;
    accountStatus: string;
    isEmailVerified: boolean;
    doctorProfile: null | {
      id: string;
      speciality: string;
      wilaya: string;
      verificationStatus: string;
    };
  };
};

export type MappedInvitation = {
  acceptedAt: Date | null;
  createdAt: Date;
  email: string;
  expiresAt: Date;
  id: string;
  invitedBy: null | { fullName: string };
  revokedAt: Date | null;
  role: string;
  workspaceId: string;
};

type Scope = 'FULL' | 'BASIC';

export function invitationStatusOf(
  invitation: {
    acceptedAt: Date | null;
    expiresAt: Date;
    revokedAt: Date | null;
  },
  now: Date,
): TeamInvitation['status'] {
  if (invitation.acceptedAt !== null) {
    return 'USED';
  }
  if (invitation.revokedAt !== null) {
    return 'REVOKED';
  }
  if (invitation.expiresAt.getTime() <= now.getTime()) {
    return 'EXPIRED';
  }

  return 'PENDING';
}

export function mapTeamMember(row: MappedMember, scope: Scope): TeamMember {
  const doctorProfile = row.user.doctorProfile;

  return {
    accountStatus: row.user.accountStatus,
    doctor: doctorProfile
      ? {
          id: doctorProfile.id,
          speciality: doctorProfile.speciality,
          verificationStatus: doctorProfile.verificationStatus as NonNullable<
            TeamMember['doctor']
          >['verificationStatus'],
          wilaya: doctorProfile.wilaya,
        }
      : null,
    // A doctor of the workspace reads the directory only: no e-mail of a
    // managed workplace, no account administration.
    email: scope === 'FULL' ? row.user.email : null,
    fullName: sanitizeTextInput(row.user.fullName),
    isEmailVerified: scope === 'FULL' ? row.user.isEmailVerified : false,
    joinedAt: row.createdAt.toISOString(),
    membershipId: row.id,
    role: row.role as TeamMember['role'],
    userId: row.user.id,
  };
}

export function mapTeamInvitation(
  row: MappedInvitation,
  now: Date,
): TeamInvitation {
  return {
    createdAt: row.createdAt.toISOString(),
    email: row.email,
    expiresAt: row.expiresAt.toISOString(),
    id: row.id,
    invitedByFullName: row.invitedBy?.fullName ?? '',
    role: row.role as TeamInvitation['role'],
    status: invitationStatusOf(row, now),
  };
}

export type TeamOverviewInput = {
  capabilities: readonly WorkspaceCapability[];
  invitations: MappedInvitation[] | null;
  members: MappedMember[];
  scope: Scope;
  usage: { activeDoctors: number; maxDoctors: number | null } | null;
  workspaceId: string;
};

export function mapTeamOverview(input: TeamOverviewInput): TeamOverview {
  const scope = input.scope;
  const now = new Date();

  return {
    capabilities: [...input.capabilities],
    invitations:
      input.invitations === null
        ? null
        : input.invitations.map((invitation) =>
            mapTeamInvitation(invitation, now),
          ),
    members: input.members.map((member) => mapTeamMember(member, scope)),
    scope,
    usage: input.usage === null ? null : { ...input.usage },
  };
}

// Only ACTIVE members are a team someone can work with; a suspended member
// still shows in the list (the manager needs to see them) but not the other
// way round. The doctors count belongs to the entitlements, not here.
export function activeMembersFirst(
  members: readonly MappedMember[],
): MappedMember[] {
  return [...members].sort((first, second) => {
    const firstActive = first.status === WorkspaceMembershipStatus.ACTIVE;
    const secondActive = second.status === WorkspaceMembershipStatus.ACTIVE;

    if (firstActive !== secondActive) {
      return firstActive ? -1 : 1;
    }

    return first.createdAt.getTime() - second.createdAt.getTime();
  });
}
