import { apiClient } from "@/lib/api/http-client";

import { type EstablishmentVerificationPrefillResponse } from "../types/verification.types";

export async function getEstablishmentVerificationPrefill(): Promise<EstablishmentVerificationPrefillResponse> {
  const response =
    await apiClient.get<EstablishmentVerificationPrefillResponse>(
      "/verification/establishment/prefill",
    );

  return response.data;
}
