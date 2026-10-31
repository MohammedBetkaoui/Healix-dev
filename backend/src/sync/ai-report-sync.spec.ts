import { AiRunDecision, type Prisma } from '@prisma/client';

import {
  AI_REPORTS_PER_PATIENT,
  type AiReportRun,
  aiReportRunSelect,
  keepMostRecentPerPatient,
  toAiReportSyncPayload,
  topPredictionsOf,
} from './ai-report-sync';

const SHA = 'abcdef0123456789'.repeat(4);

// A decided run as the select returns it. Every column the whitelist must keep
// off a device is also filled in "as stored" by `withForbidden`.
const baseRun = (overrides: Partial<AiReportRun> = {}): AiReportRun => ({
  id: 'run-1',
  patientId: 'patient-1',
  pipeline: 'brain',
  createdAt: new Date('2026-10-28T09:00:00.000Z'),
  decidedAt: new Date('2026-10-28T09:30:00.000Z'),
  decisionStatus: AiRunDecision.VALIDATED,
  decisionLabel: 'glioma',
  decisionLabels: null,
  clinicianImpression: 'Lésion compatible avec un gliome.',
  modelDecision: null,
  predictions: [
    { label: 'meningioma', probability: 0.05 },
    { label: 'glioma', probability: 0.9 },
    { label: 'pituitary', probability: 0.03 },
    { label: 'notumor', probability: 0.02 },
  ],
  malignancyScore: null,
  decisionThreshold: null,
  magnification: null,
  maskAreaRatio: 0.042,
  volumetry: null,
  classificationModelId: 'brain-effnet',
  classificationWeightsSha256: SHA,
  segmentationModelId: null,
  segmentationWeightsSha256: null,
  decidedBy: { fullName: 'Dr Démonstration' },
  report: { reportNumber: 'CR-IA-2026-000123', sha256: '9'.repeat(64) },
  ...overrides,
});

// Columns of AiAnalysisRun that must never reach a device, set on an object
// that looks like the full row: the payload is built from the select, and this
// proves a value that slipped into the row still does not come out.
const withForbidden = (run: AiReportRun): AiReportRun =>
  ({
    ...run,
    maskPath: 'patients/p1/ai-masks/run-1.png',
    overlayPath: 'patients/p1/ai-masks/run-1-overlay.png',
    tracePath: 'patients/p1/ai-traces/run-1.json',
    slicePath: 'patients/p1/ai-slices/run-1.png',
    sourceDocumentId: 'document-1',
    ttaScores: [0.1, 0.2, 0.3, 0.4],
    nucleiFractions: { neoplastic: 0.4 },
    decisionReason: 'Image de mauvaise qualité',
    requestedById: 'user-1',
    errorCode: null,
  }) as unknown as AiReportRun;

const FORBIDDEN_KEYS = [
  'ttaScores',
  'nucleiFractions',
  'predictions',
  'decisionReason',
  'sourceDocumentId',
  'requestedById',
  'storageKey',
  'segmentationSkippedReason',
];

// Every key of the answer, however deep.
function allKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, into);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      allKeys(child, into);
    }
  }
  return into;
}

const volumetry = (corrected: unknown = null) => ({
  version: 1,
  phases: 25,
  slices: [{ positionMm: 0, stepMm: null }],
  sliceGapMm: 8,
  sliceOrderInferred: false,
  phaseTimesMs: null,
  pixelSpacingMm: [1.3, 1.3],
  areasMm2: [],
  bsaM2: 1.9,
  heartRateBpm: 70,
  warnings: [],
  images: { edPhase: 0, esPhase: 10, slices: 6 },
  auto: {
    edPhase: 0,
    esPhase: 10,
    lvVolumeCurveMl: [],
    measures: {
      edPhase: 0,
      esPhase: 10,
      excludedSlices: [],
      lv: { edvMl: 140, esvMl: 67.2, svMl: 72.8, efPercent: 52 },
      rv: { edvMl: 150, esvMl: 70, svMl: 80, efPercent: 53.3 },
      lvMassG: 118,
      cardiacOutputLMin: 5.1,
      heartRateBpm: 70,
      bsaM2: 1.9,
      indexed: {
        lvEdvMlM2: 73.7,
        lvEsvMlM2: 35.4,
        lvSvMlM2: 38.3,
        rvEdvMlM2: 78.9,
        rvEsvMlM2: 36.8,
        lvMassGM2: 62.1,
        cardiacIndexLMinM2: 2.7,
      },
      lvefClass: 'preserved',
      warnings: [],
    },
  },
  corrected,
});

describe('toAiReportSyncPayload (the whitelist)', () => {
  it('contains the identity, the decision, the model answer and the traceability, and nothing else', () => {
    const payload = toAiReportSyncPayload(baseRun());
    expect(Object.keys(payload).sort()).toEqual(
      [
        'classificationModelId',
        'classificationWeightsSha12',
        'clinicianImpression',
        'createdAt',
        'decidedAt',
        'decidedByName',
        'decisionLabel',
        'decisionLabels',
        'decisionStatus',
        'measures',
        'moduleLabel',
        'modelDecision',
        'modelLabels',
        'patientId',
        'pipeline',
        'reportNumber',
        'reportSha256',
        'runId',
        'segmentationModelId',
        'segmentationWeightsSha12',
        'topPredictions',
      ].sort(),
    );
    expect(payload).toMatchObject({
      runId: 'run-1',
      patientId: 'patient-1',
      pipeline: 'brain',
      moduleLabel: 'IRM cérébrale',
      decisionStatus: 'VALIDATED',
      decisionLabel: 'glioma',
      clinicianImpression: 'Lésion compatible avec un gliome.',
      decidedByName: 'Dr Démonstration',
      reportNumber: 'CR-IA-2026-000123',
      classificationModelId: 'brain-effnet',
    });
  });

  it('never carries a path, a storage key or any forbidden column, even when the row has them', () => {
    const keys = allKeys(toAiReportSyncPayload(withForbidden(baseRun())));
    const paths = [...keys].filter((key) => key.endsWith('Path'));
    expect(paths).toEqual([]);
    expect([...keys].filter((key) => FORBIDDEN_KEYS.includes(key))).toEqual([]);
    const text = JSON.stringify(
      toAiReportSyncPayload(withForbidden(baseRun())),
    );
    expect(text).not.toContain('ai-masks');
    expect(text).not.toContain('Image de mauvaise qualité');
  });

  it('applies the same rule to every pipeline', () => {
    for (const pipeline of [
      'brain',
      'pathology-breast',
      'pathology-nuclei',
      'cardio-ecg',
      'cardio-seg-mri',
      'cardio-volume-mri',
    ]) {
      const keys = allKeys(
        toAiReportSyncPayload(
          withForbidden(
            baseRun({
              pipeline,
              volumetry:
                pipeline === 'cardio-volume-mri'
                  ? (volumetry() as unknown as Prisma.JsonValue)
                  : null,
            }),
          ),
        ),
      );
      expect([...keys].filter((key) => key.endsWith('Path'))).toEqual([]);
      expect([...keys].filter((key) => FORBIDDEN_KEYS.includes(key))).toEqual(
        [],
      );
    }
  });

  it('reduces the SHA-256 of the weights to its first 12 characters', () => {
    const payload = toAiReportSyncPayload(
      baseRun({
        segmentationModelId: 'seg-unet',
        segmentationWeightsSha256: 'f'.repeat(64),
      }),
    );
    expect(payload.classificationWeightsSha12).toBe(SHA.slice(0, 12));
    expect(payload.classificationWeightsSha12).toHaveLength(12);
    expect(payload.segmentationWeightsSha12).toBe('ffffffffffff');
    expect(JSON.stringify(payload)).not.toContain(SHA);
  });

  it('has no report number or hash for an analysis without a report', () => {
    const payload = toAiReportSyncPayload(baseRun({ report: null }));
    expect(payload.reportNumber).toBeNull();
    expect(payload.reportSha256).toBeNull();
  });

  it('reports a correction as CORRECTED, with the decided label', () => {
    const payload = toAiReportSyncPayload(
      baseRun({
        decisionStatus: AiRunDecision.CORRECTED,
        decisionLabel: 'meningioma',
      }),
    );
    expect(payload.decisionStatus).toBe('CORRECTED');
    expect(payload.decisionLabel).toBe('meningioma');
  });
});

describe('the model proposal', () => {
  it('keeps the 3 most likely predictions, most likely first', () => {
    const payload = toAiReportSyncPayload(baseRun());
    expect(payload.topPredictions).toEqual([
      { label: 'glioma', probability: 0.9 },
      { label: 'meningioma', probability: 0.05 },
      { label: 'pituitary', probability: 0.03 },
    ]);
    expect(payload.modelDecision).toBe('glioma');
  });

  it('reads an ECG as per-class probabilities and the classes above their thresholds', () => {
    const payload = toAiReportSyncPayload(
      baseRun({
        pipeline: 'cardio-ecg',
        decisionLabel: null,
        decisionLabels: ['MI', 'STTC'],
        predictions: {
          probabilities: { NORM: 0.01, MI: 0.8, STTC: 0.6, CD: 0.1, HYP: 0.2 },
          positive: ['MI', 'STTC'],
          thresholds: { NORM: 0.5 },
          windows: 3,
        },
      }),
    );
    expect(payload.decisionLabels).toEqual(['MI', 'STTC']);
    expect(payload.modelLabels).toEqual(['MI', 'STTC']);
    expect(payload.topPredictions.map((p) => p.label)).toEqual([
      'MI',
      'STTC',
      'HYP',
    ]);
    // The thresholds and windows of the raw output stay behind.
    expect(allKeys(payload).has('thresholds')).toBe(false);
    expect(allKeys(payload).has('windows')).toBe(false);
  });

  it('has no prediction for a pipeline that does not classify', () => {
    expect(
      topPredictionsOf('pathology-nuclei', [{ label: 'x', probability: 1 }]),
    ).toEqual([]);
    expect(topPredictionsOf('brain', null)).toEqual([]);
    expect(
      topPredictionsOf('brain', [{ label: 'x' }, { probability: 1 }]),
    ).toEqual([]);
  });
});

describe('the measures of each pipeline', () => {
  it('pathology: the score, the threshold and the magnification', () => {
    const payload = toAiReportSyncPayload(
      baseRun({
        pipeline: 'pathology-breast',
        modelDecision: 'malignant',
        decisionLabel: 'benign',
        decisionStatus: AiRunDecision.CORRECTED,
        predictions: null,
        malignancyScore: 0.71,
        decisionThreshold: 0.5,
        magnification: 200,
        maskAreaRatio: null,
      }),
    );
    expect(payload.measures).toEqual({
      malignancyScore: 0.71,
      decisionThreshold: 0.5,
      magnification: 200,
    });
    expect(payload.modelDecision).toBe('malignant');
    expect(payload.topPredictions).toEqual([]);
  });

  it('segmentation: the share of the image covered', () => {
    expect(toAiReportSyncPayload(baseRun()).measures).toEqual({
      maskAreaRatio: 0.042,
    });
    expect(
      toAiReportSyncPayload(
        baseRun({
          pipeline: 'pathology-nuclei',
          magnification: 40,
          maskAreaRatio: 0.3,
        }),
      ).measures,
    ).toEqual({ maskAreaRatio: 0.3, magnification: 40 });
  });

  it('volumetry: the ejection fractions, volumes, mass and indexed values', () => {
    const payload = toAiReportSyncPayload(
      baseRun({
        pipeline: 'cardio-volume-mri',
        predictions: null,
        maskAreaRatio: null,
        volumetry: volumetry() as unknown as Prisma.JsonValue,
      }),
    );
    expect(payload.measures).toEqual({
      lvef: 52,
      rvef: 53.3,
      lvedv: 140,
      lvesv: 67.2,
      lvMass: 118,
      lvedvIndexed: 73.7,
      lvesvIndexed: 35.4,
      rvedvIndexed: 78.9,
      rvesvIndexed: 36.8,
      lvMassIndexed: 62.1,
    });
    // The areas, the curve and the slice geometry are not part of it.
    expect(allKeys(payload).has('areasMm2')).toBe(false);
    expect(allKeys(payload).has('lvVolumeCurveMl')).toBe(false);
  });

  it("volumetry: the values in force are the physician's, not the model's", () => {
    const auto = volumetry().auto;
    const corrected = {
      ...auto,
      measures: {
        ...auto.measures,
        lv: { edvMl: 150, esvMl: 90, svMl: 60, efPercent: 40 },
      },
      bsaM2: null,
      bsaSource: null,
      lvVolumeCurveMl: [],
    };
    const payload = toAiReportSyncPayload(
      baseRun({
        pipeline: 'cardio-volume-mri',
        volumetry: volumetry(corrected) as unknown as Prisma.JsonValue,
      }),
    );
    expect(payload.measures.lvef).toBe(40);
    expect(payload.measures.lvedv).toBe(150);
  });

  it('volumetry: no indexed values when no body surface was known', () => {
    const base = volumetry();
    const withoutBsa = {
      ...base,
      auto: {
        ...base.auto,
        measures: { ...base.auto.measures, indexed: null },
      },
    };
    const payload = toAiReportSyncPayload(
      baseRun({
        pipeline: 'cardio-volume-mri',
        volumetry: withoutBsa as unknown as Prisma.JsonValue,
      }),
    );
    expect(payload.measures.lvef).toBe(52);
    expect(payload.measures.lvedvIndexed).toBeNull();
    expect(payload.measures.lvMassIndexed).toBeNull();
  });

  it('a volumetry that cannot be read gives no measure rather than a wrong one', () => {
    const payload = toAiReportSyncPayload(
      baseRun({
        pipeline: 'cardio-volume-mri',
        volumetry: { version: 99 } as unknown as Prisma.JsonValue,
      }),
    );
    expect(payload.measures).toEqual({});
  });
});

describe('the select', () => {
  it('asks for no path, no storage key and no raw model output beyond what the payload keeps', () => {
    const asked = Object.keys(aiReportRunSelect);
    expect(asked.filter((key) => key.endsWith('Path'))).toEqual([]);
    for (const forbidden of [
      'ttaScores',
      'nucleiFractions',
      'decisionReason',
      'sourceDocumentId',
      'requestedById',
      'errorCode',
    ]) {
      expect(asked).not.toContain(forbidden);
    }
    expect(aiReportRunSelect.report.select).toEqual({
      reportNumber: true,
      sha256: true,
    });
    expect(aiReportRunSelect.decidedBy.select).toEqual({ fullName: true });
  });
});

describe('keepMostRecentPerPatient', () => {
  it('keeps the first 20 of each patient and the order of the input', () => {
    const rows = [
      ...Array.from({ length: 25 }, (_, index) => ({
        id: `a${index}`,
        patientId: 'patient-a',
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        id: `b${index}`,
        patientId: 'patient-b',
      })),
    ];
    const kept = keepMostRecentPerPatient(rows);
    expect(kept.filter((row) => row.patientId === 'patient-a')).toHaveLength(
      AI_REPORTS_PER_PATIENT,
    );
    expect(kept.filter((row) => row.patientId === 'patient-b')).toHaveLength(3);
    // The most recent ones (first in the input) are those kept.
    expect(kept.map((row) => row.id).slice(0, 20)).toEqual(
      rows.slice(0, 20).map((row) => row.id),
    );
    expect(kept.some((row) => row.id === 'a20')).toBe(false);
  });

  it('interleaves patients without letting one starve another', () => {
    const rows = [
      { id: '1', patientId: 'a' },
      { id: '2', patientId: 'b' },
      { id: '3', patientId: 'a' },
      { id: '4', patientId: 'b' },
    ];
    expect(keepMostRecentPerPatient(rows, 1).map((row) => row.id)).toEqual([
      '1',
      '2',
    ]);
  });
});
