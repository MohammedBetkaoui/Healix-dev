import { type AiPipeline } from '../dto/create-ai-analysis-run.dto';
import {
  buildAiTimeline,
  compareRuns,
  deltaOf,
  extractMeasures,
  MEASURES,
  sourceKindOf,
  type TimelineRun,
} from './ai-timeline';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const BRAIN_MODEL = 'brain-efficientnetb4-tumor-classification';

let sequence = 0;
function run(overrides: Partial<TimelineRun> = {}): TimelineRun {
  sequence += 1;
  return {
    classificationModelId: BRAIN_MODEL,
    classificationWeightsSha256: SHA_A,
    createdAt: new Date(Date.UTC(2026, 0, sequence)),
    decisionLabel: null,
    decisionStatus: null,
    decisionThreshold: null,
    id: `run-${String(sequence).padStart(3, '0')}`,
    malignancyScore: null,
    maskAreaPx: null,
    maskAreaRatio: null,
    maskPath: null,
    modelDecision: null,
    overlayPath: null,
    pipeline: 'brain',
    predictions: [
      { label: 'meningioma', probability: 0.9 },
      { label: 'notumor', probability: 0.1 },
    ],
    segmentationModelId: null,
    segmentationWeightsSha256: null,
    slicePath: null,
    sourceDocument: {
      documentType: 'MEDICAL_IMAGE',
      mimeType: 'image/png',
      originalName: 'irm.png',
    },
    sourceDocumentId: 'doc-1',
    tracePath: null,
    ...overrides,
  };
}

const area = (pixels: number, areaMm2: number | null) => ({ areaMm2, pixels });
function heart(
  options: {
    lv?: [number, number | null];
    rv?: [number, number | null];
    myo?: [number, number | null];
    source?: 'dicom' | 'image';
    spacing?: [number, number] | null;
    sha?: string;
  } = {},
): TimelineRun {
  const { lv = [4000, 1000], rv = [3000, 750], myo = [2500, 625] } = options;
  return run({
    classificationModelId: null,
    classificationWeightsSha256: null,
    pipeline: 'cardio-seg-mri',
    predictions: {
      noStructureFound: false,
      pixelSpacingMm:
        options.spacing === undefined ? [0.5, 0.5] : options.spacing,
      source: options.source ?? 'dicom',
      structures: { LV: area(...lv), MYO: area(...myo), RV: area(...rv) },
    },
    segmentationModelId: 'cardio-seg-acdc-unet-effb4',
    segmentationWeightsSha256: options.sha ?? SHA_A,
    sourceDocument: {
      documentType: 'DICOM',
      mimeType: 'application/dicom',
      originalName: 'coupe.dcm',
    },
  });
}

const ecg = (
  probabilities: Record<string, number>,
  positive: string[] = [],
  sha = SHA_A,
) =>
  run({
    classificationModelId: 'cardio-ecg-resnet1d-ptbxl-superdiagnostic',
    classificationWeightsSha256: sha,
    pipeline: 'cardio-ecg',
    predictions: { positive, probabilities },
    sourceDocument: {
      documentType: 'ECG_SIGNAL',
      mimeType: 'text/csv',
      originalName: 'ecg.csv',
    },
  });

const breast = (malignancyScore: number, modelDecision: string, sha = SHA_A) =>
  run({
    classificationModelId: 'pathology-breakhis-classification',
    classificationWeightsSha256: sha,
    decisionThreshold: 0.5,
    malignancyScore,
    modelDecision,
    pipeline: 'pathology-breast',
    predictions: null,
  });

const timeline = (pipeline: AiPipeline, runs: TimelineRun[]) =>
  buildAiTimeline('patient-1', pipeline, runs);

describe('extractMeasures', () => {
  it('reads the class probability and the mask area of a brain run', () => {
    expect(
      extractMeasures(run({ maskAreaPx: 1200, maskAreaRatio: 0.0183 })),
    ).toEqual({
      maskAreaPx: 1200,
      maskAreaRatio: 0.0183,
      topProbability: 0.9,
    });
  });

  it('has no area for a brain run with nothing outlined', () => {
    expect(extractMeasures(run())).toEqual({
      maskAreaPx: null,
      maskAreaRatio: null,
      topProbability: 0.9,
    });
  });

  it('reads the areas of the three structures in pixels and, when known, in mm2', () => {
    expect(extractMeasures(heart())).toEqual({
      lvAreaMm2: 1000,
      lvPixels: 4000,
      myoAreaMm2: 625,
      myoPixels: 2500,
      rvAreaMm2: 750,
      rvPixels: 3000,
    });
  });

  it('has no mm2 for an MRI without a pixel spacing, the pixels stay', () => {
    const measures = extractMeasures(
      heart({
        lv: [4000, null],
        myo: [2500, null],
        rv: [3000, null],
        spacing: null,
      }),
    );

    expect(measures.lvAreaMm2).toBeNull();
    expect(measures.lvPixels).toBe(4000);
  });

  it('reads the BreakHis score', () => {
    expect(extractMeasures(breast(0.62, 'malignant'))).toEqual({
      malignancyScore: 0.62,
    });
  });

  it('reads the probability of each class of an ECG', () => {
    expect(
      extractMeasures(
        ecg({ CD: 0.2, HYP: 0.1, MI: 0.7, NORM: 0.05, STTC: 0.3 }),
      ),
    ).toEqual({
      probCd: 0.2,
      probHyp: 0.1,
      probMi: 0.7,
      probNorm: 0.05,
      probSttc: 0.3,
    });
  });

  it('reads the share of nucleus pixels of a nuclei map', () => {
    expect(
      extractMeasures(
        run({
          maskAreaRatio: 0.31,
          pipeline: 'pathology-nuclei',
          predictions: null,
        }),
      ),
    ).toEqual({
      maskAreaRatio: 0.31,
    });
  });

  it.each([null, [], 'x', { structures: 'x' }])(
    'gives no value for a result it cannot read: %j',
    (predictions) => {
      const measures = extractMeasures(
        run({ pipeline: 'cardio-seg-mri', predictions: predictions as never }),
      );

      expect(Object.values(measures).every((value) => value === null)).toBe(
        true,
      );
    },
  );

  it('gives each chain exactly the measures of its catalogue', () => {
    const runs: Record<string, TimelineRun> = {
      brain: run(),
      'cardio-ecg': ecg({}),
      'cardio-seg-mri': heart(),
      'pathology-breast': breast(0.5, 'benign'),
      'pathology-nuclei': run({ pipeline: 'pathology-nuclei' }),
    };

    for (const [pipeline, source] of Object.entries(runs)) {
      expect(Object.keys(extractMeasures(source)).sort()).toEqual(
        MEASURES[pipeline as AiPipeline].map((m) => m.key).sort(),
      );
    }
  });
});

describe('deltaOf', () => {
  it('gives the difference in value and in %', () => {
    expect(deltaOf(1200, 1000)).toEqual({ percent: 20, value: 200 });
    expect(deltaOf(800, 1000)).toEqual({ percent: -20, value: -200 });
    expect(deltaOf(1000, 1000)).toEqual({ percent: 0, value: 0 });
  });

  it('has no percentage against a previous value of 0, but still the value', () => {
    expect(deltaOf(300, 0)).toEqual({ percent: null, value: 300 });
  });

  it('has nothing when either side has no value', () => {
    expect(deltaOf(null, 5)).toBeNull();
    expect(deltaOf(5, null)).toBeNull();
    expect(deltaOf(null, null)).toBeNull();
  });

  it('is not spoiled by floating point', () => {
    expect(deltaOf(0.3, 0.1)).toEqual({ percent: 200, value: 0.2 });
  });
});

describe('the timeline', () => {
  it('lists the runs oldest first, whatever the order they come in', () => {
    const early = run({ createdAt: new Date('2026-02-01T10:00:00Z') });
    const middle = run({ createdAt: new Date('2026-03-01T10:00:00Z') });
    const late = run({ createdAt: new Date('2026-04-01T10:00:00Z') });

    expect(
      timeline('brain', [late, early, middle]).items.map((item) => item.runId),
    ).toEqual([early.id, middle.id, late.id]);
  });

  it('breaks a tie of dates by id', () => {
    const same = new Date('2026-02-01T10:00:00Z');
    const b = run({ createdAt: same, id: 'b' });
    const a = run({ createdAt: same, id: 'a' });

    expect(timeline('brain', [b, a]).items.map((item) => item.runId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('compares nothing for the first run, and each other run with the one before it', () => {
    const first = run({ maskAreaPx: 1000 });
    const second = run({ maskAreaPx: 1200 });
    const third = run({ maskAreaPx: 900 });

    const { items } = timeline('brain', [first, second, third]);

    expect(items[0].comparison).toBeNull();
    expect(items[1].comparison).toMatchObject({
      previousRunId: first.id,
      deltas: { maskAreaPx: { percent: 20, value: 200 } },
    });
    expect(items[2].comparison).toMatchObject({
      previousRunId: second.id,
      deltas: { maskAreaPx: { percent: -25, value: -300 } },
    });
  });

  it('is empty without runs', () => {
    expect(timeline('brain', [])).toMatchObject({
      items: [],
      pipeline: 'brain',
      primaryMeasure: 'topProbability',
    });
  });

  it('carries what the screen needs to show and fetch each run', () => {
    const { items } = timeline('brain', [
      run({
        decisionLabel: 'meningioma',
        decisionStatus: 'VALIDATED',
        maskPath: '/m.png',
        sourceDocumentId: 'doc-9',
      }),
    ]);

    expect(items[0]).toMatchObject({
      decisionLabel: 'meningioma',
      decisionStatus: 'VALIDATED',
      hasMask: true,
      hasOverlay: false,
      hasSlice: false,
      hasTrace: false,
      label: 'meningioma',
      labels: null,
      model: { id: BRAIN_MODEL, weightsSha256: SHA_A },
      source: 'image',
      sourceDocumentId: 'doc-9',
    });
    expect(items[0].createdAt).toMatch(/^2026-01-\d\dT/);
  });

  it('never carries a stored path', () => {
    const json = JSON.stringify(
      timeline('brain', [
        run({ maskPath: '/secret/mask.png', overlayPath: '/secret/o.png' }),
      ]),
    );

    expect(json).not.toContain('secret');
    expect(json).not.toContain('maskPath');
  });

  it('names the result of each chain: the class, the BreakHis result, the classes of an ECG', () => {
    expect(timeline('brain', [run()]).items[0].label).toBe('meningioma');
    expect(
      timeline('pathology-breast', [breast(0.7, 'malignant')]).items[0].label,
    ).toBe('malignant');
    expect(
      timeline('cardio-ecg', [ecg({ MI: 0.8 }, ['MI'])]).items[0],
    ).toMatchObject({ label: null, labels: ['MI'] });
  });
});

describe('compareRuns', () => {
  it('compares any two runs, not only neighbours: the screen can set the first against the last', () => {
    const { items } = timeline('brain', [
      run({ maskAreaPx: 1000 }),
      run({ maskAreaPx: 1500 }),
      run({ classificationWeightsSha256: SHA_B, maskAreaPx: 800 }),
    ]);

    const comparison = compareRuns('brain', items[2], items[0], items[0].runId);

    expect(comparison.previousRunId).toBe(items[0].runId);
    expect(comparison.deltas.maskAreaPx).toEqual({ percent: -20, value: -200 });
    expect(comparison.caveats).toEqual(['MODEL_CHANGED', 'NO_PIXEL_SPACING']);
  });

  it('compares a run with itself as no change, and a reliable one for a chain with no area', () => {
    const { items } = timeline('pathology-breast', [breast(0.4, 'benign')]);

    expect(
      compareRuns('pathology-breast', items[0], items[0], items[0].runId),
    ).toMatchObject({
      caveats: [],
      deltas: { malignancyScore: { percent: 0, value: 0 } },
      labelChanged: false,
      reliable: true,
    });
  });
});

describe('the primary measure', () => {
  it('is the tumour area once at least two brain runs outlined one, the class probability before', () => {
    expect(
      timeline('brain', [run({ maskAreaPx: 100 }), run()]).primaryMeasure,
    ).toBe('topProbability');
    expect(
      timeline('brain', [run({ maskAreaPx: 100 }), run({ maskAreaPx: 120 })])
        .primaryMeasure,
    ).toBe('maskAreaPx');
  });

  it('is the left ventricle in mm2 when two MRI have it, in pixels otherwise', () => {
    expect(timeline('cardio-seg-mri', [heart(), heart()]).primaryMeasure).toBe(
      'lvAreaMm2',
    );
    expect(
      timeline('cardio-seg-mri', [
        heart(),
        heart({ lv: [4000, null], spacing: null }),
      ]).primaryMeasure,
    ).toBe('lvPixels');
  });

  it('is the score for the breast, the share for the nuclei and the infarction probability for the ECG', () => {
    expect(timeline('pathology-breast', []).primaryMeasure).toBe(
      'malignancyScore',
    );
    expect(timeline('pathology-nuclei', []).primaryMeasure).toBe(
      'maskAreaRatio',
    );
    expect(timeline('cardio-ecg', []).primaryMeasure).toBe('probMi');
  });

  it('is always one of the measures of the chain', () => {
    for (const pipeline of Object.keys(MEASURES) as AiPipeline[]) {
      const result = timeline(pipeline, []);

      expect(result.measures.map((measure) => measure.key)).toContain(
        result.primaryMeasure,
      );
    }
  });
});

describe('the comparisons that cannot be trusted', () => {
  const caveats = (
    previous: TimelineRun,
    current: TimelineRun,
    pipeline: AiPipeline = 'brain',
  ) => timeline(pipeline, [previous, current]).items[1].comparison;

  it('is reliable when the model, the source and the spacing are the same', () => {
    const comparison = caveats(
      heart({ lv: [4000, 1000] }),
      heart({ lv: [4400, 1100] }),
      'cardio-seg-mri',
    );

    expect(comparison).toMatchObject({ caveats: [], reliable: true });
    expect(comparison?.deltas.lvAreaMm2).toEqual({ percent: 10, value: 100 });
  });

  describe('a different model', () => {
    it('is flagged when the weights differ', () => {
      expect(
        caveats(
          run({ maskAreaPx: 100 }),
          run({ classificationWeightsSha256: SHA_B, maskAreaPx: 110 }),
        )?.caveats,
      ).toContain('MODEL_CHANGED');
      expect(
        caveats(
          breast(0.4, 'benign'),
          breast(0.6, 'malignant', SHA_B),
          'pathology-breast',
        ),
      ).toMatchObject({ caveats: ['MODEL_CHANGED'], reliable: false });
      expect(
        caveats(ecg({ MI: 0.1 }), ecg({ MI: 0.2 }, [], SHA_B), 'cardio-ecg')
          ?.caveats,
      ).toEqual(['MODEL_CHANGED']);
      expect(
        caveats(heart(), heart({ sha: SHA_B }), 'cardio-seg-mri')?.caveats,
      ).toContain('MODEL_CHANGED');
    });

    it('is flagged when the model id differs, even with the same weights', () => {
      expect(
        caveats(run(), run({ classificationModelId: 'another-model' }))
          ?.caveats,
      ).toContain('MODEL_CHANGED');
    });

    it('is flagged when the weights of one run are unknown: it cannot be said they are the same', () => {
      expect(
        caveats(run(), run({ classificationWeightsSha256: null }))?.caveats,
      ).toContain('MODEL_CHANGED');
      expect(
        caveats(
          run({ classificationWeightsSha256: null }),
          run({ classificationWeightsSha256: null }),
        )?.caveats,
      ).toContain('MODEL_CHANGED');
    });

    it('is not flagged for the same weights', () => {
      expect(
        caveats(
          breast(0.4, 'benign'),
          breast(0.45, 'benign'),
          'pathology-breast',
        )?.caveats,
      ).toEqual([]);
    });

    it('looks at the brain segmenter only when both runs used one', () => {
      const segmented = (sha: string, area: number) =>
        run({
          maskAreaPx: area,
          maskPath: '/m.png',
          segmentationModelId: 'brain-unet-meningioma-segmentation',
          segmentationWeightsSha256: sha,
        });

      // Two segmentations by different weights: the areas are not comparable.
      expect(
        caveats(segmented(SHA_A, 100), segmented(SHA_B, 120))?.caveats,
      ).toContain('MODEL_CHANGED');
      // The same segmenter twice.
      expect(
        caveats(segmented(SHA_A, 100), segmented(SHA_A, 120))?.caveats,
      ).not.toContain('MODEL_CHANGED');
      // One run had no tumour to outline: no segmenter ran, nothing to compare.
      expect(caveats(segmented(SHA_A, 100), run())?.caveats).not.toContain(
        'MODEL_CHANGED',
      );
    });
  });

  describe('no pixel spacing', () => {
    it('is flagged when two brain runs have their areas compared: an image carries no spacing', () => {
      const comparison = caveats(
        run({ maskAreaPx: 1000, maskAreaRatio: 0.015 }),
        run({ maskAreaPx: 1200, maskAreaRatio: 0.018 }),
      );

      expect(comparison?.caveats).toEqual(['NO_PIXEL_SPACING']);
      expect(comparison?.reliable).toBe(false);
    });

    it('is not flagged for brain runs with no area to compare (no tumour outlined)', () => {
      expect(caveats(run(), run({ maskAreaPx: 1200 }))?.caveats).toEqual([]);
      expect(caveats(run(), run())?.caveats).toEqual([]);
    });

    it('is flagged for an MRI when either run has no spacing: only the pixels can be compared', () => {
      const without = heart({
        lv: [4000, null],
        myo: [2500, null],
        rv: [3000, null],
        spacing: null,
      });
      const withSpacing = heart();

      expect(caveats(withSpacing, without, 'cardio-seg-mri')).toMatchObject({
        caveats: ['NO_PIXEL_SPACING'],
        deltas: { lvAreaMm2: null },
      });
      expect(caveats(without, withSpacing, 'cardio-seg-mri')?.caveats).toEqual([
        'NO_PIXEL_SPACING',
      ]);
      expect(
        caveats(
          without,
          heart({
            lv: [4200, null],
            myo: [2500, null],
            rv: [3000, null],
            spacing: null,
          }),
          'cardio-seg-mri',
        )?.caveats,
      ).toEqual(['NO_PIXEL_SPACING']);
    });

    it('keeps the pixel difference of an MRI with no spacing, flagged', () => {
      const comparison = caveats(
        heart({ lv: [4000, null], spacing: null }),
        heart({ lv: [4400, null], spacing: null }),
        'cardio-seg-mri',
      );

      expect(comparison?.deltas.lvPixels).toEqual({ percent: 10, value: 400 });
    });

    it('never concerns a score, a probability or a share of nuclei', () => {
      expect(
        caveats(
          breast(0.4, 'benign'),
          breast(0.5, 'benign'),
          'pathology-breast',
        )?.caveats,
      ).toEqual([]);
      expect(
        caveats(ecg({ MI: 0.1 }), ecg({ MI: 0.3 }), 'cardio-ecg')?.caveats,
      ).toEqual([]);
      expect(
        caveats(
          run({ maskAreaRatio: 0.2, pipeline: 'pathology-nuclei' }),
          run({ maskAreaRatio: 0.3, pipeline: 'pathology-nuclei' }),
          'pathology-nuclei',
        )?.caveats,
      ).toEqual([]);
    });
  });

  describe('a different source', () => {
    it('is flagged when a DICOM follows an image, and the other way round', () => {
      expect(
        caveats(
          heart({ source: 'dicom' }),
          heart({ source: 'image' }),
          'cardio-seg-mri',
        )?.caveats,
      ).toContain('SOURCE_CHANGED');
      expect(
        caveats(
          heart({ source: 'image' }),
          heart({ source: 'dicom' }),
          'cardio-seg-mri',
        )?.caveats,
      ).toContain('SOURCE_CHANGED');
    });

    it('is not flagged for the same kind of source', () => {
      expect(
        caveats(
          heart({ source: 'dicom' }),
          heart({ source: 'dicom' }),
          'cardio-seg-mri',
        )?.caveats,
      ).toEqual([]);
    });

    it('tells a DICOM document from an image for the other chains', () => {
      const dicom = run({
        sourceDocument: {
          documentType: 'DICOM',
          mimeType: 'application/dicom',
          originalName: 'x.dcm',
        },
      });

      expect(sourceKindOf(dicom)).toBe('dicom');
      expect(caveats(run(), dicom)?.caveats).toContain('SOURCE_CHANGED');
    });

    it('treats a PNG and a JPEG as the same kind of source', () => {
      const jpeg = run({
        sourceDocument: {
          documentType: 'MEDICAL_IMAGE',
          mimeType: 'image/jpeg',
          originalName: 'x.jpg',
        },
      });

      expect(caveats(run(), jpeg)?.caveats).not.toContain('SOURCE_CHANGED');
    });

    it('says a signal for an ECG', () => {
      expect(sourceKindOf(ecg({}))).toBe('signal');
    });
  });

  it('flags every cause at once, in a fixed order', () => {
    const before = heart({ lv: [4000, null], source: 'dicom', spacing: null });
    const after = heart({
      lv: [4400, null],
      sha: SHA_B,
      source: 'image',
      spacing: null,
    });

    expect(caveats(before, after, 'cardio-seg-mri')).toMatchObject({
      caveats: ['MODEL_CHANGED', 'NO_PIXEL_SPACING', 'SOURCE_CHANGED'],
      reliable: false,
    });
  });
});

describe('the result changing', () => {
  const labelChanged = (
    previous: TimelineRun,
    current: TimelineRun,
    pipeline: AiPipeline = 'brain',
  ) =>
    timeline(pipeline, [previous, current]).items[1].comparison?.labelChanged;

  it('is reported when the brain class changes, not when it stays', () => {
    const notumor = run({
      predictions: [{ label: 'notumor', probability: 0.95 }],
    });

    expect(labelChanged(run(), notumor)).toBe(true);
    expect(labelChanged(run(), run())).toBe(false);
  });

  it('is reported when the BreakHis result changes', () => {
    expect(
      labelChanged(
        breast(0.4, 'benign'),
        breast(0.7, 'malignant'),
        'pathology-breast',
      ),
    ).toBe(true);
    expect(
      labelChanged(
        breast(0.4, 'benign'),
        breast(0.45, 'benign'),
        'pathology-breast',
      ),
    ).toBe(false);
  });

  it('is reported when the set of ECG classes changes, whatever the order they are listed in', () => {
    expect(
      labelChanged(
        ecg({}, ['MI', 'STTC']),
        ecg({}, ['STTC', 'MI']),
        'cardio-ecg',
      ),
    ).toBe(false);
    expect(
      labelChanged(ecg({}, ['MI']), ecg({}, ['MI', 'CD']), 'cardio-ecg'),
    ).toBe(true);
    expect(labelChanged(ecg({}, []), ecg({}, ['NORM']), 'cardio-ecg')).toBe(
      true,
    );
  });
});
