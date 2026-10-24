import { crc32, deflateRawSync } from 'node:zlib';

// A ZIP archive built by hand, for the tests of the import: the archives that
// a well-behaved library would never write (a name with "../", a size that
// lies, an encrypted entry) have to be made byte by byte.
export type ZipTestEntry = {
  data: Buffer;
  /** Set bit 0 of the flags: the entry claims to be encrypted. */
  encrypted?: boolean;
  /** The uncompressed size written in the headers, if not the real one. */
  declaredSize?: number;
  method?: 0 | 8;
  name: string;
};

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

export function buildZip(entries: ZipTestEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const method = entry.method ?? 0;
    const name = Buffer.from(entry.name, 'utf8');
    let stored = method === 8 ? deflateRawSync(entry.data) : entry.data;
    if (entry.encrypted && method === 0) {
      // The 12-byte encryption header of a stored, encrypted entry.
      stored = Buffer.concat([Buffer.alloc(12), stored]);
    }
    const flags = 0x0800 | (entry.encrypted ? 0x0001 : 0);
    const crc = crc32(entry.data);
    const size = entry.declaredSize ?? entry.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + stored.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}

// A file that starts like a DICOM file (128 free bytes, then "DICM").
export function dicomLikeFile(payload = 'pixel data'): Buffer {
  return Buffer.concat([
    Buffer.alloc(128),
    Buffer.from('DICM', 'latin1'),
    Buffer.from(payload, 'utf8'),
  ]);
}
