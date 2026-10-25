import {
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PatientFileStorageService } from './patient-file-storage.service';

// The images of a cardiac cine volumetry: a folder per run, written all or none,
// read back by name, and never outside the upload root.
describe('PatientFileStorageService, the images of a cine volumetry', () => {
  const root = mkdtempSync(join(tmpdir(), 'healix-volumetry-storage-'));
  const storage = new PatientFileStorageService({
    get: (key: string) => (key === 'UPLOAD_ROOT' ? root : undefined),
  } as unknown as ConfigService);
  const png = (text: string) => Buffer.from(`png:${text}`);

  beforeAll(() => {
    Logger.overrideLogger(false);
  });
  afterAll(() => rmSync(root, { force: true, recursive: true }));

  it('keeps the images of a run in a folder of its own, next to the other AI files of the patient', async () => {
    const { localPath } = await storage.storeAiVolumetryImages({
      images: [
        { name: 'label-ed-000.png', png: png('label') },
        { name: 'slice-es-011.png', png: png('slice') },
      ],
      patientId: 'patient-1',
      runId: 'run-1',
    });

    expect(localPath).toBe(
      join(root, 'patients', 'patient-1', 'ai-masks', 'run-1-volumetry'),
    );
    expect(readdirSync(localPath).sort()).toEqual([
      'label-ed-000.png',
      'slice-es-011.png',
    ]);
    await expect(
      storage.readAiVolumetryImage(localPath, 'slice-es-011.png'),
    ).resolves.toEqual(png('slice'));
  });

  it('writes all or none: a name that is not an image of a volumetry removes the folder', async () => {
    const error = await storage
      .storeAiVolumetryImages({
        images: [
          { name: 'label-ed-000.png', png: png('a') },
          { name: '../escape.png', png: png('b') },
        ],
        patientId: 'patient-1',
        runId: 'run-broken',
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(
      existsSync(
        join(root, 'patients', 'patient-1', 'ai-masks', 'run-broken-volumetry'),
      ),
    ).toBe(false);
    expect(existsSync(join(root, 'patients', 'patient-1', 'escape.png'))).toBe(
      false,
    );
  });

  it('reads only the names it writes', async () => {
    const { localPath } = await storage.storeAiVolumetryImages({
      images: [{ name: 'label-ed-000.png', png: png('a') }],
      patientId: 'patient-1',
      runId: 'run-names',
    });
    writeFileSync(join(localPath, 'notes.txt'), 'x');
    writeFileSync(join(root, 'secret.png'), 'x');

    for (const name of [
      'notes.txt',
      '../../../../secret.png',
      'label-ed-0.png',
      'label-ed-000.png/../notes.txt',
      'LABEL-ED-000.PNG',
      '',
    ]) {
      await expect(
        storage.readAiVolumetryImage(localPath, name),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    // A name of the right shape that does not exist.
    await expect(
      storage.readAiVolumetryImage(localPath, 'slice-ed-005.png'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('never opens a folder outside the upload root, whatever the database says', async () => {
    await expect(
      storage.readAiVolumetryImage(join(root, '..'), 'label-ed-000.png'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(
      storage.readAiVolumetryImage(tmpdir(), 'label-ed-000.png'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(
      storage.deleteAiVolumetryImages(tmpdir()),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(existsSync(tmpdir())).toBe(true);
  });

  it('removes a folder and what it held', async () => {
    const { localPath } = await storage.storeAiVolumetryImages({
      images: [{ name: 'label-ed-000.png', png: png('a') }],
      patientId: 'patient-delete',
      runId: 'run-delete',
    });

    await storage.deleteAiVolumetryImages(localPath);

    expect(existsSync(localPath)).toBe(false);
    // Deleting twice is not an error.
    await expect(
      storage.deleteAiVolumetryImages(localPath),
    ).resolves.toBeUndefined();
  });
});
