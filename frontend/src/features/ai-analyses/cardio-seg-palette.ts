import {
  cardioSegStructures,
  type CardioSegStructure,
} from "./ai-analyses.types";
import {
  colorizeIndexedLabelMap,
  type RgbaPixels,
} from "./label-map-palette";

/** Same Okabe-Ito colours as ai-service/app/cardio_seg_palette.json. */
export const CARDIO_SEG_PALETTE: Readonly<Record<CardioSegStructure, string>> = {
  LV: "#D55E00",
  RV: "#0072B2",
  MYO: "#009E73",
};

export function colorizeCardioSegLabelMap(
  imageData: RgbaPixels,
  visible: ReadonlySet<CardioSegStructure>,
): RgbaPixels {
  return colorizeIndexedLabelMap(
    imageData,
    cardioSegStructures,
    CARDIO_SEG_PALETTE,
    visible,
  );
}
