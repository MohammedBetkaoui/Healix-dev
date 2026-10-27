"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getOrganization,
  updateOpeningHours,
  updateOrganization,
} from "../api/organization.api";
import { organizationKeys } from "../organization-query-keys";
import {
  type UpdateOpeningHoursPayload,
  type UpdateOrganizationPayload,
} from "../types/organization.types";

export function useOrganization() {
  return useQuery({
    queryFn: getOrganization,
    queryKey: organizationKeys.settings,
    retry: false,
    staleTime: 30_000,
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateOrganizationPayload) =>
      updateOrganization(payload),
    onSuccess: (organization) =>
      queryClient.setQueryData(organizationKeys.settings, organization),
  });
}

export function useUpdateOpeningHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateOpeningHoursPayload) =>
      updateOpeningHours(payload),
    onSuccess: (organization) =>
      queryClient.setQueryData(organizationKeys.settings, organization),
  });
}
