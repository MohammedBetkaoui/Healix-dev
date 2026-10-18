import { type AiMagnification, type AiPipelineId } from "./ai-analyses.types";
import { type LaunchState } from "./run-presentation";

export type AcquisitionIssue = "magnification" | "he40x" | "samplingRate" | "samplingRateInvalid";

export function getAcquisitionIssue(input: {
  pipelineId: AiPipelineId;
  magnification: AiMagnification | null;
  he40xConfirmed: boolean;
  isArchive: boolean;
  samplingRate: number | null;
  rateChoice: number | "other" | null;
  otherRate: string;
}): AcquisitionIssue | null {
  if (input.pipelineId === "pathology-breast" && input.magnification === null) return "magnification";
  if (input.pipelineId === "pathology-nuclei" && !input.he40xConfirmed) return "he40x";
  if (input.pipelineId === "cardio-ecg" && !input.isArchive && input.samplingRate === null) {
    return input.rateChoice === "other" && input.otherRate.trim() !== "" ? "samplingRateInvalid" : "samplingRate";
  }
  return null;
}

// Recheck the preparation at launch too: consent or file checks can change
// after a step was completed. A ready inference service alone is insufficient.
export function canLaunchPreparedAnalysis(input: {
  hasPatient: boolean;
  hasDocument: boolean;
  consentSigned: boolean;
  qualityPassed: boolean;
  acquisitionIssue: AcquisitionIssue | null;
  launchState: LaunchState;
  isLaunching: boolean;
}) {
  return input.hasPatient && input.hasDocument && input.consentSigned && input.qualityPassed
    && input.acquisitionIssue === null && input.launchState === "ready" && !input.isLaunching;
}
