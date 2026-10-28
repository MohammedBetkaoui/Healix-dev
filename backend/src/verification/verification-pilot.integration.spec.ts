import { type Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type HttpException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { AdminVerificationsService } from '../admin/verifications/admin-verifications.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  applyStorageTestEnv,
  assertTestDatabaseName,
  IntegrationFixtures,
  readTestDatabase,
} from '../common/testing/integration-fixtures';
import { VerificationDocumentType } from '../common/enums/verification-document-type.enum';
import { PrismaService } from '../prisma/prisma.service';
import { FILE_MAGIC } from '../storage/crypto/file-encryption.service';
import { StorageService } from '../storage/storage.service';
import { DoctorVerificationService } from './doctor/doctor-verification.service';
import { VerificationModule } from './verification.module';

// The pilot of the encrypted storage, against a migrated database: a doctor
// uploads a verification document, the file is written encrypted under an
// opaque key (the row holds the key and the version of the format, no path),
// and the admin reads it back through the StorageService, which decrypts it.
// The plaintext never reaches the disk, and nothing of the file's location
// ever leaves the API.
// TEST_DATABASE_URL names a database ending in "_test"; skipped without it.
const database = readTestDatabase();
const describeWithDatabase = database ? describe : describe.skip;

// A real JPEG: its magic bytes are what the validator checks.
const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from('carte d\'identite du medecin'),
  Buffer.alloc(64, 7),
]);

const multerFile = (
  buffer: Buffer = JPEG_BYTES,
  name = 'carte-identite.jpg',
): Express.Multer.File =>
  ({
    buffer,
    mimetype: 'image/jpeg',
    originalname: name,
    size: buffer.length,
  }) as Express.Multer.File;

describeWithDatabase('the encrypted storage of a verification document', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fixtures: IntegrationFixtures;
  let doctorVerification: DoctorVerificationService;
  let adminVerifications: AdminVerificationsService;
  let storageRoot: string;
  const cleanupStorage = applyStorageTestEnv();

  beforeAll(async () => {
    assertTestDatabaseName(database!);
    process.env.DATABASE_URL = database!.url;
    storageRoot = process.env.STORAGE_LOCAL_ROOT!;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true }),
        VerificationModule,
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    doctorVerification = moduleRef.get(DoctorVerificationService);
    // The review side, with its real audit (a row on the test database,
    // detached by SetNull when the cleanup removes the users) and the real
    // storage; only the subscription side is not what is tested here.
    adminVerifications = new AdminVerificationsService(
      prisma,
      moduleRef.get(AuditLogsService),
      {} as never,
      moduleRef.get(StorageService),
    );
    fixtures = new IntegrationFixtures(prisma, 'dan');
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await moduleRef.close();
    cleanupStorage();
  });

  // A doctor whose verification request is back in DRAFT (the fixture marks
  // it VERIFIED), and an admin to review it.
  async function draftDoctor() {
    const doctor = await fixtures.independentDoctor();
    const request = await prisma.verificationRequest.update({
      data: { doctorCurrentStep: 'IDENTITY', status: 'DRAFT' },
      where: { doctorProfileId: doctor.profile.id },
    });
    const admin = await fixtures.user('ADMIN_VERIFICATION');

    return { admin, doctor, request };
  }

  it('writes the file encrypted under an opaque key, and the row holds the key and the version', async () => {
    const { doctor } = await draftDoctor();

    const { document } = (await doctorVerification.uploadDocument(
      doctor.actor.sub,
      {
        documentType: VerificationDocumentType.IDENTITY_DOCUMENT,
        file: multerFile(),
      },
    )) as { document: { id: string } };

    // The row: the modern key, the version of the format, no path.
    const row = await prisma.verificationDocument.findUniqueOrThrow({
      where: { id: document.id },
    });
    expect(row.storageKey).toMatch(
      /^hx\/verification\/[0-9a-f]{2}\/[0-9a-f]{32}\.bin$/,
    );
    expect(row.encryptionVersion).toBe(1);
    expect(row.localPath).toBeNull();
    expect(row.checksum).toHaveLength(64);
    expect(row.originalName).toBe('carte-identite.jpg');

    // On disk: the ciphertext (HXE magic), never the plaintext, under the
    // private root — and not under UPLOAD_ROOT.
    const ciphertext = await readFile(join(storageRoot, row.storageKey!));
    expect(ciphertext.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)).toBe(
      true,
    );
    expect(ciphertext.indexOf(JPEG_BYTES)).toBe(-1);
  });

  it('streams the document back to the admin, decrypted to the original bytes', async () => {
    const { admin, doctor, request } = await draftDoctor();

    const { document } = (await doctorVerification.uploadDocument(
      doctor.actor.sub,
      {
        documentType: VerificationDocumentType.IDENTITY_DOCUMENT,
        file: multerFile(),
      },
    )) as { document: { id: string } };

    const served = await adminVerifications.getDocumentStream(
      request.id,
      document.id,
      admin.id,
      'inline',
    );

    expect(served.originalName).toBe('carte-identite.jpg');
    expect(served.mimeType).toBe('image/jpeg');
    expect(served.size).toBe(JPEG_BYTES.length);

    const restored: Buffer[] = [];
    for await (const chunk of served.stream as Readable) {
      restored.push(chunk as Buffer);
    }
    expect(Buffer.concat(restored).equals(JPEG_BYTES)).toBe(true);
  });

  it('answers 404 for a document of another request (no cross-reading)', async () => {
    const first = await draftDoctor();
    const second = await draftDoctor();

    const { document } = (await doctorVerification.uploadDocument(
      first.doctor.actor.sub,
      {
        documentType: VerificationDocumentType.IDENTITY_DOCUMENT,
        file: multerFile(),
      },
    )) as { document: { id: string } };

    const caught = (await adminVerifications
      .getDocumentStream(
        second.request.id,
        document.id,
        first.admin.id,
        'inline',
      )
      .catch((error: unknown) => error)) as HttpException;

    expect(caught).toBeInstanceOf(NotFoundException);
  });

  it('replaces a document: the replaced file is deleted from the storage', async () => {
    const { admin, doctor, request } = await draftDoctor();

    const first = (await doctorVerification.uploadDocument(
      doctor.actor.sub,
      {
        documentType: VerificationDocumentType.IDENTITY_DOCUMENT,
        file: multerFile(),
      },
    )) as { document: { id: string } };
    const firstRow = await prisma.verificationDocument.findUniqueOrThrow({
      where: { id: first.document.id },
    });

    const second = (await doctorVerification.uploadDocument(
      doctor.actor.sub,
      {
        documentType: VerificationDocumentType.IDENTITY_DOCUMENT,
        file: multerFile(JPEG_BYTES, 'carte-identite-2.jpg'),
      },
    )) as { document: { id: string } };

    const row = await prisma.verificationDocument.findUniqueOrThrow({
      where: { id: second.document.id },
    });
    expect(row.id).toBe(firstRow.id);
    expect(row.storageKey).not.toBe(firstRow.storageKey);

    // The replaced file is gone, the new one reads back decrypted.
    await expect(
      readFile(join(storageRoot, firstRow.storageKey!)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    const served = await adminVerifications.getDocumentStream(
      request.id,
      row.id,
      admin.id,
      'inline',
    );
    expect(served.originalName).toBe('carte-identite-2.jpg');
  });

  it('keeps the summary of a document free of any location (the API answers names, never paths)', async () => {
    const { doctor } = await draftDoctor();

    const response = (await doctorVerification.uploadDocument(
      doctor.actor.sub,
      {
        documentType: VerificationDocumentType.IDENTITY_DOCUMENT,
        file: multerFile(),
      },
    )) as { document: Record<string, unknown> };

    expect(JSON.stringify(response)).not.toMatch(
      /localPath|local_path|storageKey|storage_key|hx\//,
    );
  });
});
