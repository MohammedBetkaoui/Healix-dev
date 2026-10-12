import { ConfigService } from '@nestjs/config';

import {
  AiServiceClient,
  AiServiceError,
  BREAKHIS_DECISION_THRESHOLD,
  parseBreastAnalysis,
  parseNucleiAnalysis,
  pathologyRejection,
} from './ai-service.client';

const SHA = 'c'.repeat(64);
// 1×1 one-channel PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==';

const breast = (overrides: Record<string, unknown> = {}) => ({
  decision: 'malignant',
  durationMs: 480,
  magnification: 200,
  malignancyScore: 0.59,
  modelId: 'pathology-breakhis-classification',
  threshold: 0.13,
  views: [0.58, 0.6, 0.57, 0.61],
  weightsSha256: SHA,
  ...overrides,
});

const SHARES = {
  connective: 0.2,
  dead: 0,
  epithelial: 0.1,
  inflammatory: 0.2,
  neoplastic: 0.5,
};
const nuclei = (overrides: Record<string, unknown> = {}) => ({
  classFractions: { background: 0.9, nucleusTypes: SHARES },
  durationMs: 1600,
  imageHeight: 500,
  imageWidth: 600,
  labelMapPng: PNG_BASE64,
  modelId: 'pathology-unet-pannuke-segmentation',
  overlayPng: PNG_BASE64,
  tileCount: 9,
  tiled: true,
  weightsSha256: SHA,
  ...overrides,
});

const serviceErrorOf = (parse: () => unknown): unknown => {
  try {
    parse();
  } catch (error: unknown) {
    return error;
  }
  throw new Error('expected a service error');
};

describe('parseBreastAnalysis', () => {
  it('reads a coherent answer', () => {
    expect(parseBreastAnalysis(breast(), 200)).toEqual({
      decision: 'malignant',
      durationMs: 480,
      magnification: 200,
      malignancyScore: 0.59,
      modelId: 'pathology-breakhis-classification',
      threshold: BREAKHIS_DECISION_THRESHOLD,
      views: [0.58, 0.6, 0.57, 0.61],
      weightsSha256: SHA,
    });
  });

  it('decides malignant from the threshold on, benign under it', () => {
    const at = (score: number) =>
      breast({ malignancyScore: score, views: [score, score, score, score] });
    expect(parseBreastAnalysis(at(0.13), 200).decision).toBe('malignant');
    expect(
      parseBreastAnalysis({ ...at(0.12), decision: 'benign' }, 200).decision,
    ).toBe('benign');
  });

  it.each([
    ['another model', { modelId: 'brain-efficientnetb4-tumor-classification' }],
    ['an invalid SHA-256', { weightsSha256: 'abc' }],
    ['a score over 1', { malignancyScore: 1.2 }],
    ['a score that is not a number', { malignancyScore: '0.59' }],
    ['another threshold', { threshold: 0.5 }],
    ['a threshold off by a hair', { threshold: 0.1300001 }],
    ['three views', { views: [0.58, 0.6, 0.57] }],
    ['a view over 1', { views: [0.58, 0.6, 0.57, 1.61] }],
    ['views whose mean is not the score', { views: [0.5, 0.6, 0.57, 0.61] }],
    ['a decision the threshold does not give', { decision: 'benign' }],
    ['an unknown decision', { decision: 'uncertain' }],
    ['another magnification', { magnification: 400 }],
    ['no duration', { durationMs: undefined }],
  ])('refuses %s', (_, overrides) => {
    const error = serviceErrorOf(() =>
      parseBreastAnalysis(breast(overrides), 200),
    );
    expect(error).toBeInstanceOf(AiServiceError);
    expect((error as AiServiceError).code).toBe('SERVICE_ERROR');
  });
});

describe('parseNucleiAnalysis', () => {
  it('reads a coherent answer, with both PNG decoded', () => {
    const result = parseNucleiAnalysis(nuclei());
    expect(result).toEqual(
      expect.objectContaining({
        classFractions: { background: 0.9, nucleusTypes: SHARES },
        imageHeight: 500,
        imageWidth: 600,
        modelId: 'pathology-unet-pannuke-segmentation',
        tileCount: 9,
        tiled: true,
      }),
    );
    expect(result.labelMapPng.equals(Buffer.from(PNG_BASE64, 'base64'))).toBe(
      true,
    );
    expect(result.overlayPng.length).toBeGreaterThan(8);
  });

  it('accepts an image without any nucleus: every type null', () => {
    const none = {
      connective: null,
      dead: null,
      epithelial: null,
      inflammatory: null,
      neoplastic: null,
    };
    expect(
      parseNucleiAnalysis(
        nuclei({
          classFractions: { background: 1, nucleusTypes: none },
          tileCount: 1,
          tiled: false,
        }),
      ).classFractions,
    ).toEqual({ background: 1, nucleusTypes: none });
  });

  it.each([
    ['another model', { modelId: 'pathology-breakhis-classification' }],
    ['an invalid SHA-256', { weightsSha256: '' }],
    [
      'a label map that is not PNG',
      { labelMapPng: Buffer.from('GIF89a').toString('base64') },
    ],
    ['no overlay', { overlayPng: undefined }],
    ['an overlay that is not PNG', { overlayPng: 'bm90IGEgcG5n' }],
    ['a zero width', { imageWidth: 0 }],
    ['a fractional height', { imageHeight: 12.5 }],
    [
      'a background over 1',
      { classFractions: { background: 1.2, nucleusTypes: SHARES } },
    ],
    [
      'a null object of types',
      { classFractions: { background: 1, nucleusTypes: null } },
    ],
    [
      'a missing type',
      {
        classFractions: {
          background: 0.9,
          nucleusTypes: { ...SHARES, dead: undefined },
        },
      },
    ],
    [
      'an extra type',
      {
        classFractions: {
          background: 0.9,
          nucleusTypes: { ...SHARES, other: 0 },
        },
      },
    ],
    [
      'shares that do not add up to 1',
      {
        classFractions: {
          background: 0.9,
          nucleusTypes: { ...SHARES, neoplastic: 0.4 },
        },
      },
    ],
    [
      'some types null, others not',
      {
        classFractions: {
          background: 0.9,
          nucleusTypes: { ...SHARES, dead: null },
        },
      },
    ],
    [
      'a share over 1',
      {
        classFractions: {
          background: 0.9,
          nucleusTypes: { ...SHARES, neoplastic: 1.5, connective: -0.8 },
        },
      },
    ],
    ['no tile', { tileCount: 0 }],
    ['tiled with a single tile', { tileCount: 1, tiled: true }],
    ['several tiles, not tiled', { tileCount: 4, tiled: false }],
    ['no duration', { durationMs: undefined }],
  ])('refuses %s', (_, overrides) => {
    const error = serviceErrorOf(() => parseNucleiAnalysis(nuclei(overrides)));
    expect(error).toBeInstanceOf(AiServiceError);
    expect((error as AiServiceError).code).toBe('SERVICE_ERROR');
  });
});

describe('pathologyRejection', () => {
  it('reads detail.code of a 422', () => {
    expect(pathologyRejection('image_too_small')).toBe('IMAGE_TOO_SMALL');
    expect(pathologyRejection('image_dimensions_too_large')).toBe(
      'IMAGE_DIMENSIONS_TOO_LARGE',
    );
    // The backend validated it: the service refusing it is an error.
    expect(pathologyRejection('invalid_magnification')).toBe('SERVICE_ERROR');
    expect(pathologyRejection('invalid_image')).toBe('INVALID_IMAGE');
    expect(pathologyRejection(undefined)).toBe('INVALID_IMAGE');
  });
});

describe('AiServiceClient (multipart calls)', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  const client = new AiServiceClient({
    get: (key: string) =>
      ({
        AI_SERVICE_TOKEN: 'service-secret',
        AI_SERVICE_URL: 'http://ai.test',
      })[key],
  } as unknown as ConfigService);
  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status,
      }),
    );
  const codeOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return (error as AiServiceError).code;
    }
    throw new Error('expected an error');
  };
  const image = Buffer.from('png-bytes');

  beforeAll(() => {
    global.fetch = fetchMock;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });
  beforeEach(() => fetchMock.mockReset());

  it('keeps /analyze/brain as it was: every 422 is an invalid image', async () => {
    reply(422, { detail: { code: 'image_too_small' } });
    await expect(
      codeOf(client.analyzeBrain(image, 'irm.png', 'image/png')),
    ).resolves.toBe('INVALID_IMAGE');
    const form = fetchMock.mock.calls[0][1]?.body as FormData;
    expect([...form.keys()]).toEqual(['image']);
  });

  it('sends the magnification with the breast image, and the token', async () => {
    reply(200, breast());

    const result = await client.analyzeBreast(
      image,
      'lame.png',
      'image/png',
      200,
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ai.test/analyze/pathology/breast-classification');
    expect(init?.headers).toEqual({ 'X-Service-Token': 'service-secret' });
    const form = init?.body as FormData;
    expect(form.get('magnification')).toBe('200');
    expect(await (form.get('image') as File).text()).toBe('png-bytes');
    expect(result.decision).toBe('malignant');
  });

  it.each([
    [
      422,
      { detail: { code: 'image_too_small', minSide: 256 } },
      'IMAGE_TOO_SMALL',
    ],
    [
      422,
      { detail: { code: 'image_dimensions_too_large', maxSide: 4096 } },
      'IMAGE_DIMENSIONS_TOO_LARGE',
    ],
    [
      422,
      { detail: { code: 'invalid_image', reason: 'undecodable' } },
      'INVALID_IMAGE',
    ],
    [422, { detail: { code: 'invalid_magnification' } }, 'SERVICE_ERROR'],
    [413, { detail: { code: 'image_too_large' } }, 'IMAGE_TOO_LARGE'],
    [503, { detail: { code: 'model_not_loaded' } }, 'MODEL_NOT_LOADED'],
    [500, {}, 'SERVICE_ERROR'],
  ])(
    'maps an HTTP %s %j of the nuclei endpoint to %s',
    async (status, body, code) => {
      reply(status, body);
      await expect(
        codeOf(client.analyzeNuclei(image, 'he.png', 'image/png')),
      ).resolves.toBe(code);
      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://ai.test/analyze/pathology/nuclei-segmentation',
      );
    },
  );
});
