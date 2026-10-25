import { ConfigService } from '@nestjs/config';

import {
  AI_CARDIO_VOLUME_TIMEOUT_MS,
  AI_SERVICE_TIMEOUT_MS,
  aiServiceTimeoutMs,
  AiServiceClient,
  AiServiceError,
  CARDIO_VOLUME_REJECTIONS,
  cardioVolumeRejection,
  INPUT_REJECTIONS,
  parseCardioVolumeAnalysis,
} from './ai-service.client';
import { staleRunAfterMs } from './ai-analysis-runs.service';
import {
  cardioVolumeAreas,
  cardioVolumeBody,
  cardioVolumeResult,
  CARDIO_VOLUME_MODEL_ID,
  PNG,
} from './volumetry/cardio-volume.fixtures';

// The cine volumetry on the client side of the AI service: what it sends, how long
// it waits, and what it accepts back. fetch is simulated.

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const errorOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as AiServiceError;
  }
  throw new Error('expected an error');
};

describe('parseCardioVolumeAnalysis', () => {
  it('reads a coherent answer: the areas, the curve, ED and ES, the measures, the images', () => {
    const parsed = parseCardioVolumeAnalysis(cardioVolumeBody());
    const expected = cardioVolumeResult();

    expect(parsed).toEqual(expected);
    expect(parsed.edPhase).toBe(0);
    expect(parsed.esPhase).toBe(3);
    expect(parsed.measures.lv.efPercent).toBeCloseTo(38, 10);
    expect(parsed.labelMapsPng.ed).toHaveLength(6);
    expect(parsed.slicesPng.es[0].equals(PNG)).toBe(true);
  });

  it('accepts a stack with no body surface, no heart rate and no phase times', () => {
    const parsed = parseCardioVolumeAnalysis({
      ...cardioVolumeBody({ bsaM2: null, heartRateBpm: null }),
      phaseTimesMs: null,
    });
    expect(parsed.bsaM2).toBeNull();
    expect(parsed.measures.cardiacOutputLMin).toBeNull();
    expect(parsed.measures.indexed).toBeNull();
    expect(parsed.phaseTimesMs).toBeNull();
  });

  it('keeps the measures it computes itself, from the areas', () => {
    // Same figures within the tolerance (the service rounds nothing, a float
    // may differ in the last bits): accepted, and ours are kept.
    const body = cardioVolumeBody();
    const measures = body.measures as { lv: { edvMl: number } };
    measures.lv.edvMl += 1e-9;
    expect(parseCardioVolumeAnalysis(body).measures.lv.edvMl).toBeCloseTo(
      43.2,
      10,
    );
  });

  describe('never stores an answer the two implementations disagree on', () => {
    const tampered = (change: (body: Record<string, unknown>) => void) => {
      const body = cardioVolumeBody();
      change(body);
      return body;
    };

    it.each([
      [
        'an ejection fraction off by a hundredth',
        (body: Record<string, unknown>) => {
          (body.measures as { lv: { efPercent: number } }).lv.efPercent += 0.01;
        },
      ],
      [
        'a mass off by a gram',
        (body: Record<string, unknown>) => {
          (body.measures as { lvMassG: number }).lvMassG += 1;
        },
      ],
      [
        'a cardiac output where no heart rate was given',
        (body: Record<string, unknown>) => {
          body.heartRateBpm = null;
        },
      ],
      [
        'a curve that is not the one of the areas',
        (body: Record<string, unknown>) => {
          (body.lvVolumeCurveMl as number[])[2] += 0.5;
        },
      ],
      [
        'an end-diastole that is not the largest volume',
        (body: Record<string, unknown>) => {
          body.edPhase = 1;
        },
      ],
      [
        'an end-systole that is not the smallest volume',
        (body: Record<string, unknown>) => {
          body.esPhase = 4;
        },
      ],
      [
        'a measure missing',
        (body: Record<string, unknown>) => {
          delete (body.measures as Record<string, unknown>).lvMassG;
        },
      ],
      [
        'a measure added',
        (body: Record<string, unknown>) => {
          (body.measures as Record<string, unknown>).extra = 1;
        },
      ],
    ])('%s', (_name, change) => {
      expect(() => parseCardioVolumeAnalysis(tampered(change))).toThrow(
        AiServiceError,
      );
    });
  });

  describe('never stores an answer with an impossible shape', () => {
    it.each([
      ['another model', { modelId: 'cardio-seg-ct-la-unet-effb4' }],
      ['no weights fingerprint', { weightsSha256: 'abc' }],
      ['no model card fingerprint', { configSha256: undefined }],
      ['one phase', { phases: 1 }],
      ['31 phases', { phases: 31 }],
      ['areas for the wrong number of phases', { areasMm2: [] }],
      ['no pixel spacing', { pixelSpacingMm: null }],
      ['a negative pixel spacing', { pixelSpacingMm: [-1, 1.5] }],
      ['a slice gap of zero', { sliceGapMm: 0 }],
      ['a slice order that is not a boolean', { sliceOrderInferred: 'yes' }],
      ['phase times of the wrong length', { phaseTimesMs: [0, 100] }],
      ['a body surface of 9 m²', { bsaM2: 9 }],
      ['a heart rate of 5 bpm', { heartRateBpm: 5 }],
      ['no duration', { durationMs: -1 }],
      ['no images', { labelMapsPng: null }],
    ])('%s', (_name, overrides) => {
      expect(() =>
        parseCardioVolumeAnalysis({ ...cardioVolumeBody(), ...overrides }),
      ).toThrow(AiServiceError);
    });

    it('slices that are not what the areas describe', () => {
      const body = cardioVolumeBody();
      const slices = body.slices as {
        positionMm: number;
        stepMm: number | null;
      }[];
      expect(() =>
        parseCardioVolumeAnalysis({ ...body, slices: slices.slice(0, 5) }),
      ).toThrow(AiServiceError);
      // The last slice has no next one.
      expect(() =>
        parseCardioVolumeAnalysis({
          ...body,
          slices: slices.map((slice) => ({ ...slice, stepMm: 8 })),
        }),
      ).toThrow(AiServiceError);
    });

    it('an area larger than the image it was measured on, however coherent the rest', () => {
      // 256 x 256 pixels of 1.5 mm: 147 456 mm² at most. The curve, ED, ES and the
      // measures are those of these very areas: only the area itself is impossible.
      const areas = cardioVolumeAreas();
      areas[2][1] = { ...areas[2][1], MYO: 150_000 };
      expect(() =>
        parseCardioVolumeAnalysis(cardioVolumeBody({ areas })),
      ).toThrow('surface');
      areas[2][1] = { ...areas[2][1], MYO: 147_000 };
      expect(
        parseCardioVolumeAnalysis(cardioVolumeBody({ areas })).phases,
      ).toBe(5);
    });

    it('a stack of 5 slices, or of 31 phases, however coherent', () => {
      const phases = (count: number) =>
        Array.from(
          { length: count },
          (_, index) =>
            cardioVolumeAreas([
              1 - 0.3 * Math.sin((index / (count - 1)) * Math.PI),
            ])[0],
        );
      // 6 slices are the least (volumes need a stack, not a few slices).
      const fewSlices = phases(5).map((phase) => phase.slice(0, 5));
      expect(() =>
        parseCardioVolumeAnalysis(cardioVolumeBody({ areas: fewSlices })),
      ).toThrow('coupes');
      expect(
        parseCardioVolumeAnalysis(cardioVolumeBody({ areas: phases(5) }))
          .slices,
      ).toHaveLength(6);
      // 30 phases are the most.
      expect(
        parseCardioVolumeAnalysis(cardioVolumeBody({ areas: phases(30) }))
          .phases,
      ).toBe(30);
      expect(() =>
        parseCardioVolumeAnalysis(cardioVolumeBody({ areas: phases(31) })),
      ).toThrow('phases');
    });

    it('a stack of more than 100 slices', () => {
      const stackOf = (slices: number) =>
        [1, 0.8, 0.62, 0.9].map((factor) =>
          Array.from({ length: slices }, () => ({
            LV: 100 * factor,
            MYO: 80,
            RV: 120,
          })),
        );
      expect(
        parseCardioVolumeAnalysis(cardioVolumeBody({ areas: stackOf(100) }))
          .slices,
      ).toHaveLength(100);
      expect(() =>
        parseCardioVolumeAnalysis(cardioVolumeBody({ areas: stackOf(101) })),
      ).toThrow('coupes');
    });

    it('an image that is not a PNG, or not one per slice', () => {
      const notPng = Buffer.from('not a png').toString('base64');
      const body = cardioVolumeBody();
      const maps = body.labelMapsPng as { ed: string[]; es: string[] };
      expect(() =>
        parseCardioVolumeAnalysis({
          ...body,
          labelMapsPng: { ...maps, ed: [notPng, ...maps.ed.slice(1)] },
        }),
      ).toThrow(AiServiceError);
      expect(() =>
        parseCardioVolumeAnalysis({
          ...body,
          slicesPng: { ed: [], es: [] },
        }),
      ).toThrow(AiServiceError);
    });
  });

  it('keeps short warnings and drops what could carry anything else', () => {
    const parsed = parseCardioVolumeAnalysis(
      cardioVolumeBody({
        warnings: [
          { code: 'irregular_slice_spacing', maxMm: 10, medianMm: 8, minMm: 6 },
          { code: 'x'.repeat(200), nested: 1 },
        ],
      }),
    );
    expect(parsed.warnings[0]).toEqual({
      code: 'irregular_slice_spacing',
      maxMm: 10,
      medianMm: 8,
      minMm: 6,
    });
    expect(parsed.warnings[1].code).toHaveLength(60);

    const body = cardioVolumeBody();
    (body.warnings as unknown[]).push(
      ...Array.from({ length: 30 }, () => ({ code: 'w' })),
    );
    expect(() => parseCardioVolumeAnalysis(body)).toThrow(AiServiceError);
    expect(() =>
      parseCardioVolumeAnalysis({ ...body, warnings: [{ nocode: 1 }] }),
    ).toThrow(AiServiceError);
  });
});

describe('cardioVolumeRejection', () => {
  it('knows every refusal of a stack the service gives', () => {
    for (const code of CARDIO_VOLUME_REJECTIONS) {
      expect(cardioVolumeRejection(code.toLowerCase())).toBe(code);
    }
  });

  it('falls back to the refusals of an image, then to an invalid answer', () => {
    expect(cardioVolumeRejection('invalid_image')).toBe('INVALID_IMAGE');
    expect(cardioVolumeRejection('image_too_small')).toBe('IMAGE_TOO_SMALL');
    // What is not named is an invalid image, as for every other chain.
    expect(cardioVolumeRejection('something_else')).toBe('INVALID_IMAGE');
    expect(cardioVolumeRejection(undefined)).toBe('INVALID_IMAGE');
  });

  it('counts as a refused input (the run is REJECTED_INPUT, not FAILED)', () => {
    for (const code of CARDIO_VOLUME_REJECTIONS) {
      expect(INPUT_REJECTIONS).toContain(code);
    }
  });
});

describe('the wait for a cine volumetry', () => {
  it('is three times the usual one for this chain only', () => {
    expect(AI_CARDIO_VOLUME_TIMEOUT_MS).toBe(180_000);
    expect(aiServiceTimeoutMs('cardio-volume-mri')).toBe(180_000);
    for (const pipeline of [
      'brain',
      'pathology-breast',
      'pathology-nuclei',
      'cardio-ecg',
      'cardio-seg-mri',
    ]) {
      expect(aiServiceTimeoutMs(pipeline)).toBe(AI_SERVICE_TIMEOUT_MS);
    }
  });

  it('leaves a minute more than the wait before a RUNNING run is called interrupted', () => {
    expect(staleRunAfterMs('cardio-volume-mri')).toBe(240_000);
    expect(staleRunAfterMs('brain')).toBe(AI_SERVICE_TIMEOUT_MS + 60_000);
  });
});

describe('AiServiceClient.analyzeCardioVolume', () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  const originalFetch = global.fetch;
  const client = new AiServiceClient(
    config({ AI_SERVICE_TOKEN: 'secret', AI_SERVICE_URL: 'http://ai.test' }),
  );
  const zip = Buffer.from('PK-stack');

  beforeAll(() => {
    global.fetch = fetchMock;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts the archive as the "stack" field to the volumetry route, with the token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, cardioVolumeBody()));

    const result = await client.analyzeCardioVolume(zip, 'serie-5-cine.zip');

    expect(result.modelId).toBe(CARDIO_VOLUME_MODEL_ID);
    const [url, init] = fetchMock.mock.lastCall as [string, RequestInit];
    expect(url).toBe('http://ai.test/analyze/cardio/volume-mri');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    const sent = form.get('stack') as File;
    expect(sent.type).toBe('application/zip');
    expect(sent.name).toBe('serie-5-cine.zip');
    expect(Buffer.from(await sent.arrayBuffer()).equals(zip)).toBe(true);
    expect(JSON.stringify(init.headers)).toContain('secret');
  });

  it('waits 180 seconds, not 60', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(jsonResponse(200, cardioVolumeBody()));

    await client.analyzeCardioVolume(zip, 'a.zip');

    expect(timeout).toHaveBeenCalledWith(180_000);
    timeout.mockRestore();
  });

  it('says why a stack was refused, with the figures', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        detail: { code: 'cardio_volume_too_few_slices', found: 4, min: 6 },
      }),
    );
    const error = await errorOf(client.analyzeCardioVolume(zip, 'a.zip'));
    expect(error.code).toBe('CARDIO_VOLUME_TOO_FEW_SLICES');
    expect(error.details).toEqual({ found: 4, min: 6 });

    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        detail: {
          code: 'cardio_volume_unequal_phases',
          phasesPerPosition: [25, 25, 24],
        },
      }),
    );
    const unequal = await errorOf(client.analyzeCardioVolume(zip, 'a.zip'));
    expect(unequal.code).toBe('CARDIO_VOLUME_UNEQUAL_PHASES');
    expect(unequal.details).toEqual({ phasesPerPosition: [25, 25, 24] });
  });

  it('maps a too large archive and an unavailable model', async () => {
    fetchMock.mockResolvedValue(jsonResponse(413, { detail: 'too large' }));
    expect((await errorOf(client.analyzeCardioVolume(zip, 'a.zip'))).code).toBe(
      'CARDIO_VOLUME_TOO_LARGE',
    );

    fetchMock.mockResolvedValue(
      jsonResponse(503, { detail: { code: 'model_not_loaded' } }),
    );
    expect((await errorOf(client.analyzeCardioVolume(zip, 'a.zip'))).code).toBe(
      'MODEL_NOT_LOADED',
    );
  });

  it('refuses an incoherent answer', async () => {
    const body = cardioVolumeBody();
    (body.measures as { lvMassG: number }).lvMassG += 5;
    fetchMock.mockResolvedValue(jsonResponse(200, body));
    await expect(
      client.analyzeCardioVolume(zip, 'a.zip'),
    ).rejects.toBeInstanceOf(AiServiceError);
  });

  it('does not call the service without its token', async () => {
    const unconfigured = new AiServiceClient(config({}));
    const error = await errorOf(unconfigured.analyzeCardioVolume(zip, 'a.zip'));
    expect(error.code).toBe('SERVICE_NOT_CONFIGURED');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
