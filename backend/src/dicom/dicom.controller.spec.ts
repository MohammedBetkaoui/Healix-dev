/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import request from 'supertest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../common/enums/user-role.enum';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { DicomController } from './dicom.controller';
import { DicomAnalysisService } from './dicom-analysis.service';
import { DicomImportService } from './dicom-import.service';
import { DicomStudiesService } from './dicom-studies.service';
import { DicomUploadDirInterceptor } from './dicom-upload';
import { dicomLikeFile } from './testing/zip-builder';

// The routes over HTTP: the guards in their real order on the real controller,
// the real multipart upload (to disk), and what is left on disk afterwards.
// The sign-in is replaced by a header naming the user; the services behind the
// controller are doubles.
const headerAuth: CanActivate = {
  canActivate(context: ExecutionContext) {
    const http = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: unknown;
    }>();
    const header = http.headers['x-test-user'];
    if (!header) return false;
    http.user = JSON.parse(header);
    return true;
  },
};

// The folder is removed as the answer leaves: wait for it, briefly.
async function gone(path: string): Promise<boolean> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!existsSync(path)) return true;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
}

const as = (role: string) =>
  JSON.stringify({
    email: 'dr@healix.dz',
    role,
    sub: 'user-1',
    tokenType: 'access',
  });

describe('the DICOM routes over HTTP', () => {
  let app: INestApplication;
  const importStudy = jest.fn();
  const analyze = jest.fn();
  const listCineStacks = jest.fn();
  const analyzeCineStack = jest.fn();
  const studies = {
    findOne: jest.fn(),
    listForPatient: jest.fn(),
    remove: jest.fn(),
    renderInstance: jest.fn(),
  };
  const entitlements = { getEntitlementsForUser: jest.fn() };

  beforeAll(async () => {
    Logger.overrideLogger(false);
    const module = await Test.createTestingModule({
      controllers: [DicomController],
      providers: [
        {
          provide: DicomAnalysisService,
          useValue: { analyze, analyzeCineStack, listCineStacks },
        },
        { provide: DicomImportService, useValue: { import: importStudy } },
        { provide: DicomStudiesService, useValue: studies },
        { provide: EntitlementsService, useValue: entitlements },
        DicomUploadDirInterceptor,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(headerAuth)
      .overrideGuard(VerifiedAccountGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    );
    await app.init();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    jest.resetAllMocks();
    entitlements.getEntitlementsForUser.mockResolvedValue({
      expiresAt: null,
      readOnly: false,
      status: 'ACTIVE',
    });
    importStudy.mockResolvedValue({
      imported: 1,
      skipped: 0,
      studies: [],
      warnings: [],
    });
    studies.listForPatient.mockResolvedValue([]);
    studies.remove.mockResolvedValue(undefined);
  });

  const upload = (role: string = UserRole.INDEPENDENT_DOCTOR) =>
    request(app.getHttpServer())
      .post('/dicom/studies/upload')
      .set('x-test-user', as(role));

  describe('importing', () => {
    it('hands the files, on disk, and the patient to the import', async () => {
      let paths: string[] = [];
      importStudy.mockImplementation(
        (_user, _patient, files: { path: string }[]) => {
          paths = files.map((file) => file.path);
          expect(paths.every((path) => existsSync(path))).toBe(true);
          return Promise.resolve({
            imported: 2,
            skipped: 0,
            studies: [],
            warnings: [],
          });
        },
      );

      const response = await upload()
        .field('patientId', 'patient-1')
        .attach('files', dicomLikeFile('a'), 'a.dcm')
        .attach('files', dicomLikeFile('bb'), 'b.dcm');

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ imported: 2 });
      expect(importStudy).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1' }),
        'patient-1',
        [
          expect.objectContaining({ originalname: 'a.dcm', size: 132 + 1 }),
          expect.objectContaining({ originalname: 'b.dcm', size: 132 + 2 }),
        ],
      );
      // Gone once the answer is sent.
      expect(paths).toHaveLength(2);
      expect(await gone(dirname(paths[0]))).toBe(true);
      expect(paths.some((path) => existsSync(path))).toBe(false);
    });

    it('removes the files when the import fails', async () => {
      let path = '';
      importStudy.mockImplementation((_u, _p, files: { path: string }[]) => {
        path = files[0].path;
        return Promise.reject(new Error('boom'));
      });

      const response = await upload()
        .field('patientId', 'patient-1')
        .attach('files', dicomLikeFile(), 'a.dcm');

      expect(response.status).toBe(500);
      expect(await gone(dirname(path))).toBe(true);
      expect(existsSync(path)).toBe(false);
    });

    it('is refused with 403 SUBSCRIPTION_INACTIVE on a read-only account, before the files reach the import', async () => {
      entitlements.getEntitlementsForUser.mockResolvedValue({
        expiresAt: null,
        readOnly: true,
        status: 'EXPIRED',
      });

      const response = await upload()
        .field('patientId', 'patient-1')
        .attach('files', dicomLikeFile(), 'a.dcm');

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'SUBSCRIPTION_INACTIVE' });
      expect(importStudy).not.toHaveBeenCalled();
    });

    it('needs a patient', async () => {
      const response = await upload().attach('files', dicomLikeFile(), 'a.dcm');

      expect(response.status).toBe(400);
      expect(importStudy).not.toHaveBeenCalled();
    });

    it('passes an upload with no file to the import, which refuses it', async () => {
      await upload().field('patientId', 'patient-1');

      expect(importStudy).toHaveBeenCalledWith(
        expect.anything(),
        'patient-1',
        [],
      );
    });

    it('is open to doctors and establishments, and to nobody else', async () => {
      for (const role of [
        UserRole.ESTABLISHMENT_ADMIN,
        UserRole.AFFILIATED_DOCTOR,
      ]) {
        const response = await upload(role)
          .field('patientId', 'patient-1')
          .attach('files', dicomLikeFile(), 'a.dcm');
        expect(response.status).toBe(201);
      }

      for (const role of [UserRole.SUPER_ADMIN, UserRole.ADMIN_VERIFICATION]) {
        const response = await upload(role)
          .field('patientId', 'patient-1')
          .attach('files', dicomLikeFile(), 'a.dcm');
        expect(response.status).toBe(403);
      }
    });

    it('is refused without a session', async () => {
      const response = await request(app.getHttpServer())
        .post('/dicom/studies/upload')
        .field('patientId', 'patient-1');

      expect(response.status).toBe(403);
    });
  });

  describe('a read-only account', () => {
    beforeEach(() => {
      entitlements.getEntitlementsForUser.mockResolvedValue({
        expiresAt: null,
        readOnly: true,
        status: 'EXPIRED',
      });
    });

    it('still reads the studies, their detail and the slices', async () => {
      studies.findOne.mockResolvedValue({ id: 'study-1', series: [] });
      studies.renderInstance.mockResolvedValue(Buffer.from('png'));
      const get = (path: string) =>
        request(app.getHttpServer())
          .get(path)
          .set('x-test-user', as(UserRole.INDEPENDENT_DOCTOR));

      expect((await get('/dicom/patients/patient-1/studies')).status).toBe(200);
      expect((await get('/dicom/studies/study-1')).status).toBe(200);
      const preview = await get('/dicom/instances/some-id/preview');
      expect(preview.status).toBe(200);
      expect(preview.headers['content-type']).toBe('image/png');
      expect(preview.headers['cache-control']).toBe('private, no-store');
    });

    it('cannot delete a study', async () => {
      const response = await request(app.getHttpServer())
        .delete('/dicom/studies/study-1')
        .set('x-test-user', as(UserRole.INDEPENDENT_DOCTOR));

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'SUBSCRIPTION_INACTIVE' });
      expect(studies.remove).not.toHaveBeenCalled();
    });
  });

  describe('analysing a slice', () => {
    const post = (body: object, role: string = UserRole.INDEPENDENT_DOCTOR) =>
      request(app.getHttpServer())
        .post('/dicom/instances/some-instance/analyze')
        .set('x-test-user', as(role))
        .send(body);

    it('hands the pipeline to the analysis and answers with the run it creates', async () => {
      analyze.mockResolvedValue({ id: 'run-1', pipeline: 'cardio-seg-mri' });

      const response = await post({ pipeline: 'cardio-seg-mri' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: 'run-1',
        pipeline: 'cardio-seg-mri',
      });
      expect(analyze).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1' }),
        'some-instance',
        'cardio-seg-mri',
      );
    });

    it('is refused with 403 SUBSCRIPTION_INACTIVE on a read-only account', async () => {
      entitlements.getEntitlementsForUser.mockResolvedValue({
        expiresAt: null,
        readOnly: true,
        status: 'EXPIRED',
      });

      const response = await post({ pipeline: 'brain' });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'SUBSCRIPTION_INACTIVE' });
      expect(analyze).not.toHaveBeenCalled();
    });

    it.each([
      ['no pipeline', {}],
      ['a chain that does not exist', { pipeline: 'pathology-everything' }],
      ['another field', { pipeline: 'brain', sourceDocumentId: 'x' }],
    ])('refuses %s with 400', async (_label, body) => {
      const response = await post(body);

      expect(response.status).toBe(400);
      expect(analyze).not.toHaveBeenCalled();
    });

    it('lets a chain that reads no slice through to the service, which answers 422', async () => {
      analyze.mockResolvedValue({ id: 'never' });

      await post({ pipeline: 'cardio-ecg' });

      expect(analyze).toHaveBeenCalledWith(
        expect.anything(),
        'some-instance',
        'cardio-ecg',
      );
    });

    it('is closed to the other roles', async () => {
      expect(
        (await post({ pipeline: 'brain' }, UserRole.SUPER_ADMIN)).status,
      ).toBe(403);
      expect(analyze).not.toHaveBeenCalled();
    });
  });

  describe('the cine stacks of a study and "Mesurer le cœur"', () => {
    const cineStacks = (role: string = UserRole.INDEPENDENT_DOCTOR) =>
      request(app.getHttpServer())
        .get('/dicom/studies/study-1/cine-stacks')
        .set('x-test-user', as(role));
    const measure = (
      body: object,
      role: string = UserRole.INDEPENDENT_DOCTOR,
    ) =>
      request(app.getHttpServer())
        .post('/dicom/studies/study-1/cardiac-volume')
        .set('x-test-user', as(role))
        .send(body);

    it('lists the cine stacks of a study, even on a read-only account', async () => {
      listCineStacks.mockResolvedValue([{ seriesId: 's', phases: 25 }]);
      entitlements.getEntitlementsForUser.mockResolvedValue({
        expiresAt: null,
        readOnly: true,
        status: 'EXPIRED',
      });

      const response = await cineStacks();

      expect(response.status).toBe(200);
      expect(response.body).toEqual([{ phases: 25, seriesId: 's' }]);
      expect(listCineStacks).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1' }),
        'study-1',
      );
    });

    it('hands the series to the analysis and answers with the run it creates', async () => {
      analyzeCineStack.mockResolvedValue({
        id: 'run-1',
        pipeline: 'cardio-volume-mri',
      });

      const response = await measure({ seriesId: 'aaaa-bbbb' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        id: 'run-1',
        pipeline: 'cardio-volume-mri',
      });
      expect(analyzeCineStack).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1' }),
        'study-1',
        'aaaa-bbbb',
      );
    });

    it('is refused with 403 SUBSCRIPTION_INACTIVE on a read-only account', async () => {
      entitlements.getEntitlementsForUser.mockResolvedValue({
        expiresAt: null,
        readOnly: true,
        status: 'EXPIRED',
      });

      const response = await measure({ seriesId: 'aaaa-bbbb' });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'SUBSCRIPTION_INACTIVE' });
      expect(analyzeCineStack).not.toHaveBeenCalled();
    });

    it.each([
      ['no series', {}],
      ['an empty series', { seriesId: '' }],
      ['another field', { pipeline: 'cardio-volume-mri', seriesId: 'a' }],
      ['a series that is not text', { seriesId: 12 }],
    ])('refuses %s with 400', async (_label, body) => {
      expect((await measure(body)).status).toBe(400);
      expect(analyzeCineStack).not.toHaveBeenCalled();
    });

    it('is closed to the other roles', async () => {
      expect((await cineStacks(UserRole.SUPER_ADMIN)).status).toBe(403);
      expect(
        (await measure({ seriesId: 'a' }, UserRole.SUPER_ADMIN)).status,
      ).toBe(403);
      expect(listCineStacks).not.toHaveBeenCalled();
      expect(analyzeCineStack).not.toHaveBeenCalled();
    });

    it('is refused without a session', async () => {
      const response = await request(app.getHttpServer()).get(
        '/dicom/studies/study-1/cine-stacks',
      );
      expect(response.status).toBe(403);
    });
  });

  it('deletes a study, with no body in the answer', async () => {
    const response = await request(app.getHttpServer())
      .delete('/dicom/studies/study-1')
      .set('x-test-user', as(UserRole.INDEPENDENT_DOCTOR));

    expect(response.status).toBe(204);
    expect(studies.remove).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-1' }),
      'study-1',
    );
  });

  it('reads the windowing of a preview as numbers, and refuses anything else', async () => {
    studies.renderInstance.mockResolvedValue(Buffer.from('png'));
    const get = (query: string) =>
      request(app.getHttpServer())
        .get(`/dicom/instances/some-id/preview${query}`)
        .set('x-test-user', as(UserRole.INDEPENDENT_DOCTOR));

    expect((await get('?windowCenter=40&windowWidth=400')).status).toBe(200);
    expect(studies.renderInstance).toHaveBeenCalledWith(
      expect.anything(),
      'some-id',
      {
        windowCenter: 40,
        windowWidth: 400,
      },
    );
    expect((await get('?windowCenter=abc')).status).toBe(400);
    expect((await get('?other=1')).status).toBe(400);
  });
});
