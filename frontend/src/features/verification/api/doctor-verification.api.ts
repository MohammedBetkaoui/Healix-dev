import { apiClient } from "@/lib/api/http-client";

import {
  type DoctorDocumentType,
  type DoctorVerificationDraftPayload,
  type DoctorVerificationPrefillResponse,
  type DoctorVerificationSubmitResponse,
} from "../types/doctor-verification.types";

export async function getDoctorVerificationPrefill(): Promise<DoctorVerificationPrefillResponse> {
  const response = await apiClient.get<DoctorVerificationPrefillResponse>(
    "/verification/doctor/prefill",
  );

  return response.data;
}

export async function createDoctorVerificationDraft(
  payload: DoctorVerificationDraftPayload,
) {
  const response = await apiClient.post("/verification/doctor/draft", payload);

  return response.data;
}

export async function updateDoctorVerificationDraft(
  payload: Partial<DoctorVerificationDraftPayload>,
) {
  const response = await apiClient.patch("/verification/doctor/draft", payload);

  return response.data;
}

export async function uploadDoctorVerificationDocument(input: {
  documentType: DoctorDocumentType;
  file: File;
}) {
  const formData = new FormData();
  formData.append("documentType", input.documentType);
  formData.append("file", input.file);

  const response = await apiClient.post(
    "/verification/doctor/upload-document",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return response.data;
}

export async function submitDoctorVerification(): Promise<DoctorVerificationSubmitResponse> {
  const response = await apiClient.post<DoctorVerificationSubmitResponse>(
    "/verification/doctor/submit",
    {
      confirmationAccuracy: true,
    },
  );

  return response.data;
}
