import { Inject, Injectable, Logger } from '@nestjs/common';

import { ORTHANC_SETTINGS, type OrthancSettings } from './orthanc.config';

// Orthanc's REST API (https://orthanc.uclouvain.be/api/), through native fetch.
// Every failure is an OrthancError of one kind, so that the callers decide
// what it means to them (a file Orthanc cannot read is a skipped file; a store
// that does not answer is a 502).
export type OrthancErrorKind =
  | 'NOT_FOUND'
  | 'REJECTED'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'UNAVAILABLE'
  | 'UNEXPECTED';

export class OrthancError extends Error {
  constructor(
    readonly kind: OrthancErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'OrthancError';
  }
}

export type OrthancStoredInstance = {
  id: string;
  parentSeries: string;
  parentStudy: string;
  /** "AlreadyStored": Orthanc held this exact instance already. */
  status: 'AlreadyStored' | 'Success';
};

export type OrthancStudy = {
  id: string;
  patientBirthDate: string | null;
  patientName: string | null;
  patientSex: string | null;
  seriesIds: string[];
  studyDate: string | null;
  studyDescription: string | null;
  studyInstanceUid: string;
};

export type OrthancStudyStatistics = {
  countInstances: number;
  countSeries: number;
  diskSize: number;
};

export type OrthancSeries = {
  description: string | null;
  id: string;
  instanceIds: string[];
  modality: string | null;
  number: number | null;
  seriesInstanceUid: string;
};

export type OrthancInstance = {
  fileSize: number;
  id: string;
  imageOrientationPatient: number[] | null;
  imagePositionPatient: number[] | null;
  instanceNumber: number | null;
  numberOfFrames: number;
  parentSeries: string;
  parentStudy: string | null;
  sopInstanceUid: string;
};

export type RenderOptions = {
  windowCenter?: number;
  windowWidth?: number;
};

// The identifiers Orthanc gives are five groups of 8 hexadecimal digits,
// separated by dashes. Checked before an identifier reaches a URL: it comes
// from the browser.
const ORTHANC_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}$/;

export function isOrthancId(value: unknown): value is string {
  return typeof value === 'string' && ORTHANC_ID_PATTERN.test(value);
}

const MAX_FILE_BYTES = 64 * 1024 * 1024;

// The tags that place a slice, asked with the instances (semi-colon separated,
// as the route expects).
const REQUESTED_TAGS =
  'ImageOrientationPatient;ImagePositionPatient;InstanceNumber;NumberOfFrames';

type Json = Record<string, unknown>;

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const asInteger = (value: unknown): number | null => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim())
        : NaN;
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

const asRecord = (value: unknown): Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : {};

// A DICOM decimal-string vector: "1.5\\-2\\0" (backslash-separated).
export function parseDecimalVector(
  value: unknown,
  length: number,
): number[] | null {
  if (typeof value !== 'string') {
    return null;
  }
  const parts = value.split('\\').map((part) => Number(part.trim()));
  return parts.length === length && parts.every((part) => Number.isFinite(part))
    ? parts
    : null;
}

@Injectable()
export class OrthancClient {
  private readonly logger = new Logger(OrthancClient.name);
  private readonly authorization: string;

  constructor(
    @Inject(ORTHANC_SETTINGS) private readonly settings: OrthancSettings,
  ) {
    this.authorization = `Basic ${Buffer.from(
      `${settings.username}:${settings.password}`,
    ).toString('base64')}`;
  }

  // POST /instances: one DICOM file.
  async uploadInstance(file: Buffer): Promise<OrthancStoredInstance> {
    const body = asRecord(
      await this.json('POST', '/instances', {
        body: file,
        contentType: 'application/dicom',
        timeoutMs: this.settings.uploadTimeoutMs,
      }),
    );
    const id = asString(body.ID);
    const parentStudy = asString(body.ParentStudy);
    const parentSeries = asString(body.ParentSeries);
    if (!id || !parentStudy || !parentSeries) {
      throw new OrthancError('UNEXPECTED', 'Unreadable answer to an upload.');
    }
    return {
      id,
      parentSeries,
      parentStudy,
      status: body.Status === 'AlreadyStored' ? 'AlreadyStored' : 'Success',
    };
  }

  // GET /studies/{id}: the main tags of the study and of its patient.
  async getStudy(studyId: string): Promise<OrthancStudy> {
    const body = asRecord(
      await this.json('GET', `/studies/${this.id(studyId)}`),
    );
    const tags = asRecord(body.MainDicomTags);
    const patientTags = asRecord(body.PatientMainDicomTags);
    const studyInstanceUid = asString(tags.StudyInstanceUID);
    if (!studyInstanceUid) {
      throw new OrthancError(
        'UNEXPECTED',
        'A study without a StudyInstanceUID.',
      );
    }
    return {
      id: studyId,
      patientBirthDate: asString(patientTags.PatientBirthDate),
      patientName: asString(patientTags.PatientName),
      patientSex: asString(patientTags.PatientSex),
      seriesIds: Array.isArray(body.Series)
        ? body.Series.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
      studyDate: asString(tags.StudyDate),
      studyDescription: asString(tags.StudyDescription),
      studyInstanceUid,
    };
  }

  // GET /studies/{id}/statistics
  async getStudyStatistics(studyId: string): Promise<OrthancStudyStatistics> {
    const body = asRecord(
      await this.json('GET', `/studies/${this.id(studyId)}/statistics`),
    );
    return {
      countInstances: asInteger(body.CountInstances) ?? 0,
      countSeries: asInteger(body.CountSeries) ?? 0,
      diskSize: asInteger(body.DiskSize) ?? 0,
    };
  }

  // GET /studies/{id}/series?expand
  async getStudySeries(studyId: string): Promise<OrthancSeries[]> {
    const body = await this.json(
      'GET',
      `/studies/${this.id(studyId)}/series?expand`,
    );
    return (Array.isArray(body) ? body : []).map((raw): OrthancSeries => {
      const series = asRecord(raw);
      const tags = asRecord(series.MainDicomTags);
      return {
        description: asString(tags.SeriesDescription),
        id: asString(series.ID) ?? '',
        instanceIds: Array.isArray(series.Instances)
          ? series.Instances.filter(
              (value): value is string => typeof value === 'string',
            )
          : [],
        modality: asString(tags.Modality),
        number: asInteger(tags.SeriesNumber),
        seriesInstanceUid: asString(tags.SeriesInstanceUID) ?? '',
      };
    });
  }

  // GET /studies/{id}/instances?expand, with the tags that give the position
  // of each slice (they are main tags of an instance: read from the index).
  async getStudyInstances(studyId: string): Promise<OrthancInstance[]> {
    const body = await this.json(
      'GET',
      `/studies/${this.id(studyId)}/instances?expand&requested-tags=${REQUESTED_TAGS}`,
    );
    return (Array.isArray(body) ? body : []).map((raw) =>
      this.toInstance(asRecord(raw)),
    );
  }

  // GET /instances/{id}
  async getInstance(instanceId: string): Promise<OrthancInstance> {
    const body = await this.json(
      'GET',
      `/instances/${this.id(instanceId)}?requested-tags=${REQUESTED_TAGS}`,
    );
    return this.toInstance(asRecord(body));
  }

  // GET /instances/{id}/file: the DICOM file as stored.
  async getInstanceFile(instanceId: string): Promise<Buffer> {
    return this.binary(
      `/instances/${this.id(instanceId)}/file`,
      'application/dicom',
    );
  }

  // GET /instances/{id}/rendered: the first frame as an 8-bit PNG, with the
  // rescale of the file and its windowing (or the one given: both values).
  async getInstanceRendered(
    instanceId: string,
    options: RenderOptions = {},
  ): Promise<Buffer> {
    const query = new URLSearchParams();
    if (
      options.windowCenter !== undefined &&
      options.windowWidth !== undefined
    ) {
      query.set('window-center', String(options.windowCenter));
      query.set('window-width', String(options.windowWidth));
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return this.binary(
      `/instances/${this.id(instanceId)}/rendered${suffix}`,
      'image/png',
    );
  }

  // DELETE /studies/{id}. An unknown study is not an error: it is gone.
  async deleteStudy(studyId: string): Promise<void> {
    try {
      await this.json('DELETE', `/studies/${this.id(studyId)}`);
    } catch (error) {
      if (error instanceof OrthancError && error.kind === 'NOT_FOUND') {
        return;
      }
      throw error;
    }
  }

  private toInstance(raw: Json): OrthancInstance {
    const tags = asRecord(raw.MainDicomTags);
    const requested = asRecord(raw.RequestedTags);
    const tag = (name: string): unknown => requested[name] ?? tags[name];
    return {
      fileSize: asInteger(raw.FileSize) ?? 0,
      id: asString(raw.ID) ?? '',
      imageOrientationPatient: parseDecimalVector(
        tag('ImageOrientationPatient'),
        6,
      ),
      imagePositionPatient: parseDecimalVector(tag('ImagePositionPatient'), 3),
      instanceNumber: asInteger(tag('InstanceNumber')),
      // An absent NumberOfFrames means a single frame.
      numberOfFrames: Math.max(1, asInteger(tag('NumberOfFrames')) ?? 1),
      parentSeries: asString(raw.ParentSeries) ?? '',
      parentStudy: asString(raw.ParentStudy),
      sopInstanceUid: asString(tags.SOPInstanceUID) ?? '',
    };
  }

  // An identifier that is not one of Orthanc's is a resource that does not
  // exist: nothing reaches the URL.
  private id(value: string): string {
    if (!isOrthancId(value)) {
      throw new OrthancError('NOT_FOUND', 'Unknown Orthanc identifier.', 404);
    }
    return value;
  }

  private async json(
    method: 'DELETE' | 'GET' | 'POST',
    path: string,
    options: { body?: Buffer; contentType?: string; timeoutMs?: number } = {},
  ): Promise<unknown> {
    const response = await this.send(method, path, 'application/json', options);
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new OrthancError(
        'UNEXPECTED',
        'Orthanc answered something other than JSON.',
      );
    }
  }

  private async binary(path: string, accept: string): Promise<Buffer> {
    const response = await this.send('GET', path, accept, {});
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) {
      await response.body?.cancel();
      throw new OrthancError('UNEXPECTED', 'A file larger than expected.');
    }
    const content = Buffer.from(await response.arrayBuffer());
    if (content.length > MAX_FILE_BYTES) {
      throw new OrthancError('UNEXPECTED', 'A file larger than expected.');
    }
    return content;
  }

  private async send(
    method: string,
    path: string,
    accept: string,
    options: { body?: Buffer; contentType?: string; timeoutMs?: number },
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: accept,
      Authorization: this.authorization,
    };
    if (options.contentType) {
      headers['Content-Type'] = options.contentType;
    }

    let response: Response;
    try {
      response = await fetch(`${this.settings.url}${path}`, {
        body: options.body ? new Uint8Array(options.body) : undefined,
        headers,
        method,
        signal: AbortSignal.timeout(
          options.timeoutMs ?? this.settings.timeoutMs,
        ),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new OrthancError('TIMEOUT', 'Orthanc did not answer in time.');
      }
      // Never the URL nor the cause in the message: they reach the logs only.
      this.logger.warn(
        `Orthanc is unreachable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new OrthancError('UNAVAILABLE', 'Orthanc is unreachable.');
    }

    if (response.ok) {
      return response;
    }
    await response.body?.cancel();
    const { status } = response;
    if (status === 404) {
      throw new OrthancError('NOT_FOUND', 'Not found in Orthanc.', status);
    }
    if (status === 401 || status === 403) {
      this.logger.error(
        'Orthanc refused the credentials of the backend (ORTHANC_USERNAME / ORTHANC_PASSWORD).',
      );
      throw new OrthancError(
        'UNAUTHORIZED',
        'Orthanc refused the credentials.',
        status,
      );
    }
    if (status >= 400 && status < 500) {
      throw new OrthancError(
        'REJECTED',
        `Orthanc rejected the request (${status}).`,
        status,
      );
    }
    throw new OrthancError('UNEXPECTED', `Orthanc failed (${status}).`, status);
  }
}
