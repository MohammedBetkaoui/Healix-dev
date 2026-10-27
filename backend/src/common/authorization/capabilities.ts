// Workspace capabilities
import { WorkspaceMembershipRole, WorkspaceType } from '@prisma/client';

// Fixed capability matrix: which operations a workspace membership role may
// perform. No per-user permission is stored in the database: the server alone
// decides, deny by default, and RECEPTIONIST (declared in the schema but not
// exposed in the interface yet) gets no capability at all.
//
// Names follow the permission the caller asks for, not the target kind:
// suspension applies to members (doctors for ADMIN, admins and doctors for
// OWNER), so team.suspendMember / team.reactivateMember cover both.
export type WorkspaceCapability =
  | 'organization.read'
  | 'organization.readBasic'
  | 'organization.update'
  | 'organization.updateOperational'
  | 'team.read'
  | 'team.readBasic'
  | 'team.inviteDoctor'
  | 'team.inviteAdmin'
  | 'team.revokeInvitation'
  | 'team.suspendMember'
  | 'team.reactivateMember'
  | 'team.sendPasswordReset'
  | 'subscription.manage'
  | 'verification.manage';

// Establishment workspaces only: private practices have no organization or
// team management in this version, so no role receives any capability there.
const CAPABILITIES_BY_ROLE: Record<
  WorkspaceMembershipRole,
  readonly WorkspaceCapability[]
> = {
  OWNER: [
    'organization.read',
    'organization.update',
    'organization.updateOperational',
    'team.read',
    'team.readBasic',
    'team.inviteDoctor',
    'team.inviteAdmin',
    'team.revokeInvitation',
    'team.suspendMember',
    'team.reactivateMember',
    'team.sendPasswordReset',
    'subscription.manage',
    'verification.manage',
  ],
  // An ADMIN runs the workspace day to day: operational organization and
  // doctor management, never owner-only actions (legal changes, subscription,
  // invitations of other admins).
  ADMIN: [
    'organization.read',
    'organization.readBasic',
    'organization.updateOperational',
    'team.read',
    'team.readBasic',
    'team.inviteDoctor',
    'team.revokeInvitation',
    'team.suspendMember',
    'team.reactivateMember',
    'team.sendPasswordReset',
  ],
  DOCTOR: ['organization.readBasic', 'team.readBasic'],
  RECEPTIONIST: [],
};

export function capabilitiesForWorkspaceRole(
  role: WorkspaceMembershipRole,
  workspaceType: WorkspaceType,
): WorkspaceCapability[] {
  if (workspaceType !== WorkspaceType.ESTABLISHMENT) {
    return [];
  }

  return [...CAPABILITIES_BY_ROLE[role]];
}

export function hasCapability(
  capabilities: readonly WorkspaceCapability[],
  capability: WorkspaceCapability,
): boolean {
  return capabilities.includes(capability);
}
