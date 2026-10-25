import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

import { PNG } from './cardio-volume.fixtures';
import {
  colourLabelMap,
  decodeGrayPng,
  encodeRgbaPng,
  LabelMapError,
} from './label-overlay';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function header(
  width: number,
  height: number,
  options: { bitDepth?: number; colorType?: number; interlace?: number } = {},
): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = options.bitDepth ?? 8;
  data[9] = options.colorType ?? 0;
  data[12] = options.interlace ?? 0;
  return chunk('IHDR', data);
}

const paeth = (a: number, b: number, c: number) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** An 8-bit grey PNG written with the given filter on every row, as an encoder would. */
function grayPng(
  width: number,
  height: number,
  pixels: readonly number[],
  filter: number,
): Buffer {
  const raw = Buffer.alloc(height * (width + 1));
  for (let row = 0; row < height; row += 1) {
    raw[row * (width + 1)] = filter;
    for (let column = 0; column < width; column += 1) {
      const value = pixels[row * width + column];
      const left = column > 0 ? pixels[row * width + column - 1] : 0;
      const up = row > 0 ? pixels[(row - 1) * width + column] : 0;
      const upLeft =
        row > 0 && column > 0 ? pixels[(row - 1) * width + column - 1] : 0;
      const predictor = [
        0,
        left,
        up,
        (left + up) >> 1,
        paeth(left, up, upLeft),
      ][filter];
      raw[row * (width + 1) + 1 + column] = (value - predictor) & 0xff;
    }
  }
  return Buffer.concat([
    SIGNATURE,
    header(width, height),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function decodeRgba(png: Buffer) {
  expect(png.subarray(0, 8).equals(SIGNATURE)).toBe(true);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    // Every chunk carries a valid CRC.
    expect(png.readUInt32BE(offset + 8 + length)).toBe(
      crc32(png.subarray(offset + 4, offset + 8 + length)),
    );
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([data[8], data[9]]).toEqual([8, 6]);
    }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgba: number[][] = [];
  for (let row = 0; row < height; row += 1) {
    expect(raw[row * (width * 4 + 1)]).toBe(0);
    for (let column = 0; column < width; column += 1) {
      const start = row * (width * 4 + 1) + 1 + column * 4;
      rgba.push([...raw.subarray(start, start + 4)]);
    }
  }
  return { height, rgba, width };
}

const PIXELS = [
  0, 1, 2, 3, 3, 2, 1, 0, 200, 17, 255, 0, 9, 9, 9, 9, 128, 64, 32, 16, 250, 3,
  77, 0,
];

describe('decodeGrayPng', () => {
  it('reads the 8-bit grey PNG the service writes', () => {
    const { height, pixels, width } = decodeGrayPng(PNG);
    expect([width, height]).toEqual([8, 8]);
    expect(pixels).toHaveLength(64);
  });

  it.each([0, 1, 2, 3, 4])('undoes the filter %i of a row', (filter) => {
    const png = grayPng(6, 4, PIXELS, filter);
    const decoded = decodeGrayPng(png);
    expect([decoded.width, decoded.height]).toEqual([6, 4]);
    expect([...decoded.pixels]).toEqual(PIXELS);
  });

  it('undoes the Paeth filter where the choice between the pixel above and the one above-left is a tie', () => {
    // Small values make ties frequent: the standard picks the pixel above.
    const pixels = Array.from(
      { length: 30 * 30 },
      (_, index) => (index * 7 + (index >> 3)) % 4,
    );
    expect([...decodeGrayPng(grayPng(30, 30, pixels, 4)).pixels]).toEqual(
      pixels,
    );
  });

  it('takes the pixel above at a Paeth tie: left 0, above 3, above-left 1', () => {
    // Predictor 0 + 3 - 1 = 2: it is 1 away from the pixel above (3) and 1 away
    // from the one above-left (1), and 2 away from the left one. A tie: the standard
    // keeps the pixel above.
    const pixels = [1, 3, 0, 2];
    expect([...decodeGrayPng(grayPng(2, 2, pixels, 4)).pixels]).toEqual(pixels);
  });

  it('reads a PNG whose data is cut into several IDAT chunks', () => {
    const png = grayPng(6, 4, PIXELS, 2);
    // Re-cut the single IDAT in two.
    const idatStart = 8 + 25;
    const length = png.readUInt32BE(idatStart);
    const data = png.subarray(idatStart + 8, idatStart + 8 + length);
    const cut = Math.floor(data.length / 2);
    const split = Buffer.concat([
      png.subarray(0, idatStart),
      chunk('IDAT', data.subarray(0, cut)),
      chunk('IDAT', data.subarray(cut)),
      png.subarray(idatStart + 12 + length),
    ]);
    expect([...decodeGrayPng(split).pixels]).toEqual(PIXELS);
  });

  it('refuses what is not an 8-bit, one-channel, non-interlaced PNG', () => {
    const body = (extra: Buffer) =>
      Buffer.concat([SIGNATURE, extra, chunk('IEND', Buffer.alloc(0))]);
    // Exactly the 4 rows of 4 pixels an 8-bit grey PNG of 4 x 4 holds: only the
    // header makes the cases below refuse.
    const idat = chunk('IDAT', deflateSync(Buffer.alloc(4 * (4 + 1))));
    const cases: Buffer[] = [
      Buffer.from('not a png'),
      body(Buffer.concat([header(4, 4, { colorType: 2 }), idat])),
      body(Buffer.concat([header(4, 4, { bitDepth: 16 }), idat])),
      body(Buffer.concat([header(4, 4, { interlace: 1 }), idat])),
      // The data holds fewer rows than the header says.
      body(
        Buffer.concat([
          header(4, 4),
          chunk('IDAT', deflateSync(Buffer.alloc(5))),
        ]),
      ),
      // No header at all.
      body(idat),
      // Far more pixels than any slice.
      body(Buffer.concat([header(65_536, 65_536), idat])),
      // Cut inside a chunk.
      grayPng(6, 4, PIXELS, 0).subarray(0, 50),
    ];
    for (const png of cases) {
      expect(() => decodeGrayPng(png)).toThrow(LabelMapError);
    }
  });

  it('refuses a filter type that does not exist', () => {
    const raw = Buffer.alloc(2 * 3);
    raw[0] = 9;
    const png = Buffer.concat([
      SIGNATURE,
      header(2, 3),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    expect(() => decodeGrayPng(png)).toThrow(LabelMapError);
  });
});

describe('encodeRgbaPng', () => {
  it('writes an RGBA PNG with valid chunks that decodes to the pixels given', () => {
    const rgba = new Uint8Array(2 * 2 * 4);
    rgba.set([10, 20, 30, 255, 0, 0, 0, 0, 255, 255, 255, 128, 1, 2, 3, 4]);
    const decoded = decodeRgba(encodeRgbaPng(2, 2, rgba));
    expect([decoded.width, decoded.height]).toEqual([2, 2]);
    expect(decoded.rgba).toEqual([
      [10, 20, 30, 255],
      [0, 0, 0, 0],
      [255, 255, 255, 128],
      [1, 2, 3, 4],
    ]);
  });
});

describe('colourLabelMap', () => {
  // The legend of the report and the overlay of the service draw the same
  // colours: ai-service/app/cardio_seg_palette.json is the reference.
  const palette = JSON.parse(
    readFileSync(
      join(__dirname, '../../../../ai-service/app/cardio_seg_palette.json'),
      'utf8',
    ),
  ) as Record<'LV' | 'RV' | 'MYO', string>;
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  it('draws LV, RV and MYO in the palette of the service, the rest transparent', () => {
    // 0 background, 1 LV, 2 RV, 3 MYO, 4 and 255 are not classes.
    const png = grayPng(6, 1, [0, 1, 2, 3, 4, 255], 0);
    const { height, rgba, width } = decodeRgba(colourLabelMap(png));

    expect([width, height]).toEqual([6, 1]);
    expect(rgba[0][3]).toBe(0);
    expect(rgba[1]).toEqual([...rgb(palette.LV), 255]);
    expect(rgba[2]).toEqual([...rgb(palette.RV), 255]);
    expect(rgba[3]).toEqual([...rgb(palette.MYO), 255]);
    expect(rgba[4][3]).toBe(0);
    expect(rgba[5][3]).toBe(0);
  });

  it('colours the map of the fixture: LV ring, myocardium, RV strip', () => {
    const { height, rgba, width } = decodeRgba(colourLabelMap(PNG));
    expect([width, height]).toEqual([8, 8]);
    const at = (row: number, column: number) => rgba[row * width + column];
    expect(at(0, 0)[3]).toBe(0);
    expect(at(0, 3)).toEqual([...rgb(palette.LV), 255]);
    expect(at(2, 3)).toEqual([...rgb(palette.MYO), 255]);
    expect(at(6, 3)).toEqual([...rgb(palette.RV), 255]);
  });

  it('refuses a PNG that is not a class map', () => {
    expect(() => colourLabelMap(Buffer.from('nope'))).toThrow(LabelMapError);
  });
});
