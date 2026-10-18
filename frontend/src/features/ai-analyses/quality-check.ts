// Client-side checks of the image chosen for an analysis (wizard step
// "Contrôle"). Pure: the browser decoding happens in the wizard, which passes
// its outcome in as an ImageProbe.

import { type PatientDocument } from "@/types/patient";

import { type AiInputConstraints } from "./ai-analyses.types";

/**
 * Generic floor, for a model whose registry entry gives no input size: below
 * it the image is a thumbnail rather than an exam.
 */
export const MIN_IMAGE_SIDE_PX = 128;

export type ImageProbe =
  | { state: "pending" }
  | { state: "decoded"; width: number; height: number }
  /** Loaded, but the browser cannot decode it as an image (e.g. a PDF). */
  | { state: "undecodable" }
  /** The file itself could not be loaded. */
  | { state: "unavailable" }
  /** DICOM: not decoded in the browser at this step. */
  | { state: "dicom" };

// dimensions: the generic floor; minSide and maxSide: the model's own sizes
// (AiModel.inputConstraints), checked instead of it when it gives them.
// leads: the 12 leads of an ECG signal (ecg-quality.ts).
export const qualityCheckKeys = ["format", "decodable", "dimensions", "minSide", "maxSide", "leads"] as const;
export type QualityCheckKey = (typeof qualityCheckKeys)[number];

// not_provided: the registry gives no value to check against (shown, never
// blocking). not_applicable: cannot be checked at this step (DICOM, or the
// dimensions of an undecodable file).
export const qualityCheckStatuses = ["pass", "fail", "not_provided", "not_applicable", "pending"] as const;
export type QualityCheckStatus = (typeof qualityCheckStatuses)[number];

export type QualityCheck = {
  key: QualityCheckKey;
  status: QualityCheckStatus;
  /** Values for the displayed detail (extension, dimensions, minimum). */
  detail?: Record<string, string | number>;
};

export type QualityCheckReport = {
  checks: QualityCheck[];
  /** True once nothing failed and nothing is still pending. */
  canContinue: boolean;
};

export function getFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");

  return dot <= 0 || dot === fileName.length - 1
    ? ""
    : fileName.slice(dot + 1).toLowerCase();
}

function normalizeFormat(format: string): string {
  const extension = format.trim().toLowerCase().replace(/^\./, "");

  return extension === "jpg" ? "jpeg" : extension;
}

/** DICOM by declared type, MIME type or extension (.dcm uploads may have no MIME type). */
export function isDicomDocument(
  document: Pick<PatientDocument, "fileName" | "mimeType" | "type">,
): boolean {
  return (
    document.type === "DICOM" ||
    document.mimeType === "application/dicom" ||
    getFileExtension(document.fileName) === "dcm"
  );
}

export function checkFormat(
  acceptedFormats: readonly string[] | null,
  fileName: string,
): QualityCheck {
  const extension = getFileExtension(fileName);

  if (acceptedFormats === null) {
    return { key: "format", status: "not_provided", detail: { extension } };
  }

  const accepted = acceptedFormats.map(normalizeFormat);

  return {
    key: "format",
    status: extension && accepted.includes(normalizeFormat(extension)) ? "pass" : "fail",
    detail: { accepted: acceptedFormats.join(", "), extension },
  };
}

function checkDecodable(probe: ImageProbe): QualityCheck {
  switch (probe.state) {
    case "pending":
      return { key: "decodable", status: "pending" };
    case "decoded":
      return { key: "decodable", status: "pass" };
    case "dicom":
      return { key: "decodable", status: "not_applicable" };
    case "undecodable":
    case "unavailable":
      return { key: "decodable", status: "fail", detail: { reason: probe.state } };
  }
}

// One size check: `fits` tells whether the decoded sides pass it.
function checkSize(
  key: "dimensions" | "minSide" | "maxSide",
  probe: ImageProbe,
  detail: Record<string, number>,
  fits: (width: number, height: number) => boolean,
): QualityCheck {
  switch (probe.state) {
    case "pending":
      return { key, status: "pending", detail };
    case "decoded":
      return {
        key,
        status: fits(probe.width, probe.height) ? "pass" : "fail",
        detail: { ...detail, height: probe.height, width: probe.width },
      };
    default:
      // Unknown without a decoded image; the decoding check carries the failure.
      return { key, status: "not_applicable", detail };
  }
}

function checkDimensions(probe: ImageProbe, constraints: AiInputConstraints | null): QualityCheck[] {
  if (constraints === null) {
    return [
      checkSize("dimensions", probe, { min: MIN_IMAGE_SIDE_PX }, (width, height) =>
        width >= MIN_IMAGE_SIDE_PX && height >= MIN_IMAGE_SIDE_PX,
      ),
    ];
  }

  // As the service enforces them: each side at least minSide, at most maxSide.
  const { maxSide, minSide } = constraints;
  return [
    checkSize("minSide", probe, { min: minSide }, (width, height) => width >= minSide && height >= minSide),
    checkSize("maxSide", probe, { max: maxSide }, (width, height) => width <= maxSide && height <= maxSide),
  ];
}

export function evaluateQualityChecks(input: {
  acceptedFormats: readonly string[] | null;
  /** The model's sizes; null for the generic floor only. */
  inputConstraints: AiInputConstraints | null;
  fileName: string;
  probe: ImageProbe;
}): QualityCheckReport {
  const checks = [
    checkFormat(input.acceptedFormats, input.fileName),
    checkDecodable(input.probe),
    ...checkDimensions(input.probe, input.inputConstraints),
  ];

  return {
    checks,
    canContinue: checks.every((check) => check.status !== "fail" && check.status !== "pending"),
  };
}
