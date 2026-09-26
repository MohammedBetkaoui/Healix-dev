"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { type PatientDocumentType } from "@/types/patient";

import { uploadPatientDocument } from "../patients.api";

type UploadPatientDocumentVariables = {
  documentType: PatientDocumentType;
  file: File;
  patientId: string;
};

export function useUploadPatientDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ patientId, file, documentType }: UploadPatientDocumentVariables) =>
      uploadPatientDocument(patientId, file, documentType),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ["patients", "documents", variables.patientId],
      });
    },
  });
}
