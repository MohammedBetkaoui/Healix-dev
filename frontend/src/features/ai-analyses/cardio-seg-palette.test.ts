import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CARDIO_SEG_PALETTE,
  colorizeCardioSegLabelMap,
} from "./cardio-seg-palette";

describe("cardiac segmentation palette", () => {
  it("matches the AI service palette", () => {
    const file = join(__dirname, "../../../../ai-service/app/cardio_seg_palette.json");
    expect(CARDIO_SEG_PALETTE).toEqual(JSON.parse(readFileSync(file, "utf8")));
  });

  it("uses class indices 1=LV, 2=RV and 3=MYO", () => {
    const imageData = {
      data: new Uint8ClampedArray([
        0, 0, 0, 255,
        1, 1, 1, 255,
        2, 2, 2, 255,
        3, 3, 3, 255,
      ]),
      height: 1,
      width: 4,
    };
    const result = colorizeCardioSegLabelMap(imageData, new Set(["LV", "MYO"]));
    const pixel = (index: number) => [...result.data.slice(index * 4, index * 4 + 4)];

    expect(pixel(0)).toEqual([0, 0, 0, 0]);
    expect(pixel(1)).toEqual([0xd5, 0x5e, 0x00, 255]);
    expect(pixel(2)).toEqual([0, 0, 0, 0]);
    expect(pixel(3)).toEqual([0x00, 0x9e, 0x73, 255]);
  });
});
