import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkspaceMembershipRole, WorkspaceType } from '@prisma/client';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import { type Response } from 'express';

import { UserRole } from '../common/enums/user-role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceContextService } from '../workspaces/workspace-context.service';
import { PatientFileStorageService } from './documents/patient-file-storage.service';
import { PatientFileValidator } from './documents/patient-file-validator';
import { PatientAuditService } from './patient-audit.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

const readAll = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
};

describe('PatientsService.getDocumentStream (GET /patients/:id/documents/:documentId/view)', () => {
  const uploadRoot = mkdtempSync(join(tmpdir(), 'healix-docs-'));
  const storedPath = join(
    uploadRoot,
    'patients',
    'patient-a',
    'documents',
    'scan.png',
  );

  const patientFindFirst = jest.fn();
  const documentFindFirst = jest.fn();
  const log = jest.fn();
  const resolveWorkspaceForUser = jest.fn();
  const prisma = {
    patient: { findFirst: patientFindFirst },
    patientDocument: { findFirst: documentFindFirst },
  } as unknown as PrismaService;
  // Real storage service on a temporary upload root: the path check and the
  // file opening are exercised for real.
  const storage = new PatientFileStorageService({
    get: (key: string) => (key === 'UPLOAD_ROOT' ? uploadRoot : undefined),
  } as unknown as ConfigService);
  const service = new PatientsService(
    prisma,
    { log } as unknown as PatientAuditService,
    {} as PatientFileValidator,
    storage,
    { resolveWorkspaceForUser } as unknown as WorkspaceContextService,
  );
  const doctor = {
    sub: 'doctor-a',
    email: 'doctor-a@healix.dz',
    role: UserRole.INDEPENDENT_DOCTOR,
    tokenType: 'access' as const,
  };
  const document = {
    id: 'document-1',
    patientId: 'patient-a',
    documentType: 'MEDICAL_IMAGE',
    originalName: 'irm-axiale.png',
    mimeType: 'image/png',
    size: 12,
    localPath: storedPath,
  };

  beforeAll(() => {
    mkdirSync(join(uploadRoot, 'patients', 'patient-a', 'documents'), {
      recursive: true,
    });
    writeFileSync(storedPath, 'png-content!');
  });

  afterAll(() => {
    rmSync(uploadRoot, { force: true, recursive: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceForUser.mockResolvedValue({
      workspaceId: 'workspace-a',
      workspaceType: WorkspaceType.PRIVATE_PRACTICE,
      membershipRole: WorkspaceMembershipRole.OWNER,
      doctorProfileId: 'doctor-profile-a',
    });
    log.mockResolvedValue(undefined);
  });

  it('streams a document of a patient in scope and audits the consultation', async () => {
    patientFindFirst.mockResolvedValue({ id: 'patient-a' });
    documentFindFirst.mockResolvedValue(document);

    const result = await service.getDocumentStream(
      doctor,
      'patient-a',
      'document-1',
    );

    // The patient is looked up inside the caller's workspace only.
    expect(patientFindFirst).toHaveBeenCalledWith({
      where: { id: 'patient-a', workspaceId: 'workspace-a' },
    });
    expect(documentFindFirst).toHaveBeenCalledWith({
      where: { id: 'document-1', patientId: 'patient-a' },
    });
    expect(log).toHaveBeenCalledWith(doctor, 'DOCUMENT_VIEWED', 'document-1', {
      documentType: 'MEDICAL_IMAGE',
      patientId: 'patient-a',
    });
    expect(result).toEqual(
      expect.objectContaining({
        mimeType: 'image/png',
        originalName: 'irm-axiale.png',
        size: 12,
      }),
    );
    await expect(readAll(result.stream)).resolves.toBe('png-content!');
  });

  it('answers 404 for a patient outside the caller scope', async () => {
    patientFindFirst.mockResolvedValue(null);

    await expect(
      service.getDocumentStream(doctor, 'patient-other', 'document-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(documentFindFirst).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('answers 404 for a document that belongs to another patient', async () => {
    patientFindFirst.mockResolvedValue({ id: 'patient-a' });
    // The (id, patientId) lookup finds nothing for a foreign document id.
    documentFindFirst.mockResolvedValue(null);

    await expect(
      service.getDocumentStream(doctor, 'patient-a', 'document-of-patient-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(documentFindFirst).toHaveBeenCalledWith({
      where: { id: 'document-of-patient-b', patientId: 'patient-a' },
    });
    expect(log).not.toHaveBeenCalled();
  });

  it('answers 404 without auditing when the stored file is missing', async () => {
    patientFindFirst.mockResolvedValue({ id: 'patient-a' });
    documentFindFirst.mockResolvedValue({
      ...document,
      localPath: join(
        uploadRoot,
        'patients',
        'patient-a',
        'documents',
        'gone.png',
      ),
    });

    await expect(
      service.getDocumentStream(doctor, 'patient-a', 'document-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(log).not.toHaveBeenCalled();
  });

  it('serves the file inline, uncached and unsniffable', async () => {
    patientFindFirst.mockResolvedValue({ id: 'patient-a' });
    documentFindFirst.mockResolvedValue({ ...document, mimeType: '' });
    const controller = new PatientsController(service);
    const headers: Record<string, string> = {};
    const response = Object.assign(new PassThrough(), {
      headersSent: false,
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    });

    await controller.viewDocument(
      doctor,
      'patient-a',
      'document-1',
      response as unknown as Response,
    );

    await expect(readAll(response)).resolves.toBe('png-content!');
    expect(headers).toEqual({
      // Empty stored MIME type (browser sent none): opaque bytes.
      'Content-Type': 'application/octet-stream',
      'Content-Length': '12',
      'Content-Disposition': 'inline; filename="irm-axiale.png"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
  });
});
