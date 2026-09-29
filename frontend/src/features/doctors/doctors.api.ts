import { apiClient } from "@/lib/api/http-client";

import {
  type AffiliatedDoctor,
  type CreateAffiliatedDoctorPayload,
  type CreateAffiliatedDoctorResult,
  type ResetAffiliatedDoctorPasswordResult,
  type SetAffiliatedDoctorStatusResult,
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

export async function suspendAffiliatedDoctor(
  doctorProfileId: string,
): Promise<SetAffiliatedDoctorStatusResult> {
  const response = await apiClient.post<SetAffiliatedDoctorStatusResult>(
    `/establishment/doctors/${doctorProfileId}/suspend`,
  );

  return response.data;
}

export async function reactivateAffiliatedDoctor(
  doctorProfileId: string,
): Promise<SetAffiliatedDoctorStatusResult> {
  const response = await apiClient.post<SetAffiliatedDoctorStatusResult>(
    `/establishment/doctors/${doctorProfileId}/reactivate`,
  );

  return response.data;
}
