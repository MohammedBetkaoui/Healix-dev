"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { getAiAnalysisReport, getAiAnalysisRun } from "../ai-analysis-runs.api";
import { reportFileName } from "../run-report";

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // After the click has handed the file to the browser.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Downloads the PDF report (generated on the first request). The run is read
// again afterwards: it then carries the report number, used as the file name
// and shown on screen. Resolves to that number.
export function useDownloadAiReport(patientId: string, runId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const blob = await getAiAnalysisReport(patientId, runId);
      const run = await getAiAnalysisRun(patientId, runId);
      queryClient.setQueryData(["patients", "ai-analysis-runs", patientId, runId], run);
      void queryClient.invalidateQueries({ exact: true, queryKey: ["patients", "ai-analysis-runs", patientId] });
      saveBlob(blob, reportFileName(run.reportNumber));
      return run.reportNumber;
    },
  });
}
