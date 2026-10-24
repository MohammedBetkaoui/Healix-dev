import { Logger } from '@nestjs/common';

import { OrthancClient, OrthancError, isOrthancId } from './orthanc.client';
import { type OrthancSettings } from './orthanc.config';

const SETTINGS: OrthancSettings = {
  password: 'secret',
  timeoutMs: 1000,
  uploadTimeoutMs: 2000,
  url: 'http://orthanc:8042',
  username: 'healixdz',
};

const ID = 'aaaaaaaa-bbbbbbbb-cccccccc-dddddddd-eeeeeeee';
const OTHER_ID = '11111111-22222222-33333333-44444444-55555555';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });

describe('OrthancClient', () => {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
  const client = new OrthancClient(SETTINGS);

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(() => {
    fetchMock.mockReset();
    jest
      .spyOn(global, 'fetch')
      .mockImplementation((url: string, init: RequestInit) =>
        fetchMock(url, init),
      );
  });
  afterEach(() => jest.restoreAllMocks());

  it('authenticates every request with the HTTP account', async () => {
    fetchMock.mockResolvedValue(json({ CountInstances: 3 }));

    await client.getStudyStatistics(ID);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://orthanc:8042/studies/${ID}/statistics`);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('healixdz:secret').toString('base64')}`,
    );
  });

  it('sends an instance as application/dicom and reads the study it landed in', async () => {
    fetchMock.mockResolvedValue(
      json({
        ID,
        ParentSeries: OTHER_ID,
        ParentStudy: 'bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb',
        Status: 'AlreadyStored',
      }),
    );

    const stored = await client.uploadInstance(Buffer.from('dicom bytes'));

    expect(stored).toEqual({
      id: ID,
      parentSeries: OTHER_ID,
      parentStudy: 'bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb-bbbbbbbb',
      status: 'AlreadyStored',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://orthanc:8042/instances');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/dicom',
    );
    expect(Buffer.from(init.body as Uint8Array).toString()).toBe('dicom bytes');
  });

  it('reads the main tags of a study and of its patient', async () => {
    fetchMock.mockResolvedValue(
      json({
        MainDicomTags: {
          StudyDate: '20260312',
          StudyDescription: 'CARDIAC MR',
          StudyInstanceUID: '1.2.3',
        },
        PatientMainDicomTags: {
          PatientBirthDate: '19900101',
          PatientName: 'BENALI^Amine',
          PatientSex: 'M',
        },
        Series: [OTHER_ID],
      }),
    );

    await expect(client.getStudy(ID)).resolves.toEqual({
      id: ID,
      patientBirthDate: '19900101',
      patientName: 'BENALI^Amine',
      patientSex: 'M',
      seriesIds: [OTHER_ID],
      studyDate: '20260312',
      studyDescription: 'CARDIAC MR',
      studyInstanceUid: '1.2.3',
    });
  });

  it('reads the instances of a study with their position, and a missing NumberOfFrames as one frame', async () => {
    fetchMock.mockResolvedValue(
      json([
        {
          FileSize: 2048,
          ID,
          MainDicomTags: { SOPInstanceUID: '1.2.3.4' },
          ParentSeries: OTHER_ID,
          ParentStudy: OTHER_ID,
          RequestedTags: {
            ImageOrientationPatient: '1\\0\\0\\0\\1\\0',
            ImagePositionPatient: '-100.5\\-100\\12',
            InstanceNumber: '7',
          },
        },
        {
          ID: OTHER_ID,
          MainDicomTags: { NumberOfFrames: '25', SOPInstanceUID: '1.2.3.5' },
          ParentSeries: OTHER_ID,
          RequestedTags: { NumberOfFrames: '25' },
        },
      ]),
    );

    const [first, second] = await client.getStudyInstances(ID);

    expect(first).toMatchObject({
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      imagePositionPatient: [-100.5, -100, 12],
      instanceNumber: 7,
      numberOfFrames: 1,
      sopInstanceUid: '1.2.3.4',
    });
    expect(second).toMatchObject({
      imagePositionPatient: null,
      numberOfFrames: 25,
    });
    expect(fetchMock.mock.calls[0][0]).toContain('?expand&requested-tags=');
  });

  it('asks for the PNG rendering, with a windowing only when both values are given', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(Buffer.from('png'), { status: 200 })),
    );

    await client.getInstanceRendered(ID);
    await client.getInstanceRendered(ID, { windowCenter: 40 });
    await client.getInstanceRendered(ID, {
      windowCenter: 40,
      windowWidth: 400,
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `http://orthanc:8042/instances/${ID}/rendered`,
      `http://orthanc:8042/instances/${ID}/rendered`,
      `http://orthanc:8042/instances/${ID}/rendered?window-center=40&window-width=400`,
    ]);
    expect(
      (fetchMock.mock.calls[0][1].headers as Record<string, string>).Accept,
    ).toBe('image/png');
  });

  it('deletes a study, and counts an unknown one as deleted', async () => {
    fetchMock.mockResolvedValueOnce(json({ RemainingAncestor: null }));
    await expect(client.deleteStudy(ID)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');

    fetchMock.mockResolvedValueOnce(json({}, 404));
    await expect(client.deleteStudy(ID)).resolves.toBeUndefined();
  });

  it.each([
    [404, 'NOT_FOUND'],
    [401, 'UNAUTHORIZED'],
    [403, 'UNAUTHORIZED'],
    [400, 'REJECTED'],
    [415, 'REJECTED'],
    [500, 'UNEXPECTED'],
    [503, 'UNEXPECTED'],
  ])('maps an HTTP %i to %s', async (status, kind) => {
    fetchMock.mockResolvedValue(json({ Message: 'no' }, status));

    await expect(client.getStudy(ID)).rejects.toMatchObject({ kind, status });
  });

  it('says UNAVAILABLE when Orthanc cannot be reached, without leaking the address', async () => {
    fetchMock.mockRejectedValue(
      new TypeError('fetch failed: connect ECONNREFUSED 10.0.0.5:8042'),
    );

    const error = await client.getStudy(ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(OrthancError);
    expect(error).toMatchObject({ kind: 'UNAVAILABLE' });
    expect((error as Error).message).not.toContain('10.0.0.5');
  });

  it('says TIMEOUT when Orthanc does not answer in time', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('timed out'), { name: 'TimeoutError' }),
    );

    await expect(client.getStudy(ID)).rejects.toMatchObject({
      kind: 'TIMEOUT',
    });
  });

  it('gives an upload the longer timeout', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(
      json({ ID, ParentSeries: ID, ParentStudy: ID, Status: 'Success' }),
    );

    await client.uploadInstance(Buffer.from('x'));
    await client.getStudy(ID).catch(() => undefined);

    expect(timeout).toHaveBeenNthCalledWith(1, 2000);
    expect(timeout).toHaveBeenNthCalledWith(2, 1000);
  });

  it("never puts an identifier that is not Orthanc's in a URL", async () => {
    for (const bad of [
      '../system',
      `${ID}/../../tools/reset`,
      '',
      'abc',
      `${ID}?x`,
    ]) {
      await expect(client.getInstance(bad)).rejects.toMatchObject({
        kind: 'NOT_FOUND',
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recognises the identifiers of Orthanc', () => {
    expect(isOrthancId(ID)).toBe(true);
    expect(isOrthancId(ID.toUpperCase())).toBe(false);
    expect(isOrthancId(undefined)).toBe(false);
  });
});
