"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  acceptTeamInvitation,
  createTeamInvitation,
  getTeam,
  inspectInvitation,
  reactivateTeamMember,
  resendTeamInvitation,
  revokeTeamInvitation,
  sendTeamPasswordReset,
  suspendTeamMember,
} from "../api/team.api";
import { teamKeys } from "../team-query-keys";
import {
  type AcceptTeamInvitationPayload,
  type CreateTeamInvitationPayload,
} from "../types/team.types";

export function useTeam() {
  return useQuery({
    queryFn: getTeam,
    queryKey: teamKeys.overview,
    retry: false,
    staleTime: 15_000,
  });
}

export function useTeamMutations() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: teamKeys.overview });

  // The list is read again after every member action (also after a failure:
  // the server may have answered anyway) and after every invitation change.
  const createInvitation = useMutation({
    mutationFn: (payload: CreateTeamInvitationPayload) =>
      createTeamInvitation(payload),
    onSettled: () => void invalidate(),
  });
  const resendInvitation = useMutation({
    mutationFn: (invitationId: string) => resendTeamInvitation(invitationId),
    onSettled: () => void invalidate(),
  });
  const revokeInvitation = useMutation({
    mutationFn: (invitationId: string) => revokeTeamInvitation(invitationId),
    onSettled: () => void invalidate(),
  });
  const suspendMember = useMutation({
    mutationFn: (membershipId: string) => suspendTeamMember(membershipId),
    onSettled: () => void invalidate(),
  });
  const reactivateMember = useMutation({
    mutationFn: (membershipId: string) => reactivateTeamMember(membershipId),
    onSettled: () => void invalidate(),
  });
  const sendPasswordReset = useMutation({
    mutationFn: (membershipId: string) => sendTeamPasswordReset(membershipId),
  });

  return {
    createInvitation,
    reactivateMember,
    resendInvitation,
    revokeInvitation,
    sendPasswordReset,
    suspendMember,
  };
}

// The invitation of the address itself reads, then writes: no caching what
// would go stale anyway (a public token has one answer, then it is used or
// gone).
export function useInvitationInspection(token: string) {
  return useQuery({
    enabled: token !== "",
    queryFn: () => inspectInvitation(token),
    queryKey: ["team-invitation", "inspect", token],
    retry: false,
    staleTime: 0,
  });
}

export function useAcceptTeamInvitation() {
  return useMutation({
    mutationFn: (payload: AcceptTeamInvitationPayload) =>
      acceptTeamInvitation(payload),
  });
}
