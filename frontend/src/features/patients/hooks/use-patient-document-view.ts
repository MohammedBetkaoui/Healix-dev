"use client";

import { useQuery } from "@tanstack/react-query";

import { getPatientDocumentBlob } from "../patients.api";

// The file of a patient document, as a Blob. Every download writes a
// DOCUMENT_VIEWED audit entry, so it is fetched once and never refetched
// while in use (staleTime Infinity), then dropped as soon as nothing shows it
// (gcTime 0). The key is outside ["patients", "documents", id] on purpose:
// invalidating the document list after an upload must not download it again.
export function usePatientDocumentView(
  patientId: string,
  documentId: string | null,
  options: { enabled: boolean },
) {
  return useQuery({
    enabled: options.enabled && Boolean(patientId) && Boolean(documentId),
    gcTime: 0,
    queryFn: () => getPatientDocumentBlob(patientId, documentId as string),
    queryKey: ["patients", "document-view", patientId, documentId],
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
