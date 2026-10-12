// Colours of the nuclei overlay, exactly those of ai-service/app/nuclei_palette.json
// (Okabe-Ito, legible on H&E): nuclei-palette.test.ts checks them against
// that file. The background stays transparent. A colour is always shown with
// its type's name, never alone.

import { nucleusTypes, type NucleusType } from "./ai-analyses.types";

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

/** The pixels of a canvas: RGBA, row by row (an ImageData, or a copy of one). */
export type RgbaPixels = { data: Uint8ClampedArray; width: number; height: number };

const rgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/**
 * Recolours the label map (GET .../mask: one channel, the class index 0-5 of
 * each pixel, decoded into RGBA by the canvas) with the palette, the types
 * of `visibleClasses` only: each such pixel in its colour with alpha 255,
 * every other pixel (background, hidden types) transparent. Pure: a new array.
 */
export function colorizeLabelMap(imageData: RgbaPixels, visibleClasses: ReadonlySet<NucleusType>): RgbaPixels {
  // Lookup by class index: [r, g, b, a] or null (transparent).
  const colours = [null, ...nucleusTypes.map((type) => (visibleClasses.has(type) ? rgb(NUCLEI_PALETTE[type]) : null))];
  const source = imageData.data;
  const data = new Uint8ClampedArray(source.length);
  for (let offset = 0; offset < source.length; offset += 4) {
    // A grey PNG decodes with r = g = b = its value: the red channel is the index.
    const colour = colours[source[offset]] ?? null;
    if (colour) {
      data[offset] = colour[0];
      data[offset + 1] = colour[1];
      data[offset + 2] = colour[2];
      data[offset + 3] = 255;
    }
  }
  return { data, height: imageData.height, width: imageData.width };
}
