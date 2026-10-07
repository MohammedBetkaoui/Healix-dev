"use client";

import { useEffect, useState } from "react";

import { type ImageProbe } from "../quality-check";

type ProbeInput = {
  blob: Blob | undefined;
  /** DICOM is not decoded in the browser at this step. */
  isDicom: boolean;
  /** The file could not be loaded. */
  isError: boolean;
};

// Decodes the image once to learn whether the browser can read it and its
// size, the facts the quality checks need. Nothing is kept but the outcome.
export function useImageProbe({ blob, isDicom, isError }: ProbeInput): ImageProbe {
  const [result, setResult] = useState<{ blob: Blob; probe: ImageProbe } | null>(null);

  useEffect(() => {
    if (!blob || isDicom) {
      return;
    }

    let cancelled = false;

    createImageBitmap(blob).then(
      (bitmap) => {
        if (!cancelled) {
          setResult({ blob, probe: { state: "decoded", height: bitmap.height, width: bitmap.width } });
        }
        bitmap.close();
      },
      () => {
        if (!cancelled) {
          setResult({ blob, probe: { state: "undecodable" } });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [blob, isDicom]);

  if (isDicom) {
    return { state: "dicom" };
  }

  if (isError) {
    return { state: "unavailable" };
  }

  return blob && result?.blob === blob ? result.probe : { state: "pending" };
}
