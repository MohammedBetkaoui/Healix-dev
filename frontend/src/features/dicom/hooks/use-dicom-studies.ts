"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { type DicomAnalysisPipeline } from "../dicom-analysis";
import {
  analyzeDicomInstance,
  deleteDicomStudy,
  getDicomInstancePreview,
  getDicomStudies,
  getDicomStudy,
  importDicomStudies,
} from "../dicom.api";

export const dicomKeys = {
  preview: (instanceId: string) => ["dicom", "preview", instanceId] as const,
  studies: (patientId: string) => ["dicom", "studies", patientId] as const,
  study: (studyId: string) => ["dicom", "study", studyId] as const,
};

export function useDicomStudies(patientId: string) {
  return useQuery({
    enabled: Boolean(patientId),
    queryFn: () => getDicomStudies(patientId),
    queryKey: dicomKeys.studies(patientId),
    retry: false,
    staleTime: 15_000,
  });
}

export function useDicomStudy(studyId: string) {
  return useQuery({
    enabled: Boolean(studyId),
    queryFn: () => getDicomStudy(studyId),
    queryKey: dicomKeys.study(studyId),
    retry: false,
    staleTime: 30_000,
  });
}

// The upload with its progress (0 to 1; 1 while the server is still working).
export function useImportDicomStudies() {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState(0);

  const mutation = useMutation({
    mutationFn: ({ files, patientId }: { files: readonly File[]; patientId: string }) => {
      setProgress(0);
      return importDicomStudies(patientId, files, setProgress);
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: dicomKeys.studies(variables.patientId),
      });
    },
  });

  const { reset: resetMutation } = mutation;
  const reset = useCallback(() => {
    setProgress(0);
    resetMutation();
  }, [resetMutation]);

  return { ...mutation, progress, reset };
}

export function useDeleteDicomStudy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ studyId }: { patientId: string; studyId: string }) =>
      deleteDicomStudy(studyId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: dicomKeys.studies(variables.patientId),
      });
      queryClient.removeQueries({ queryKey: dicomKeys.study(variables.studyId) });
    },
  });
}

// The PNG of a slice. Kept for a minute once nothing shows it: the slider goes
// back and forth over the same slices.
export function useDicomPreview(instanceId: string | null) {
  return useQuery({
    enabled: Boolean(instanceId),
    gcTime: 60_000,
    queryFn: ({ signal }) => getDicomInstancePreview(instanceId as string, signal),
    queryKey: dicomKeys.preview(instanceId ?? ""),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// The analysis of a slice. The run is recorded even when it fails, and the slice
// is now a document of the record: the lists are refreshed on any outcome.
export function useAnalyzeDicomInstance(patientId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      instanceId,
      pipeline,
    }: {
      instanceId: string;
      pipeline: DicomAnalysisPipeline;
    }) => analyzeDicomInstance(instanceId, pipeline),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["patients", "ai-analysis-runs", patientId] });
      void queryClient.invalidateQueries({ queryKey: ["patients", "documents", patientId] });
    },
  });
}
