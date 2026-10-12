import { readFileSync } from "node:fs";
import { join } from "node:path";

import { colorizeLabelMap, NUCLEI_PALETTE, nucleusClassIndex } from "./nuclei-palette";

describe("nuclei palette", () => {
  it("is the one the AI service colours the overlay with", () => {
    const file = join(__dirname, "../../../../ai-service/app/nuclei_palette.json");
    expect(NUCLEI_PALETTE).toEqual(JSON.parse(readFileSync(file, "utf8")));
  });

  it("indexes the types as the label map does (0 is the background)", () => {
    expect(nucleusClassIndex("neoplastic")).toBe(1);
    expect(nucleusClassIndex("epithelial")).toBe(5);
  });
});

describe("colorizeLabelMap", () => {
  // A 3 x 2 label map decoded as RGBA: indices 0, 1, 2 / 3, 4, 5.
  const labels = [0, 1, 2, 3, 4, 5];
  const imageData = {
    data: new Uint8ClampedArray(labels.flatMap((index) => [index, index, index, 255])),
    height: 2,
    width: 3,
  };
  const pixel = (data: Uint8ClampedArray, index: number) => [...data.slice(index * 4, index * 4 + 4)];

  it("paints every visible type in its colour, opaque, and leaves the background transparent", () => {
    const result = colorizeLabelMap(imageData, new Set(["neoplastic", "inflammatory", "connective", "dead", "epithelial"]));

    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
    expect(pixel(result.data, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(result.data, 1)).toEqual([0xd5, 0x5e, 0x00, 255]);
    expect(pixel(result.data, 2)).toEqual([0x00, 0x72, 0xb2, 255]);
    expect(pixel(result.data, 3)).toEqual([0x00, 0x9e, 0x73, 255]);
    expect(pixel(result.data, 4)).toEqual([0x6e, 0x6e, 0x6e, 255]);
    expect(pixel(result.data, 5)).toEqual([0xf0, 0xe4, 0x42, 255]);
  });

  it("hides the types left out, and never changes its input", () => {
    const before = [...imageData.data];
    const result = colorizeLabelMap(imageData, new Set(["dead"]));

    expect(pixel(result.data, 1)).toEqual([0, 0, 0, 0]);
    expect(pixel(result.data, 4)).toEqual([0x6e, 0x6e, 0x6e, 255]);
    expect([...imageData.data]).toEqual(before);
    expect([...colorizeLabelMap(imageData, new Set()).data].every((value) => value === 0)).toBe(true);
  });
});
