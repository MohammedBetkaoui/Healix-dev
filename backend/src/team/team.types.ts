import { VerificationStatus, WorkspaceMembershipRole } from '@prisma/client';

import { type WorkspaceCapability } from '../common/authorization/capabilities';

// One member of the workspace, as the team page shows it. `email` is null in
// the BASIC scope (a doctor sees the team directory, not the contacts of a
// managed workspace), and so are `invitations` and `usage`.
export type TeamMember = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string | null;
  // The workspace role (OWNER, ADMIN, DOCTOR), what capability checks decide
  // from — not the user-level account role.
  role: WorkspaceMembershipRole;
  // The account status behind the member: a suspended member has a suspended
  // user account, the membership row itself stays ACTIVE.
  accountStatus: string;
  isEmailVerified: boolean;
  joinedAt: string;
  doctor: null | {
    id: string;
    speciality: string;
    wilaya: string;
    verificationStatus: VerificationStatus;
  };
};

export type TeamInvitation = {
  id: string;
  email: string;
  role: WorkspaceMembershipRole;
  // Derived: never stored as a column.
  status: 'PENDING' | 'EXPIRED' | 'REVOKED' | 'USED';
  expiresAt: string;
  createdAt: string;
  invitedByFullName: string;
};

export type TeamUsage = {
  // Active DOCTOR memberships, the same figure the quota gates count.
  activeDoctors: number;
  // The plan's quota; null = not limited. Never the pending invitations.
  maxDoctors: number | null;
};

export type TeamOverview = {
  capabilities: readonly WorkspaceCapability[];
  scope: 'FULL' | 'BASIC';
  members: TeamMember[];
  invitations: TeamInvitation[] | null;
  usage: TeamUsage | null;
};

export type TeamInvitationView = {
  id: string;
  email: string;
  role: WorkspaceMembershipRole;
  status: TeamInvitation['status'];
  expiresAt: string;
  createdAt: string;
  invitedByFullName: string;
};

export type InvitationInspection = {
  email: string;
  role: WorkspaceMembershipRole;
  workspaceName: string;
  establishmentName: string;
  expiresAt: string;
  status: TeamInvitation['status'];
  usable: boolean;
};

export type TeamMutationOutcome = {
  membershipId: string;
  accountStatus: string;
};
