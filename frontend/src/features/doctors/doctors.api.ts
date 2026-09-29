import { apiClient } from "@/lib/api/http-client";

import {
  type AffiliatedDoctor,
  type CreateAffiliatedDoctorPayload,
  type CreateAffiliatedDoctorResult,
  type ResetAffiliatedDoctorPasswordResult,
} from "./doctors.types";

export async function getAffiliatedDoctors(): Promise<AffiliatedDoctor[]> {
  const response = await apiClient.get<AffiliatedDoctor[]>(
    "/establishment/doctors",
  );

  return response.data;
}

export async function createAffiliatedDoctor(
  payload: CreateAffiliatedDoctorPayload,
): Promise<CreateAffiliatedDoctorResult> {
  const response = await apiClient.post<CreateAffiliatedDoctorResult>(
    "/establishment/doctors",
    payload,
  );

  return response.data;
}

export async function resetAffiliatedDoctorPassword(
  doctorProfileId: string,
): Promise<ResetAffiliatedDoctorPasswordResult> {
  const response = await apiClient.post<ResetAffiliatedDoctorPasswordResult>(
    `/establishment/doctors/${doctorProfileId}/reset-password`,
  );

  return response.data;
}
