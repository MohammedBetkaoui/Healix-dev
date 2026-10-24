import {
  BadGatewayException,
  Injectable,
  Logger,
  MethodNotAllowedException,
  NotFoundException,
} from '@nestjs/common';
import { type DicomStudy } from '@prisma/client';
import { type Request, type Response as ExpressResponse } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { type ReadableStream as WebReadableStream } from 'node:stream/web';

import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { PatientAuditService } from '../patients/patient-audit.service';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { DICOM_STORE_UNAVAILABLE_CODE } from './dicom-errors';
import { parseDicomWebRequest } from './dicomweb-path';
import { OrthancClient, OrthancError } from './orthanc.client';

// The prefix of the proxy: the global prefix of the API, then the controller.
export const DICOMWEB_BASE_PATH = '/api/dicomweb';

// A study is "viewed" once per user and per slot of 30 minutes (fixed slots,
// by the clock), not once per image: a viewer asks for hundreds of them.
export const VIEW_SLOT_MS = 30 * 60 * 1000;

// The answer headers worth relaying. Content-Encoding and Transfer-Encoding
// never are: the body is what Orthanc sent, uncompressed (see
// OrthancClient.fetchDicomWeb).
const RELAYED_HEADERS = [
  'accept-ranges',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
] as const;

// Request headers handed to Orthanc. Never the session cookie, nor anything
// that authenticates: Orthanc is reached with the backend's own account.
const FORWARDED_REQUEST_HEADERS = ['accept', 'if-none-match', 'range'] as const;
const MAX_HEADER_LENGTH = 512;

@Injectable()
export class DicomWebProxyService {
  private readonly logger = new Logger(DicomWebProxyService.name);
  // `${user}:${study}:${slot}` already recorded, and the ones being recorded
  // (the requests of one viewer arrive together).
  private readonly viewed = new Set<string>();
  private readonly viewing = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly orthanc: OrthancClient,
    private readonly patients: PatientsService,
    private readonly audit: PatientAuditService,
  ) {}

  // GET only, on a study of the caller's workspace, streamed.
  //  - any other verb: 405 (no STOW, no DELETE: nothing can be written);
  //  - a request that does not designate an authorized study: 404, the same
  //    answer for a study that does not exist and for one of another workspace;
  //  - the answer is relayed as it comes, never held in memory.
  async handle(
    user: AuthenticatedUserPayload,
    request: Request,
    response: ExpressResponse,
  ): Promise<void> {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      throw new MethodNotAllowedException();
    }

    const url = request.originalUrl;
    const questionMark = url.indexOf('?');
    const path = questionMark === -1 ? url : url.slice(0, questionMark);
    const queryString = questionMark === -1 ? '' : url.slice(questionMark + 1);
    if (!path.startsWith(`${DICOMWEB_BASE_PATH}/`)) {
      throw new NotFoundException();
    }
    const target = parseDicomWebRequest(
      path.slice(DICOMWEB_BASE_PATH.length),
      queryString,
    );
    if (!target) {
      throw new NotFoundException();
    }

    const study = await this.getStudyInScope(user, target.studyInstanceUid);
    await this.recordView(user, study);

    await this.relay(target.path, request, response);
  }

  private async getStudyInScope(
    user: AuthenticatedUserPayload,
    studyInstanceUid: string,
  ): Promise<DicomStudy> {
    const { workspaceId } = await this.patients.getPatientScope(user);
    const study = await this.prisma.dicomStudy.findFirst({
      where: { studyInstanceUid, workspaceId },
    });
    if (!study) {
      throw new NotFoundException();
    }
    return study;
  }

  // DICOM_STUDY_VIEWED, once per user, study and slot. The images of a viewer
  // are asked for together: the first request records the view and the others
  // wait for it, so that no image leaves before the audit entry exists.
  private recordView(
    user: AuthenticatedUserPayload,
    study: DicomStudy,
    now = Date.now(),
  ): Promise<void> {
    const slot = Math.floor(now / VIEW_SLOT_MS);
    const key = `${user.sub}:${study.id}:${slot}`;

    if (this.viewed.has(key)) {
      return Promise.resolve();
    }
    const pending = this.viewing.get(key);
    if (pending) {
      return pending;
    }

    const recording = this.writeView(user, study, slot * VIEW_SLOT_MS, key)
      .then(() => {
        // The slots before this one are over: forget them.
        for (const known of this.viewed) {
          if (!known.endsWith(`:${slot}`)) {
            this.viewed.delete(known);
          }
        }
        this.viewed.add(key);
      })
      .finally(() => this.viewing.delete(key));
    this.viewing.set(key, recording);
    return recording;
  }

  private async writeView(
    user: AuthenticatedUserPayload,
    study: DicomStudy,
    slotStart: number,
    key: string,
  ): Promise<void> {
    // Another instance of the backend, or a restart, may have recorded it.
    const existing = await this.prisma.auditLog.findFirst({
      select: { id: true },
      where: {
        action: 'DICOM_STUDY_VIEWED',
        createdAt: { gte: new Date(slotStart) },
        entityId: study.id,
        userId: user.sub,
      },
    });
    if (!existing) {
      await this.audit.log(user, 'DICOM_STUDY_VIEWED', study.id, {
        patientId: study.patientId,
      });
    }
    this.logger.debug(`View of ${key} recorded.`);
  }

  private async relay(
    upstreamPath: string,
    request: Request,
    response: ExpressResponse,
  ): Promise<void> {
    const headers: Record<string, string> = {};
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers[name];
      if (typeof value === 'string' && value.length <= MAX_HEADER_LENGTH) {
        headers[name] = value;
      }
    }

    // The wait for the first byte is bounded; the body then flows for as long
    // as the browser reads it. The browser leaving cancels the request to
    // Orthanc.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.orthanc.streamTimeoutMs);
    const onClose = () => {
      if (!response.writableEnded) {
        abort.abort();
      }
    };
    response.on('close', onClose);

    try {
      await this.forward(upstreamPath, headers, abort, timer, response);
    } finally {
      response.off('close', onClose);
    }
  }

  private async forward(
    upstreamPath: string,
    headers: Record<string, string>,
    abort: AbortController,
    timer: NodeJS.Timeout,
    response: ExpressResponse,
  ): Promise<void> {
    let upstream: Response;
    try {
      upstream = await this.orthanc.fetchDicomWeb(upstreamPath, {
        headers,
        signal: abort.signal,
      });
    } catch (error) {
      if (error instanceof OrthancError || abort.signal.aborted) {
        throw new BadGatewayException({
          code: DICOM_STORE_UNAVAILABLE_CODE,
          message: "Le serveur d'imagerie DICOM ne répond pas.",
        });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    const { status } = upstream;
    // Orthanc's own 401 (the backend's account refused) must not look like a
    // lost session to the browser; a redirect or a server error is not an
    // answer either. 404 and the other client errors are relayed.
    if (
      status === 401 ||
      status === 403 ||
      status >= 500 ||
      (status >= 300 && status < 400 && status !== 304)
    ) {
      await upstream.body?.cancel();
      if (status === 401 || status === 403) {
        this.logger.error(
          'Orthanc refused the credentials of the backend (ORTHANC_USERNAME / ORTHANC_PASSWORD).',
        );
      }
      throw new BadGatewayException({
        code: DICOM_STORE_UNAVAILABLE_CODE,
        message: "Le serveur d'imagerie DICOM ne répond pas.",
      });
    }

    response.status(status);
    for (const name of RELAYED_HEADERS) {
      const value = upstream.headers.get(name);
      // A body that the runtime had to decode no longer has its length.
      if (
        value !== null &&
        !(name === 'content-length' && upstream.headers.has('content-encoding'))
      ) {
        response.setHeader(name, value);
      }
    }
    response.setHeader('Cache-Control', 'private');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (!upstream.body || status === 204 || status === 304) {
      response.end();
      return;
    }

    try {
      await pipeline(
        Readable.fromWeb(upstream.body as unknown as WebReadableStream),
        response,
      );
    } catch {
      // The browser left, or Orthanc broke off: the status is already sent.
      if (!response.writableEnded) {
        response.destroy();
      }
    }
  }
}
