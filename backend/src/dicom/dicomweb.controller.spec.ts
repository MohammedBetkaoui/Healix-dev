/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import http from 'node:http';
import { type AddressInfo } from 'node:net';
import request from 'supertest';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { REQUIRES_ACTIVE_SUBSCRIPTION_KEY } from '../common/decorators/requires-active-subscription.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { PatientAuditService } from '../patients/patient-audit.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { DicomWebController } from './dicomweb.controller';
import { DicomWebProxyService, VIEW_SLOT_MS } from './dicomweb-proxy.service';
import { OrthancClient, OrthancError } from './orthanc.client';

// The proxy over HTTP: the guards in their real order on the real controller
// and service, Orthanc replaced by a double that answers with streams.
const UID = '1.2.826.0.1.3680043.8.498.1';
const BASE = '/api/dicomweb';

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

const as = (role: string = UserRole.INDEPENDENT_DOCTOR, sub = 'user-1') =>
  JSON.stringify({ email: 'dr@healix.dz', role, sub, tokenType: 'access' });

const study = {
  id: 'study-1',
  orthancStudyId: 'aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa-aaaaaaaa',
  patientId: 'patient-1',
  studyInstanceUid: UID,
  workspaceId: 'workspace-1',
};

const bytes = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

describe('the DICOMweb proxy over HTTP', () => {
  let app: INestApplication;
  let proxy: DicomWebProxyService;
  const fetchDicomWeb = jest.fn<
    Promise<Response>,
    [string, { headers: Record<string, string>; signal: AbortSignal }]
  >();
  const findStudy = jest.fn();
  const findAudit = jest.fn();
  const audit = { log: jest.fn() };
  const getPatientScope = jest.fn();
  const entitlements = { getEntitlementsForUser: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DicomWebController],
      providers: [
        DicomWebProxyService,
        {
          provide: OrthancClient,
          useValue: { fetchDicomWeb, streamTimeoutMs: 5000 },
        },
        {
          provide: PrismaService,
          useValue: {
            auditLog: { findFirst: findAudit },
            dicomStudy: { findFirst: findStudy },
          },
        },
        { provide: PatientsService, useValue: { getPatientScope } },
        { provide: PatientAuditService, useValue: audit },
        { provide: EntitlementsService, useValue: entitlements },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(headerAuth)
      .overrideGuard(VerifiedAccountGuard)
      .useValue({ canActivate: () => true })
      .compile();

    proxy = module.get(DicomWebProxyService);
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(() => app.close());

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Date, 'now').mockRestore();
    // The views already recorded are remembered by the service: forget them.
    (proxy as unknown as { viewed: Set<string> }).viewed.clear();
    getPatientScope.mockResolvedValue({ workspaceId: 'workspace-1' });
    findStudy.mockResolvedValue(study);
    findAudit.mockResolvedValue(null);
    audit.log.mockResolvedValue(undefined);
    entitlements.getEntitlementsForUser.mockResolvedValue({
      expiresAt: null,
      readOnly: false,
      status: 'ACTIVE',
    });
    fetchDicomWeb.mockImplementation(() =>
      Promise.resolve(new Response(bytes('pixels'), { status: 200 })),
    );
  });

  const get = (path: string, user = as()) =>
    request(app.getHttpServer()).get(`${BASE}${path}`).set('x-test-user', user);

  describe('a study of the workspace', () => {
    it('is relayed: the request reaches Orthanc as a GET of that study, the answer comes back', async () => {
      fetchDicomWeb.mockResolvedValue(
        new Response(bytes('{"metadata":1}'), {
          headers: { 'Content-Type': 'application/dicom+json' },
          status: 200,
        }),
      );

      const response = await get(`/studies/${UID}/metadata`).set(
        'Accept',
        'application/dicom+json',
      );

      expect(response.status).toBe(200);
      expect(response.text).toBe('{"metadata":1}');
      expect(fetchDicomWeb).toHaveBeenCalledWith(`/studies/${UID}/metadata`, {
        headers: { accept: 'application/dicom+json' },
        signal: expect.any(AbortSignal) as AbortSignal,
      });
      expect(findStudy).toHaveBeenCalledWith({
        where: { studyInstanceUid: UID, workspaceId: 'workspace-1' },
      });
    });

    it('relays the search for that one study (QIDO)', async () => {
      await get(`/studies?StudyInstanceUID=${UID}&limit=101&offset=0`);

      expect(fetchDicomWeb.mock.calls[0][0]).toBe(
        `/studies?StudyInstanceUID=${UID}&limit=101&offset=0`,
      );
    });

    it('relays the multipart headers of an image, with its length, its tag and a private cache', async () => {
      fetchDicomWeb.mockResolvedValue(
        new Response(bytes('--bnd\r\n', 'data', '\r\n--bnd--'), {
          headers: {
            'Content-Length': '20',
            'Content-Type':
              'multipart/related; type="application/octet-stream"; boundary=bnd',
            ETag: '"abc"',
            'Set-Cookie': 'orthanc=1',
            Server: 'Orthanc/1.12',
            'X-Powered-By': 'Orthanc',
          },
          status: 200,
        }),
      );

      const response = await get(
        `/studies/${UID}/series/4.5/instances/6.7/frames/1`,
      ).set(
        'Accept',
        'multipart/related; type="application/octet-stream"; transfer-syntax=*',
      );

      expect(response.headers['content-type']).toBe(
        'multipart/related; type="application/octet-stream"; boundary=bnd',
      );
      expect(response.headers['content-length']).toBe('20');
      expect(response.headers.etag).toBe('"abc"');
      expect(response.headers['cache-control']).toBe('private');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['set-cookie']).toBeUndefined();
      // Orthanc's own identification is not passed on.
      expect(response.headers['x-powered-by']).not.toBe('Orthanc');
      expect(response.headers.server).toBeUndefined();
      expect(fetchDicomWeb.mock.calls[0][1].headers.accept).toBe(
        'multipart/related; type="application/octet-stream"; transfer-syntax=*',
      );
    });

    it('relays a Range request and the partial answer', async () => {
      fetchDicomWeb.mockResolvedValue(
        new Response(bytes('0123'), {
          headers: {
            'Content-Range': 'bytes 0-3/10',
            'Content-Type': 'application/octet-stream',
          },
          status: 206,
        }),
      );

      const response = await get(
        `/studies/${UID}/series/4.5/instances/6.7/bulkdata/7fe00010`,
      )
        .set('Range', 'bytes=0-3')
        .set('If-None-Match', '"abc"');

      expect(response.status).toBe(206);
      expect(response.headers['content-range']).toBe('bytes 0-3/10');
      expect(fetchDicomWeb.mock.calls[0][1].headers).toEqual({
        'if-none-match': '"abc"',
        range: 'bytes=0-3',
      });
    });

    it('never hands Orthanc the cookie or any credential of the browser', async () => {
      await get(`/studies/${UID}/metadata`)
        .set('Cookie', 'access_token=secret')
        .set('Authorization', 'Bearer secret');

      expect(
        JSON.stringify(fetchDicomWeb.mock.calls[0][1].headers),
      ).not.toContain('secret');
    });

    it('still serves a read-only account: no active subscription needed', async () => {
      entitlements.getEntitlementsForUser.mockResolvedValue({
        expiresAt: null,
        readOnly: true,
        status: 'EXPIRED',
      });

      expect((await get(`/studies/${UID}/metadata`)).status).toBe(200);
      for (const name of Object.getOwnPropertyNames(
        DicomWebController.prototype,
      )) {
        expect(
          Reflect.getMetadata(
            REQUIRES_ACTIVE_SUBSCRIPTION_KEY,
            DicomWebController.prototype[
              name as keyof DicomWebController
            ] as object,
          ),
        ).toBeFalsy();
      }
    });

    it('answers 404 for a study Orthanc does not have', async () => {
      fetchDicomWeb.mockResolvedValue(new Response('{}', { status: 404 }));

      expect((await get(`/studies/${UID}/metadata`)).status).toBe(404);
    });
  });

  describe('what is refused', () => {
    it('answers 404 for a study of another workspace, and asks Orthanc nothing', async () => {
      findStudy.mockResolvedValue(null);

      const response = await get(`/studies/${UID}/metadata`);

      expect(response.status).toBe(404);
      expect(findStudy).toHaveBeenCalledWith({
        where: { studyInstanceUid: UID, workspaceId: 'workspace-1' },
      });
      expect(fetchDicomWeb).not.toHaveBeenCalled();
    });

    it.each([
      ['/studies'],
      ['/studies?PatientName=*'],
      [`/studies?StudyInstanceUID=${UID}&PatientName=*`],
      ['/studies?StudyInstanceUID=1.2.3,4.5.6'],
      ['/series'],
      ['/instances'],
      [`/studies/${UID}/../../tools/reset`],
      [`/studies/${UID}/%2e%2e/system`],
      ['/studies/not-a-uid/metadata'],
    ])(
      'answers 404 for %s, without a database query nor a call to Orthanc',
      async (path) => {
        const response = await get(path);

        expect(response.status).toBe(404);
        expect(findStudy).not.toHaveBeenCalled();
        expect(fetchDicomWeb).not.toHaveBeenCalled();
      },
    );

    it.each(['post', 'put', 'patch', 'delete', 'head', 'options'] as const)(
      'answers 405 to %s, with Allow: GET, and sends nothing to Orthanc',
      async (method) => {
        const response = await request(app.getHttpServer())
          [method](`${BASE}/studies`)
          .set('x-test-user', as());

        expect(response.status).toBe(405);
        expect(response.headers.allow).toBe('GET');
        expect(fetchDicomWeb).not.toHaveBeenCalled();
      },
    );

    it('answers 405 to a STOW-RS upload of a study of the workspace too', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/studies/${UID}`)
        .set('x-test-user', as())
        .set(
          'Content-Type',
          'multipart/related; type="application/dicom"; boundary=x',
        )
        .send('--x\r\n\r\n--x--');

      expect(response.status).toBe(405);
      expect(fetchDicomWeb).not.toHaveBeenCalled();
    });

    it('needs a session, and a doctor or an establishment', async () => {
      const anonymous = await request(app.getHttpServer()).get(
        `${BASE}/studies/${UID}/metadata`,
      );
      expect(anonymous.status).toBe(403);

      const admin = await get(
        `/studies/${UID}/metadata`,
        as(UserRole.SUPER_ADMIN),
      );
      expect(admin.status).toBe(403);
      expect(fetchDicomWeb).not.toHaveBeenCalled();
    });
  });

  describe('when Orthanc misbehaves', () => {
    it.each([
      ['refuses the credentials of the backend (401)', 401],
      ['refuses the credentials of the backend (403)', 403],
      ['fails (500)', 500],
      ['is unavailable (503)', 503],
      ['redirects (302)', 302],
    ])('answers 502, never %s as it is', async (_label, status) => {
      fetchDicomWeb.mockResolvedValue(new Response('x', { status }));

      const response = await get(`/studies/${UID}/metadata`);

      expect(response.status).toBe(502);
      expect(response.body).toMatchObject({ code: 'DICOM_STORE_UNAVAILABLE' });
    });

    it('answers 502 when Orthanc cannot be reached', async () => {
      fetchDicomWeb.mockRejectedValue(new OrthancError('UNAVAILABLE', 'down'));

      const response = await get(`/studies/${UID}/metadata`);

      expect(response.status).toBe(502);
    });

    it('relays the other client errors (a range that cannot be satisfied)', async () => {
      fetchDicomWeb.mockResolvedValue(new Response('', { status: 416 }));

      expect((await get(`/studies/${UID}/metadata`)).status).toBe(416);
    });

    it('relays a 304 with no body', async () => {
      fetchDicomWeb.mockResolvedValue(
        new Response(null, { headers: { ETag: '"abc"' }, status: 304 }),
      );

      const response = await get(`/studies/${UID}/metadata`).set(
        'If-None-Match',
        '"abc"',
      );

      expect(response.status).toBe(304);
      expect(response.headers.etag).toBe('"abc"');
    });
  });

  describe('streaming', () => {
    function listen(): Promise<number> {
      return new Promise((resolve) => {
        const server = app.getHttpServer() as http.Server;
        if (server.listening) {
          resolve((server.address() as AddressInfo).port);
          return;
        }
        server.listen(0, '127.0.0.1', () =>
          resolve((server.address() as AddressInfo).port),
        );
      });
    }

    it('hands the first bytes to the browser while Orthanc is still sending', async () => {
      const port = await listen();
      let release!: () => void;
      const second = new Promise<void>((resolve) => (release = resolve));
      let producedSecond = false;
      fetchDicomWeb.mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            async start(controller) {
              controller.enqueue(new TextEncoder().encode('first-'));
              await second;
              producedSecond = true;
              controller.enqueue(new TextEncoder().encode('second'));
              controller.close();
            },
          }),
          {
            headers: { 'Content-Type': 'application/octet-stream' },
            status: 200,
          },
        ),
      );

      const received = await new Promise<{
        early: string;
        producedBefore: boolean;
        full: string;
      }>((resolve, reject) => {
        const req = http.get(
          {
            headers: { 'x-test-user': as() },
            host: '127.0.0.1',
            path: `${BASE}/studies/${UID}/metadata`,
            port,
          },
          (res) => {
            let body = '';
            let early: string | null = null;
            let producedBefore = false;
            res.on('data', (chunk: Buffer) => {
              body += chunk.toString();
              if (early === null) {
                // The first chunk is here; Orthanc has not sent the rest.
                early = body;
                producedBefore = producedSecond;
                release();
              }
            });
            res.on('end', () =>
              resolve({ early: early ?? '', full: body, producedBefore }),
            );
            res.on('error', reject);
          },
        );
        req.on('error', reject);
      });

      expect(received.early).toBe('first-');
      expect(received.producedBefore).toBe(false);
      expect(received.full).toBe('first-second');
    });

    it('cancels the request to Orthanc when the browser goes away', async () => {
      const port = await listen();
      let signal!: AbortSignal;
      let cancelled = false;
      fetchDicomWeb.mockImplementation(
        (_path: string, options: { signal: AbortSignal }) => {
          signal = options.signal;
          return Promise.resolve(
            new Response(
              new ReadableStream<Uint8Array>({
                cancel() {
                  cancelled = true;
                },
                start(controller) {
                  controller.enqueue(new TextEncoder().encode('first-'));
                  // never closes: a long image
                },
              }),
              { status: 200 },
            ),
          );
        },
      );

      await new Promise<void>((resolve, reject) => {
        const req = http.get(
          {
            headers: { 'x-test-user': as() },
            host: '127.0.0.1',
            path: `${BASE}/studies/${UID}/metadata`,
            port,
          },
          (res) => {
            res.once('data', () => {
              req.destroy();
              resolve();
            });
          },
        );
        req.on('error', () => undefined);
        setTimeout(() => reject(new Error('no data')), 3000);
      });

      for (
        let attempt = 0;
        attempt < 50 && !(signal.aborted && cancelled);
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(signal.aborted).toBe(true);
      expect(cancelled).toBe(true);
    });
  });

  describe('the audit of a view', () => {
    it('records DICOM_STUDY_VIEWED once for the many images a viewer asks for', async () => {
      await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          get(`/studies/${UID}/series/4.5/instances/${index + 1}/frames/1`),
        ),
      );
      await get(`/studies/${UID}/metadata`);

      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'user-1' }),
        'DICOM_STUDY_VIEWED',
        'study-1',
        { patientId: 'patient-1' },
      );
    });

    it('records it before the first image leaves', async () => {
      let logged = false;
      audit.log.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        logged = true;
      });
      fetchDicomWeb.mockImplementation(() => {
        expect(logged).toBe(true);
        return Promise.resolve(new Response('x', { status: 200 }));
      });

      expect((await get(`/studies/${UID}/metadata`)).status).toBe(200);
    });

    it('records it again for another user, and for the next slot of 30 minutes', async () => {
      const start = Math.floor(Date.now() / VIEW_SLOT_MS) * VIEW_SLOT_MS + 1000;
      const now = jest.spyOn(Date, 'now').mockReturnValue(start);

      await get(`/studies/${UID}/metadata`);
      await get(
        `/studies/${UID}/metadata`,
        as(UserRole.INDEPENDENT_DOCTOR, 'user-2'),
      );
      expect(audit.log).toHaveBeenCalledTimes(2);

      now.mockReturnValue(start + VIEW_SLOT_MS - 2000);
      await get(`/studies/${UID}/metadata`);
      expect(audit.log).toHaveBeenCalledTimes(2);

      now.mockReturnValue(start + VIEW_SLOT_MS);
      await get(`/studies/${UID}/metadata`);
      expect(audit.log).toHaveBeenCalledTimes(3);
    });

    it('does not record it twice when the entry of this slot is already in the log (restart, other instance)', async () => {
      const start =
        Math.floor(Date.now() / VIEW_SLOT_MS) * VIEW_SLOT_MS + VIEW_SLOT_MS * 5;
      jest.spyOn(Date, 'now').mockReturnValue(start + 500);
      findAudit.mockResolvedValue({ id: 'log-1' });

      await get(
        `/studies/${UID}/metadata`,
        as(UserRole.INDEPENDENT_DOCTOR, 'user-3'),
      );

      expect(audit.log).not.toHaveBeenCalled();
      expect(findAudit).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          action: 'DICOM_STUDY_VIEWED',
          createdAt: { gte: new Date(start - (start % VIEW_SLOT_MS)) },
          entityId: 'study-1',
          userId: 'user-3',
        },
      });
    });

    it('records nothing for a request that is refused', async () => {
      findStudy.mockResolvedValue(null);

      await get(
        `/studies/${UID}/metadata`,
        as(UserRole.INDEPENDENT_DOCTOR, 'user-4'),
      );
      await get('/studies', as(UserRole.INDEPENDENT_DOCTOR, 'user-4'));

      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  it('has a rate limit of its own, per user, well above the usual one', () => {
    expect(
      Reflect.getMetadata('THROTTLER:LIMITdefault', DicomWebController),
    ).toBe(6000);
    expect(
      Reflect.getMetadata('THROTTLER:TTLdefault', DicomWebController),
    ).toBe(60_000);
  });
});
