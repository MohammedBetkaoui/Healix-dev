/** Pixels returned by canvas getImageData (RGBA, row by row). */
export type RgbaPixels = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

const rgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

/** Recolour an indexed one-channel PNG; class 0 and hidden classes stay transparent. */
export function colorizeIndexedLabelMap<T extends string>(
  imageData: RgbaPixels,
  classes: readonly T[],
  palette: Readonly<Record<T, string>>,
  visibleClasses: ReadonlySet<T>,
): RgbaPixels {
  const colours = [
    null,
    ...classes.map((entry) => (visibleClasses.has(entry) ? rgb(palette[entry]) : null)),
  ];
  const source = imageData.data;
  const data = new Uint8ClampedArray(source.length);
  for (let offset = 0; offset < source.length; offset += 4) {
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
