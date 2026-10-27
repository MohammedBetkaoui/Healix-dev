import { apiClient } from "@/lib/api/http-client";

import {
  type AcceptTeamInvitationPayload,
  type AcceptTeamInvitationResult,
  type CreateTeamInvitationPayload,
  type CreateTeamInvitationResult,
  type InvitationInspection,
  type TeamInvitation,
  type TeamOverview,
} from "../types/team.types";

export async function getTeam() {
  const { data } = await apiClient.get<TeamOverview>("/establishment/team");
  return data;
}

export async function createTeamInvitation(
  payload: CreateTeamInvitationPayload,
) {
  const { data } = await apiClient.post<CreateTeamInvitationResult>(
    "/establishment/team/invitations",
    payload,
  );
  return data;
}

export async function resendTeamInvitation(invitationId: string) {
  const { data } = await apiClient.post<TeamInvitation>(
    `/establishment/team/invitations/${encodeURIComponent(invitationId)}/resend`,
    {},
  );
  return data;
}

export async function revokeTeamInvitation(invitationId: string) {
  const { data } = await apiClient.post<TeamInvitation>(
    `/establishment/team/invitations/${encodeURIComponent(invitationId)}/revoke`,
    {},
  );
  return data;
}

export async function suspendTeamMember(membershipId: string) {
  const { data } = await apiClient.post<{
    membershipId: string;
    accountStatus: string;
  }>(
    `/establishment/team/members/${encodeURIComponent(membershipId)}/suspend`,
    {},
  );
  return data;
}

export async function reactivateTeamMember(membershipId: string) {
  const { data } = await apiClient.post<{
    membershipId: string;
    accountStatus: string;
  }>(
    `/establishment/team/members/${encodeURIComponent(membershipId)}/reactivate`,
    {},
  );
  return data;
}

export async function sendTeamPasswordReset(membershipId: string) {
  const { data } = await apiClient.post<{ message: string }>(
    `/establishment/team/members/${encodeURIComponent(membershipId)}/send-password-reset`,
    {},
  );
  return data;
}

// The public end of an invitation link: anonymous on purpose.
export async function inspectInvitation(token: string) {
  const { data } = await apiClient.get<InvitationInspection>(
    "/team-invitations/inspect",
    {
      params: { token },
    },
  );
  return data;
}

export async function acceptTeamInvitation(
  payload: AcceptTeamInvitationPayload,
) {
  const { data } = await apiClient.post<AcceptTeamInvitationResult>(
    "/team-invitations/accept",
    payload,
  );
  return data;
}
