// Colours of the nuclei overlay, exactly those of ai-service/app/nuclei_palette.json
// (Okabe-Ito, legible on H&E): nuclei-palette.test.ts checks them against
// that file. The background stays transparent. A colour is always shown with
// its type's name, never alone.

import { nucleusTypes, type NucleusType } from "./ai-analyses.types";
import { colorizeIndexedLabelMap, type RgbaPixels } from "./label-map-palette";

export const NUCLEI_PALETTE: Readonly<Record<NucleusType, string>> = {
  neoplastic: "#D55E00",
  inflammatory: "#0072B2",
  connective: "#009E73",
  dead: "#6E6E6E",
  epithelial: "#F0E442",
};

/** Class index in the label map (1-5; 0 is the background). */
export function nucleusClassIndex(type: NucleusType): number {
  return nucleusTypes.indexOf(type) + 1;
}

export type { RgbaPixels } from "./label-map-palette";

/**
 * Recolours the label map (GET .../mask: one channel, the class index 0-5 of
 * each pixel, decoded into RGBA by the canvas) with the palette, the types
 * of `visibleClasses` only: each such pixel in its colour with alpha 255,
 * every other pixel (background, hidden types) transparent. Pure: a new array.
 */
export function colorizeLabelMap(imageData: RgbaPixels, visibleClasses: ReadonlySet<NucleusType>): RgbaPixels {
  return colorizeIndexedLabelMap(imageData, nucleusTypes, NUCLEI_PALETTE, visibleClasses);
}
