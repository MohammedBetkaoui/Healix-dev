import { apiClient } from "@/lib/api/http-client";

import {
  type EstablishmentRegisterPayload,
  type RegisterEstablishmentResponse,
} from "../types/register.types";

export async function registerEstablishment(
  payload: EstablishmentRegisterPayload,
): Promise<RegisterEstablishmentResponse> {
  const response = await apiClient.post<RegisterEstablishmentResponse>(
    "/auth/register-establishment",
    payload,
  );

  return response.data;
}
