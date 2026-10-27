import { type UseMutationResult } from "@tanstack/react-query";

import {
  type CreateTeamInvitationPayload,
  type TeamInvitation,
} from "../types/team.types";

type MemberStatusOutcome = { membershipId: string; accountStatus: string };

// Every mutation the page can trigger, as the hook answers them. Each feature
// component picks what it needs out of this type.
export type TeamActions = {
  createInvitation: UseMutationResult<
    TeamInvitation,
    Error,
    CreateTeamInvitationPayload
  >;
  reactivateMember: UseMutationResult<MemberStatusOutcome, Error, string>;
  resendInvitation: UseMutationResult<TeamInvitation, Error, string>;
  revokeInvitation: UseMutationResult<TeamInvitation, Error, string>;
  sendPasswordReset: UseMutationResult<{ message: string }, Error, string>;
  suspendMember: UseMutationResult<MemberStatusOutcome, Error, string>;
};
