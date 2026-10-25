import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DicomZip } from './dicom-zip';
import { buildStoredZip } from './stored-zip';

describe('buildStoredZip', () => {
  const directory = mkdtempSync(join(tmpdir(), 'healix-zip-'));
  afterAll(() => rmSync(directory, { force: true, recursive: true }));

  async function readBack(zip: Buffer) {
    const path = join(directory, `${Math.random().toString(16).slice(2)}.zip`);
    writeFileSync(path, zip);
    const archive = await DicomZip.open(path);
    try {
      const entries: { content: Buffer | null; name: string }[] = [];
      for (const member of archive.members) {
        entries.push({
          content: await archive.read(member),
          name: member.name,
        });
      }
      return entries;
    } finally {
      archive.close();
    }
  }

  it('writes a ZIP the reader opens, every file back as it was, in order', async () => {
    const files = [
      { data: Buffer.from('first file'), name: '0001.dcm' },
      { data: Buffer.alloc(70_000, 7), name: '0002.dcm' },
      { data: Buffer.from([0, 1, 2, 3, 255]), name: '0003.dcm' },
    ];

    const entries = await readBack(buildStoredZip(files));

    expect(entries.map((entry) => entry.name)).toEqual(
      files.map((file) => file.name),
    );
    for (const [index, file] of files.entries()) {
      expect(entries[index].content?.equals(file.data)).toBe(true);
    }
  });

  it('writes an empty file and an empty archive', async () => {
    expect(
      await readBack(
        buildStoredZip([{ data: Buffer.alloc(0), name: 'a.dcm' }]),
      ),
    ).toEqual([{ content: Buffer.alloc(0), name: 'a.dcm' }]);
    expect(buildStoredZip([])).toHaveLength(22);
  });

  it('keeps a name with accents', async () => {
    const [entry] = await readBack(
      buildStoredZip([{ data: Buffer.from('x'), name: 'série-1.dcm' }]),
    );
    expect(entry.name).toBe('série-1.dcm');
  });

  it('refuses more entries than a ZIP counts', () => {
    const entries = Array.from({ length: 65_536 }, (_, index) => ({
      data: Buffer.alloc(0),
      name: String(index),
    }));
    expect(() => buildStoredZip(entries)).toThrow('Too many entries');
  });
});
