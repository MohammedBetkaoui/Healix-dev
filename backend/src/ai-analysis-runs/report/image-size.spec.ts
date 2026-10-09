import { readImageSize } from './image-size';

// Minimal headers, as written by encoders.
function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

function jpeg(width: number, height: number): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    // APP0 (JFIF), 16 bytes long
    Buffer.from([0xff, 0xe0, 0x00, 0x10]),
    Buffer.alloc(14),
    // SOF0: length 17, precision 8, height, width
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]),
    Buffer.from([height >> 8, height & 0xff, width >> 8, width & 0xff]),
    Buffer.alloc(10),
  ]);
}

describe('readImageSize', () => {
  it('reads a PNG header', () => {
    expect(readImageSize(png(512, 448))).toEqual({ height: 448, width: 512 });
  });

  it('reads a JPEG frame header after other segments', () => {
    expect(readImageSize(jpeg(630, 512))).toEqual({ height: 512, width: 630 });
  });

  it('answers null for anything else', () => {
    expect(readImageSize(Buffer.from('GIF89a......'))).toBeNull();
    expect(readImageSize(Buffer.alloc(0))).toBeNull();
    expect(
      readImageSize(
        Buffer.from([0xff, 0xd8, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]),
      ),
    ).toBeNull();
  });
});
