import { ANALYSIS_REQUEST_TIMEOUT_MS } from "@/features/ai-analyses/ai-analysis-runs.api";
import { type AiAnalysisRun } from "@/features/ai-analyses/ai-analyses.types";
import { apiClient } from "@/lib/api/http-client";

import { type DicomAnalysisPipeline } from "./dicom-analysis";
import { VIEWER_PROBE_PATH } from "./dicom-import";
import {
  type DicomImportResult,
  type DicomStudy,
  type DicomStudyDetail,
} from "./dicom.types";

export async function getDicomStudies(patientId: string): Promise<DicomStudy[]> {
  const response = await apiClient.get<DicomStudy[]>(
    `/dicom/patients/${encodeURIComponent(patientId)}/studies`,
  );
  return response.data;
}

export async function getDicomStudy(studyId: string): Promise<DicomStudyDetail> {
  const response = await apiClient.get<DicomStudyDetail>(
    `/dicom/studies/${encodeURIComponent(studyId)}`,
  );
  return response.data;
}

export async function deleteDicomStudy(studyId: string): Promise<void> {
  await apiClient.delete(`/dicom/studies/${encodeURIComponent(studyId)}`);
}

// The .dcm files, or the .zip, in one request. The import can run for minutes
// (up to 512 MiB, then Orthanc): no timeout, the progress of the upload is
// reported as a fraction between 0 and 1.
export async function importDicomStudies(
  patientId: string,
  files: readonly File[],
  onProgress?: (fraction: number) => void,
): Promise<DicomImportResult> {
  const form = new FormData();
  form.append("patientId", patientId);
  for (const file of files) {
    form.append("files", file, file.name);
  }

  const response = await apiClient.post<DicomImportResult>("/dicom/studies/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (event.total) {
        onProgress?.(Math.min(1, event.loaded / event.total));
      }
    },
    timeout: 0,
  });
  return response.data;
}

// The PNG of a slice, as a Blob (an <img> cannot carry the session on another
// origin, and the page's CSP only allows blob: images).
export async function getDicomInstancePreview(
  orthancInstanceId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await apiClient.get<Blob>(
    `/dicom/instances/${encodeURIComponent(orthancInstanceId)}/preview`,
    { responseType: "blob", signal },
  );
  return response.data;
}

// "Analyser cette coupe": the backend stores the slice as a document of the
// record and runs the chain on it, like any analysis (up to 60 s). The run is
// answered whatever its outcome is, or refused before it exists (consent,
// quota, a chain that reads no slice...).
export async function analyzeDicomInstance(
  orthancInstanceId: string,
  pipeline: DicomAnalysisPipeline,
): Promise<AiAnalysisRun> {
  const response = await apiClient.post<AiAnalysisRun>(
    `/dicom/instances/${encodeURIComponent(orthancInstanceId)}/analyze`,
    { pipeline },
    { timeout: ANALYSIS_REQUEST_TIMEOUT_MS },
  );
  return response.data;
}

// Is the viewer there? /viewer/ is another application (its container behind
// Caddy; viewer/serve-local.mjs in development): a request that fails, or
// answers anything but 2xx, means the frame has nothing to show.
export async function checkViewerAvailable(): Promise<boolean> {
  try {
    const response = await fetch(VIEWER_PROBE_PATH, {
      cache: "no-store",
      credentials: "same-origin",
      method: "HEAD",
    });
    return response.ok;
  } catch {
    return false;
  }
}
