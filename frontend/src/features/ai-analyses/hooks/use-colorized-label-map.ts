"use client";

import { useEffect, useState } from "react";

import { nucleusTypes, type NucleusType } from "../ai-analyses.types";
import { colorizeLabelMap } from "../nuclei-palette";

export type ColorizedLabelMap =
  /** Every type shown: the service's own overlay is the right image. */
  | { status: "all" }
  /** Being recoloured; `stale` is the previous recolouring, if any, to keep on screen. */
  | { status: "pending"; stale: Blob | null }
  | { status: "ready"; blob: Blob }
  /** The browser could not recolour it: the full overlay stays shown. */
  | { status: "error" };

type Result = { key: string; blob: Blob } | { key: string; error: true };

// The canvas work: decode the label map (raw values, no colour management),
// recolour it with colorizeLabelMap, encode a PNG.
async function recolour(labelMap: Blob, visible: ReadonlySet<NucleusType>): Promise<Blob> {
  const bitmap = await createImageBitmap(labelMap, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("Canvas 2D indisponible.");
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  pixels.data.set(colorizeLabelMap(pixels, visible).data);
  context.putImageData(pixels, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Encodage PNG impossible.");
  return blob;
}

/**
 * The nuclei label map (GET .../mask) recoloured with the visible types only,
 * as a PNG to lay over the image. Nothing to do while every type is shown.
 */
export function useColorizedLabelMap(labelMap: Blob | undefined, visible: ReadonlySet<NucleusType>): ColorizedLabelMap {
  // Stable key of the visible set, in the palette order.
  const key = nucleusTypes.filter((type) => visible.has(type)).join(",");
  const allVisible = key === nucleusTypes.join(",");
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (allVisible || !labelMap) return;

    let cancelled = false;
    const types = new Set(key.split(",").filter(Boolean) as NucleusType[]);
    recolour(labelMap, types).then(
      (blob) => {
        if (!cancelled) setResult({ blob, key });
      },
      () => {
        if (!cancelled) setResult({ error: true, key });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [allVisible, key, labelMap]);

  if (allVisible) return { status: "all" };
  if (result?.key === key) return "error" in result ? { status: "error" } : { blob: result.blob, status: "ready" };
  return { stale: result && "blob" in result ? result.blob : null, status: "pending" };
}
