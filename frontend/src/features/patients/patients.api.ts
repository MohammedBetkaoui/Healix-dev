import { apiClient } from "@/lib/api/http-client";

import {
  type CreatePatientPayload,
  type PatientsListParams,
  type PatientsListResponse,
} from "./patients.types";

export async function getPatients(params: PatientsListParams = {}) {
  const response = await apiClient.get<PatientsListResponse>("/patients", {
    params,
  });

  return response.data;
}

export async function createPatient(payload: CreatePatientPayload) {
  const response = await apiClient.post("/patients", payload);

  return response.data;
}
