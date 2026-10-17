import {
  ConversationType,
  type Prisma,
  WorkspaceMembershipStatus,
} from '@prisma/client';

// Who may read a conversation, as Prisma filters for the queries over many
// of them (lists, counters, the dashboard). ConversationsService's
// getParticipation applies the same rules to one conversation.

// A group belongs to its workspace: a participant whose membership of that
// workspace is no longer ACTIVE (removed, suspended) loses it, in reading as
// in writing.
export function groupWorkspaceMemberWhere(
  userId: string,
): Prisma.ConversationWhereInput {
  return {
    OR: [
      { type: { not: ConversationType.GROUP } },
      {
        workspace: {
          memberships: {
            some: { status: WorkspaceMembershipStatus.ACTIVE, userId },
          },
        },
      },
    ],
  };
}

// A CASE discussion is readable only while its patient is in the user's
// scope (PatientsService.getPatientInScope: the patient belongs to the
// workspace the user works in). scopeWorkspaceId is that workspace, null
// when the user has none: then no CASE at all.
export function caseScopeWhere(
  scopeWorkspaceId: string | null,
): Prisma.ConversationWhereInput {
  return {
    OR: [
      { type: { not: ConversationType.CASE } },
      ...(scopeWorkspaceId
        ? [{ patient: { workspaceId: scopeWorkspaceId } }]
        : []),
    ],
  };
}
