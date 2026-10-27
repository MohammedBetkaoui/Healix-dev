"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  addConsultationAddendum,
  cancelConsultation,
  completeConsultation,
  createConsultation,
  startConsultation,
  updateConsultation,
} from "../api/consultations.api";
import { consultationKeys } from "../consultation-query-keys";
import { type UpdateConsultationPayload } from "../types/consultation.types";

export function useConsultationMutations() {
  const queryClient = useQueryClient();
  const refresh = async (id?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: consultationKeys.lists }),
      queryClient.invalidateQueries({ queryKey: consultationKeys.stats }),
      ...(id ? [queryClient.invalidateQueries({ queryKey: consultationKeys.detail(id) })] : []),
    ]);
  };
  const create = useMutation({
    mutationFn: createConsultation,
    onSuccess: (consultation) => refresh(consultation.id),
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateConsultationPayload }) => updateConsultation(id, payload),
    onSuccess: (consultation) => refresh(consultation.id),
  });
  const start = useMutation({ mutationFn: startConsultation, onSuccess: (consultation) => refresh(consultation.id) });
  const complete = useMutation({ mutationFn: completeConsultation, onSuccess: (consultation) => refresh(consultation.id) });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelConsultation(id, reason),
    onSuccess: (consultation) => refresh(consultation.id),
  });
  const addendum = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) => addConsultationAddendum(id, content),
    onSuccess: (consultation) => refresh(consultation.id),
  });
  return { addendum, cancel, complete, create, start, update };
}
