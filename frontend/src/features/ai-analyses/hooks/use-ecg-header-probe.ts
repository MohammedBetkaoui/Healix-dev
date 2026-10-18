"use client";

import { useEffect, useState } from "react";

import { findMissingLeads, firstLine, type EcgHeaderProbe } from "../ecg-quality";

type ProbeInput = {
  blob: Blob | undefined;
  /** A zipped WFDB record: nothing to read in the browser. */
  isArchive: boolean;
  /** The file could not be loaded. */
  isError: boolean;
  /** Only the ECG chain reads a header. */
  enabled: boolean;
};

// Only the start of the file: the header line names the leads.
const HEADER_BYTES = 64 * 1024;

// Reads the header line of a CSV/TXT signal once, to tell which of the 12
// leads it lacks. Nothing is kept but the outcome.
export function useEcgHeaderProbe({ blob, enabled, isArchive, isError }: ProbeInput): EcgHeaderProbe {
  const [result, setResult] = useState<{ blob: Blob; probe: EcgHeaderProbe } | null>(null);

  useEffect(() => {
    if (!enabled || !blob || isArchive) {
      return;
    }

    let cancelled = false;

    blob.slice(0, HEADER_BYTES).text().then(
      (text) => {
        if (cancelled) return;
        const missing = findMissingLeads(firstLine(text));
        setResult({ blob, probe: missing === null ? { state: "unreadable" } : { missing, state: "read" } });
      },
      () => {
        if (!cancelled) setResult({ blob, probe: { state: "unreadable" } });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [blob, enabled, isArchive]);

  if (isArchive) return { state: "archive" };
  if (isError) return { state: "unavailable" };
  return blob && result?.blob === blob ? result.probe : { state: "pending" };
}
