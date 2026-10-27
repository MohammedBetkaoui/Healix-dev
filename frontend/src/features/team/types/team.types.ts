export type TeamMemberRole = "OWNER" | "ADMIN" | "DOCTOR" | "RECEPTIONIST";

export type TeamMemberAccountStatus = "ACTIVE" | "SUSPENDED";

export type TeamMemberVerificationStatus =
  | "NOT_STARTED"
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "REJECTED"
  | "SUSPENDED";

// One member of the workspace, as the team page shows it. `email` is null in
// the BASIC scope (a doctor sees the team directory, not the contacts of a
// managed workspace), and so are the invitations, the usage and the manager
// actions.
export type TeamMember = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string | null;
  // The workspace role (OWNER, ADMIN, DOCTOR), what capability checks decide
  // from — not the user-level account role.
  role: TeamMemberRole;
  // The account status behind the member: a suspended member has a suspended
  // user account, the membership row itself stays ACTIVE.
  accountStatus: TeamMemberAccountStatus;
  isEmailVerified: boolean;
  joinedAt: string;
  doctor: null | {
    id: string;
    speciality: string;
    wilaya: string;
    verificationStatus: TeamMemberVerificationStatus;
  };
};

export type TeamInvitationStatus = "PENDING" | "EXPIRED" | "REVOKED" | "USED";

export type TeamInvitation = {
  id: string;
  email: string;
  role: TeamMemberRole;
  // Derived: never stored as a column.
  status: TeamInvitationStatus;
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
  capabilities: string[];
  scope: "FULL" | "BASIC";
  members: TeamMember[];
  invitations: TeamInvitation[] | null;
  usage: TeamUsage | null;
};

// What the public end of a link announces before the invitee commits.
export type InvitationInspection = {
  email: string;
  role: TeamMemberRole;
  workspaceName: string;
  establishmentName: string;
  expiresAt: string;
  status: TeamInvitationStatus;
  usable: boolean;
};

export type AcceptTeamInvitationPayload = {
  token: string;
  fullName: string;
  phone: string;
  password: string;
  confirmPassword: string;
  speciality?: string;
  wilaya?: string;
  professionalAddress?: string;
};

export type AcceptTeamInvitationResult = {
  email: string;
  message: string;
};

export type CreateTeamInvitationPayload = {
  email: string;
  role: "ADMIN" | "DOCTOR";
};

export type CreateTeamInvitationResult = TeamInvitation;
