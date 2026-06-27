import { apiClient } from "@/lib/api/http-client";

import {
  type EstablishmentVerificationDraftPayload,
  type EstablishmentVerificationPrefillResponse,
  type EstablishmentVerificationRequestResponse,
  type EstablishmentVerificationSubmitResponse,
  type RequiredDocumentType,
} from "../types/verification.types";

export async function getEstablishmentVerificationPrefill(): Promise<EstablishmentVerificationPrefillResponse> {
  const response =
    await apiClient.get<EstablishmentVerificationPrefillResponse>(
      "/verification/establishment/prefill",
    );

  const prefill = response.data;

  if (prefill.verification.status === "NOT_STARTED") {
    return prefill;
  }

  try {
    const requestResponse =
      await apiClient.get<EstablishmentVerificationRequestResponse>(
        "/verification/establishment/request",
      );
    const request = requestResponse.data;

    return {
      ...prefill,
      documents: request.documents ?? prefill.documents,
      draftData: request.data ?? prefill.draftData,
      verification: {
        ...prefill.verification,
        currentStep: request.currentStep,
        status: request.status,
      },
    };
  } catch {
    return prefill;
  }
}

export async function createEstablishmentVerificationDraft(
  payload: EstablishmentVerificationDraftPayload,
) {
  const response = await apiClient.post(
    "/verification/establishment/draft",
    payload,
  );

  return response.data;
}

export async function updateEstablishmentVerificationDraft(
  payload: EstablishmentVerificationDraftPayload,
) {
  const response = await apiClient.patch(
    "/verification/establishment/draft",
    payload,
  );

  return response.data;
}

export async function uploadEstablishmentVerificationDocument(input: {
  documentType: RequiredDocumentType;
  file: File;
}) {
  const formData = new FormData();
  formData.append("documentType", input.documentType);
  formData.append("file", input.file);

  const response = await apiClient.post(
    "/verification/establishment/upload-document",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return response.data;
}

export async function submitEstablishmentVerification(): Promise<EstablishmentVerificationSubmitResponse> {
  const response = await apiClient.post<EstablishmentVerificationSubmitResponse>(
    "/verification/establishment/submit",
    {
      confirmationAccuracy: true,
    },
  );

  return response.data;
}
