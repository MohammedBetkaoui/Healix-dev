import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DicomZipRefusal, type ZipRefusalReason } from './dicom-errors';
import { DicomZip, type DicomImportLimits } from './dicom-zip';
import {
  buildZip,
  dicomLikeFile,
  type ZipTestEntry,
} from './testing/zip-builder';

const LIMITS: DicomImportLimits = {
  maxFiles: 5,
  maxInstanceBytes: 1024,
  maxUncompressedBytes: 4096,
  maxUploadBytes: 1024 * 1024,
};

describe('DicomZip', () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dicom-zip-spec-'));
  });
  afterAll(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  async function archive(entries: ZipTestEntry[]): Promise<string> {
    const path = join(directory, `${Math.random().toString(36).slice(2)}.zip`);
    await writeFile(path, buildZip(entries));
    return path;
  }

  async function refusal(
    entries: ZipTestEntry[],
    limits = LIMITS,
  ): Promise<ZipRefusalReason> {
    const path = await archive(entries);
    try {
      const zip = await DicomZip.open(path, limits);
      // The refusal may only come while reading (a size that lies).
      try {
        for (const member of zip.members) {
          await zip.read(member);
        }
      } finally {
        zip.close();
      }
    } catch (error) {
      expect(error).toBeInstanceOf(DicomZipRefusal);
      return (error as DicomZipRefusal).reason;
    }
    throw new Error('The archive was accepted.');
  }

  it('lists the files of a well-formed archive and reads them back', async () => {
    const stored = dicomLikeFile('stored');
    const deflated = dicomLikeFile('deflated '.repeat(20));
    const zip = await DicomZip.open(
      await archive([
        { data: Buffer.alloc(0), name: 'study/' },
        { data: stored, name: 'study/a.dcm' },
        { data: deflated, method: 8, name: 'study/sub/b.dcm' },
      ]),
      LIMITS,
    );

    try {
      expect(zip.members.map((member) => member.name)).toEqual([
        'study/a.dcm',
        'study/sub/b.dcm',
      ]);
      await expect(zip.read(zip.members[0])).resolves.toEqual(stored);
      await expect(zip.read(zip.members[1])).resolves.toEqual(deflated);
    } finally {
      zip.close();
    }
  });

  it.each([
    ['a ".." segment', '../evil.dcm'],
    ['a ".." segment inside the path', 'study/../../evil.dcm'],
    ['an absolute path', '/etc/passwd'],
    ['a Windows drive path', 'C:/Windows/evil.dcm'],
    ['a backslash', 'study\\evil.dcm'],
  ])('refuses the archive that has %s in a name', async (_label, name) => {
    await expect(
      refusal([
        { data: dicomLikeFile(), name: 'ok.dcm' },
        { data: dicomLikeFile(), name },
      ]),
    ).resolves.toBe('PATH');
  });

  it('refuses a nested ZIP, by its name', async () => {
    await expect(
      refusal([{ data: buildZip([]), name: 'inner.ZIP' }]),
    ).resolves.toBe('NESTED_ZIP');
  });

  it('refuses a nested ZIP hidden under another name, when it is read', async () => {
    await expect(
      refusal([
        {
          data: buildZip([{ data: Buffer.from('x'), name: 'x' }]),
          name: 'inner.dcm',
        },
      ]),
    ).resolves.toBe('NESTED_ZIP');
  });

  it('refuses an archive with more files than the limit', async () => {
    const entries = Array.from({ length: LIMITS.maxFiles + 1 }, (_, index) => ({
      data: dicomLikeFile(`${index}`),
      name: `slice-${index}.dcm`,
    }));

    await expect(refusal(entries)).resolves.toBe('TOO_MANY_FILES');
  });

  it('refuses an archive whose decompressed size is over the limit, without decompressing it', async () => {
    // 3 x 2 KiB declared (and really so): 6 KiB > 4 KiB, from a few bytes.
    const zeros = Buffer.alloc(2048);
    const entries = [1, 2, 3].map((index) => ({
      data: zeros,
      method: 8 as const,
      name: `big-${index}.dcm`,
    }));

    await expect(refusal(entries)).resolves.toBe('TOO_LARGE');
  });

  it('refuses an encrypted entry', async () => {
    await expect(
      refusal([{ data: dicomLikeFile(), encrypted: true, name: 'secret.dcm' }]),
    ).resolves.toBe('ENCRYPTED');
  });

  it('refuses an entry that is larger than it declares (a zip bomb with a lying header)', async () => {
    // Declared 10 bytes, really 2 KiB.
    await expect(
      refusal([
        {
          data: Buffer.alloc(2048),
          declaredSize: 10,
          method: 8,
          name: 'liar.dcm',
        },
      ]),
    ).resolves.toBe('CORRUPT');
  });

  it('refuses a file that is not a ZIP', async () => {
    const path = join(directory, 'not-a-zip.zip');
    await writeFile(path, Buffer.from('this is not an archive'));

    await expect(DicomZip.open(path, LIMITS)).rejects.toMatchObject({
      reason: 'CORRUPT',
    });
  });

  it('does not read a file larger than an instance may be: null, not a refusal', async () => {
    const zip = await DicomZip.open(
      await archive([
        { data: Buffer.alloc(2000), method: 8, name: 'huge.bin' },
      ]),
      { ...LIMITS, maxUncompressedBytes: 1024 * 1024 },
    );

    try {
      await expect(zip.read(zip.members[0])).resolves.toBeNull();
    } finally {
      zip.close();
    }
  });
});
