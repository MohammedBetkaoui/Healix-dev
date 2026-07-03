import { apiClient } from "@/lib/api/http-client";

import {
  type CreatePaymentIntentPayload,
  type CreatePaymentIntentResponse,
  type PaymentProofType,
  type PaymentSummary,
  type SyntheticChargilyPayload,
  type UploadPaymentProofResponse,
} from "../types/payment.types";

export async function createPaymentIntent(
  payload: CreatePaymentIntentPayload,
): Promise<CreatePaymentIntentResponse> {
  const response = await apiClient.post<CreatePaymentIntentResponse>(
    "/payments/create-intent",
    payload,
  );

  return response.data;
}

export async function paySyntheticChargily(
  paymentId: string,
  payload: SyntheticChargilyPayload,
): Promise<{ message: string; payment: PaymentSummary; subscriptionId: string }> {
  const response = await apiClient.post(
    `/payments/${paymentId}/pay/synthetic-chargily`,
    payload,
  );

  return response.data;
}

export async function uploadPaymentProof(
  paymentId: string,
  file: File,
  proofType: PaymentProofType,
): Promise<UploadPaymentProofResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("proofType", proofType);

  const response = await apiClient.post<UploadPaymentProofResponse>(
    `/payments/${paymentId}/upload-proof`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  return response.data;
}

export async function getPaymentStatus(
  paymentId: string,
): Promise<PaymentSummary> {
  const response = await apiClient.get<PaymentSummary>(`/payments/${paymentId}`);

  return response.data;
}
