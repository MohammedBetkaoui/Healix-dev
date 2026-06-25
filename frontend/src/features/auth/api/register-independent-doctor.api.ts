import { apiClient } from "@/lib/api/http-client";

import {
  type IndependentDoctorRegisterPayload,
  type RegisterIndependentDoctorResponse,
} from "../types/register.types";

export async function registerIndependentDoctor(
  payload: IndependentDoctorRegisterPayload,
): Promise<RegisterIndependentDoctorResponse> {
  const response = await apiClient.post<RegisterIndependentDoctorResponse>(
    "/auth/register-independent-doctor",
    payload,
  );

  return response.data;
}
