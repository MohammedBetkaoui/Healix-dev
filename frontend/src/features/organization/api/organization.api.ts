import { apiClient } from "@/lib/api/http-client";

import {
  type OrganizationResponse,
  type UpdateOpeningHoursPayload,
  type UpdateOrganizationPayload,
} from "../types/organization.types";

export async function getOrganization() {
  const { data } = await apiClient.get<OrganizationResponse>(
    "/establishment/organization",
  );
  return data;
}

export async function updateOrganization(payload: UpdateOrganizationPayload) {
  const { data } = await apiClient.patch<OrganizationResponse>(
    "/establishment/organization",
    payload,
  );
  return data;
}

export async function updateOpeningHours(payload: UpdateOpeningHoursPayload) {
  const { data } = await apiClient.patch<OrganizationResponse>(
    "/establishment/organization/opening-hours",
    payload,
  );
  return data;
}
