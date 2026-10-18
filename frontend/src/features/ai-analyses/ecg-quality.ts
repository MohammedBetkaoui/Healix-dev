// Client-side checks of the ECG signal chosen for an analysis (wizard step
// "Contrôle"): the file format and, for a CSV/TXT, the 12 leads named in its
// header, read as the service reads them (ai-service/app/ecg_input.py). The
// service checks everything again (rate, duration, amplitude, flat leads).

import { ECG_MAX_SAMPLING_RATE, ECG_MIN_SAMPLING_RATE, ecgLeads, type EcgLead } from "./ai-analyses.types";
import { checkFormat, getFileExtension, type QualityCheck, type QualityCheckReport } from "./quality-check";

export const ecgAcceptedFormats = ["csv", "txt", "zip"] as const;

export type EcgHeaderProbe =
  | { state: "pending" }
  /** The header line was read: the leads it lacks, possibly none. */
  | { state: "read"; missing: EcgLead[] }
  /** A zipped WFDB record: its leads are in the .hea, read by the service. */
  | { state: "archive" }
  /** No header line with at least two columns. */
  | { state: "unreadable" }
  /** The file itself could not be loaded. */
  | { state: "unavailable" };

/** A zipped WFDB record, by its extension. */
export function isEcgArchive(fileName: string): boolean {
  return getFileExtension(fileName) === "zip";
}

/** As the service compares lead names: "AVR", "aVR" and "avr" are the same lead. */
export function leadKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^0-9a-z]/g, "");
}

/** The leads missing from a header line (delimiter: ";" then tab, else ","). */
export function findMissingLeads(headerLine: string): EcgLead[] | null {
  const header = headerLine.replace(/^﻿/, "");
  const delimiter = header.includes(";") ? ";" : header.includes("\t") ? "\t" : ",";
  const names = header.split(delimiter).map(leadKey);
  if (names.length < 2) return null;
  return ecgLeads.filter((lead) => !names.includes(leadKey(lead)));
}

/** The first non-empty line of a text file. */
export function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
}

function checkLeads(probe: EcgHeaderProbe): QualityCheck {
  switch (probe.state) {
    case "pending":
      return { key: "leads", status: "pending" };
    case "archive":
      return { key: "leads", status: "not_applicable", detail: { reason: "archive" } };
    case "read":
      return probe.missing.length === 0
        ? { key: "leads", status: "pass" }
        : { key: "leads", status: "fail", detail: { missing: probe.missing.join(", ") } };
    case "unreadable":
    case "unavailable":
      return { key: "leads", status: "fail", detail: { reason: probe.state } };
  }
}

export function evaluateEcgQualityChecks(input: { fileName: string; probe: EcgHeaderProbe }): QualityCheckReport {
  const checks = [checkFormat(ecgAcceptedFormats, input.fileName), checkLeads(input.probe)];

  return {
    checks,
    canContinue: checks.every((check) => check.status !== "fail" && check.status !== "pending"),
  };
}

/** The sampling rate typed as "other": an integer from 100 to 1000 Hz, else null. */
export function parseSamplingRate(text: string): number | null {
  const trimmed = text.trim();
  const value = Number(trimmed);
  return trimmed !== "" && Number.isInteger(value) && value >= ECG_MIN_SAMPLING_RATE && value <= ECG_MAX_SAMPLING_RATE
    ? value
    : null;
}
