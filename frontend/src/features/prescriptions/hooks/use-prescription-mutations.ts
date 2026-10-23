"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  cancelPrescription,
  createPrescription,
  deletePrescriptionDraft,
  markPrescriptionPrinted,
  renewPrescription,
  submitPrescription,
  updatePrescription,
  validatePrescription,
} from "../api/prescriptions.api";
import { consultationKeys } from "@/features/consultations/consultation-query-keys";

import { prescriptionKeys } from "../prescription-query-keys";
import {
  type CreatePrescriptionInput,
  type Prescription,
  type UpdatePrescriptionInput,
} from "../types/prescription.types";

// A mutation refreshes the list, the counters and the prescription it
// touched. The PDF key is never invalidated (see prescription-query-keys):
// the PDF of a prescription does not change once it exists.
function useRefreshPrescriptions() {
  const queryClient = useQueryClient();
  return (prescription?: Pick<Prescription, "id">) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: prescriptionKeys.lists }),
      queryClient.invalidateQueries({ queryKey: prescriptionKeys.stats }),
      // A prescription written from a consultation shows in its detail.
      queryClient.invalidateQueries({ queryKey: consultationKeys.all }),
      ...(prescription
        ? [
            queryClient.invalidateQueries({ queryKey: prescriptionKeys.detail(prescription.id) }),
            queryClient.invalidateQueries({ queryKey: prescriptionKeys.history(prescription.id) }),
          ]
        : []),
    ]);
}

export function useCreatePrescription() {
  const refresh = useRefreshPrescriptions();
  return useMutation({
    mutationFn: (input: CreatePrescriptionInput) => createPrescription(input),
    onSuccess: (prescription) => refresh(prescription),
  });
}

export function useUpdatePrescription() {
  const refresh = useRefreshPrescriptions();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePrescriptionInput }) => updatePrescription(id, input),
    onSuccess: (prescription) => refresh(prescription),
  });
}

export function useDeletePrescriptionDraft() {
  const queryClient = useQueryClient();
  const refresh = useRefreshPrescriptions();
  return useMutation({
    mutationFn: (id: string) => deletePrescriptionDraft(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: prescriptionKeys.detail(id) });
      queryClient.removeQueries({ queryKey: prescriptionKeys.history(id) });
      return refresh();
    },
  });
}

export function useSubmitPrescription() {
  const refresh = useRefreshPrescriptions();
  return useMutation({
    mutationFn: (id: string) => submitPrescription(id),
    onSuccess: (prescription) => refresh(prescription),
  });
}

export function useValidatePrescription() {
  const refresh = useRefreshPrescriptions();
  return useMutation({
    mutationFn: (id: string) => validatePrescription(id),
    onSuccess: (prescription) => refresh(prescription),
  });
}

export function useCancelPrescription() {
  const refresh = useRefreshPrescriptions();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelPrescription(id, reason),
    onSuccess: (prescription) => refresh(prescription),
  });
}

export function useRenewPrescription() {
  const refresh = useRefreshPrescriptions();
  return useMutation({
    mutationFn: (id: string) => renewPrescription(id),
    onSuccess: (prescription) => refresh(prescription),
  });
}

export function useMarkPrescriptionPrinted() {
  const refresh = useRefreshPrescriptions();
  return useMutation({
    mutationFn: (id: string) => markPrescriptionPrinted(id),
    onSuccess: (prescription) => refresh(prescription),
  });
}
