// Pixel size of a PNG or JPEG, read from its header (the analysed image's
// dimensions are not stored with the run). null for anything else.

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

// Start-of-frame markers carry the size; DHT (C4), JPG (C8) and DAC (CC) do not.
const JPEG_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export type ImageSize = { width: number; height: number };

export function readImageSize(data: Buffer): ImageSize | null {
  if (data.length >= 24 && data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    // IHDR is always the first chunk: width and height follow its type.
    return { height: data.readUInt32BE(20), width: data.readUInt32BE(16) };
  }

  if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) return null;
      const marker = data[offset + 1];
      if (marker === 0xff) {
        offset += 1; // fill byte
        continue;
      }
      const length = data.readUInt16BE(offset + 2);
      if (JPEG_SOF.has(marker)) {
        return {
          height: data.readUInt16BE(offset + 5),
          width: data.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }

  return null;
}
