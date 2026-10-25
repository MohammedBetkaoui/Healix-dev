import { crc32, deflateSync, inflateSync } from 'node:zlib';

import { CARDIO_SEG_PALETTE } from '../report/cardio-seg-palette';

// The colour overlay of one slice of a cardiac cine, made here from the class map the
// AI service sends (one 8-bit channel: 0 background, 1 LV, 2 RV, 3 MYO). The service
// sends the maps only, to keep its answer small: a cine holds up to 30 phases of dozens
// of slices, and the two phases kept are coloured when they are asked for.
//
// The PNG codec below handles the one shape the service writes (8 bits, one channel, no
// interlacing) and the one shape it writes back (RGBA): no dependency for that.

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const MAX_PIXELS = 4096 * 4096;

export class LabelMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LabelMapError';
  }
}

/** Class index to [red, green, blue], from the palette the report's legend uses. */
const CLASS_COLOURS: readonly (readonly [number, number, number] | null)[] = [
  null,
  ...(['LV', 'RV', 'MYO'] as const).map((name) => {
    const hex = CARDIO_SEG_PALETTE[name];
    return [1, 3, 5].map((offset) =>
      parseInt(hex.slice(offset, offset + 2), 16),
    ) as [number, number, number];
  }),
];

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) {
    return left;
  }
  return distanceUp <= distanceUpLeft ? up : upLeft;
}

/** The pixels of an 8-bit, one-channel, non-interlaced PNG, row by row. */
export function decodeGrayPng(png: Buffer): {
  height: number;
  pixels: Uint8Array;
  width: number;
} {
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new LabelMapError('Not a PNG.');
  }

  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (data.length !== length) {
      throw new LabelMapError('Truncated PNG.');
    }
    if (type === 'IHDR') {
      if (length !== 13) {
        throw new LabelMapError('Unreadable PNG header.');
      }
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 0 || data[12] !== 0) {
        throw new LabelMapError(
          'Only 8-bit, one-channel, non-interlaced PNG are read.',
        );
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw new LabelMapError('Unexpected PNG dimensions.');
  }

  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== height * (width + 1)) {
    throw new LabelMapError('Unexpected PNG data size.');
  }

  const pixels = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (width + 1)];
    const source = row * (width + 1) + 1;
    const target = row * width;
    for (let column = 0; column < width; column += 1) {
      const left = column > 0 ? pixels[target + column - 1] : 0;
      const up = row > 0 ? pixels[target - width + column] : 0;
      const upLeft =
        row > 0 && column > 0 ? pixels[target - width + column - 1] : 0;
      let predictor: number;
      switch (filter) {
        case 0:
          predictor = 0;
          break;
        case 1:
          predictor = left;
          break;
        case 2:
          predictor = up;
          break;
        case 3:
          predictor = (left + up) >> 1;
          break;
        case 4:
          predictor = paeth(left, up, upLeft);
          break;
        default:
          throw new LabelMapError('Unknown PNG filter.');
      }
      pixels[target + column] = (raw[source + column] + predictor) & 0xff;
    }
  }
  return { height, pixels, width };
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** An RGBA PNG (8 bits per channel, no filtering). */
export function encodeRgbaPng(
  width: number,
  height: number,
  rgba: Uint8Array,
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let row = 0; row < height; row += 1) {
    raw[row * (stride + 1)] = 0;
    raw.set(
      rgba.subarray(row * stride, (row + 1) * stride),
      row * (stride + 1) + 1,
    );
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The class map as a colour overlay: the colours of the cardiac MRI report for the
 * three structures, fully opaque there, the rest transparent (the page blends it).
 * Throws LabelMapError for a PNG that is not a class map.
 */
export function colourLabelMap(labelMapPng: Buffer): Buffer {
  const { height, pixels, width } = decodeGrayPng(labelMapPng);
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < pixels.length; index += 1) {
    const colour = CLASS_COLOURS[pixels[index]];
    if (colour) {
      rgba.set([colour[0], colour[1], colour[2], 255], index * 4);
    }
  }
  return encodeRgbaPng(width, height, rgba);
}
