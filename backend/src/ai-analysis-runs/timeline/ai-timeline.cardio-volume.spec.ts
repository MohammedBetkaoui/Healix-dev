import {
  CARDIO_VOLUME_WEIGHTS,
  cardioVolumeResult,
} from '../volumetry/cardio-volume.fixtures';
import { applyCorrection, buildVolumetry } from '../volumetry/volumetry';
import {
  buildAiTimeline,
  extractMeasures,
  MEASURES,
  sourceKindOf,
  TIMELINE_RUN_SELECT,
  toTimelineItem,
  type TimelineRun,
} from './ai-timeline';

const stored = (value: unknown) =>
  (value === undefined
    ? undefined
    : JSON.parse(JSON.stringify(value))) as never;

function volumeRun(
  id: string,
  createdAt: string,
  volumetry: unknown,
  overrides: Partial<TimelineRun> = {},
): TimelineRun {
  return {
    classificationModelId: null,
    classificationWeightsSha256: null,
    createdAt: new Date(createdAt),
    decisionLabel: null,
    decisionStatus: null,
    decisionThreshold: null,
    id,
    malignancyScore: null,
    maskAreaPx: null,
    maskAreaRatio: null,
    maskPath: '/uploads/patients/patient-a/ai-masks/run-volumetry',
    modelDecision: null,
    overlayPath: null,
    pipeline: 'cardio-volume-mri',
    predictions: { configSha256: 'b'.repeat(64) },
    segmentationModelId: 'cardio-seg-acdc-unet-effb4',
    segmentationWeightsSha256: CARDIO_VOLUME_WEIGHTS,
    slicePath: null,
    sourceDocument: {
      documentType: 'DICOM',
      mimeType: 'application/zip',
      originalName: 'serie-5-cine.zip',
    },
    sourceDocumentId: `document-${id}`,
    tracePath: null,
    volumetry: stored(volumetry),
    ...overrides,
  };
}

// LVEF 38 % (the default fixture), and one at 50 %.
const first = () => buildVolumetry(cardioVolumeResult());
const second = () =>
  buildVolumetry(cardioVolumeResult({ factors: [1, 0.5, 0.7, 0.8, 0.9] }));

describe('the measures of a cardiac cine volumetry over time', () => {
  it('lists the measures to follow, the ejection fraction first', () => {
    const measures = MEASURES['cardio-volume-mri'];
    expect(measures.map((measure) => [measure.key, measure.unit])).toEqual([
      ['lvEfPercent', 'percent'],
      ['lvEdvMl', 'ml'],
      ['lvEsvMl', 'ml'],
      ['lvSvMl', 'ml'],
      ['rvEfPercent', 'percent'],
      ['rvEdvMl', 'ml'],
      ['rvEsvMl', 'ml'],
      ['lvMassG', 'g'],
      ['cardiacOutputLMin', 'l_min'],
    ]);
    // Volumes do not depend on a pixel area comparison.
    expect(measures.every((measure) => !measure.area)).toBe(true);
  });

  it('reads the measures in force: the model, then the physician when they corrected', () => {
    const run = volumeRun('r1', '2026-10-01T08:00:00Z', first());
    const measures = extractMeasures(run);
    expect(measures.lvEfPercent).toBeCloseTo(38, 10);
    expect(measures.lvEdvMl).toBeCloseTo(43.2, 10);
    expect(measures.lvEsvMl).toBeCloseTo(26.784, 10);
    expect(measures.lvMassG).toBeCloseTo(34.02, 10);
    expect(measures.rvEfPercent).toBeCloseTo(19, 10);
    expect(measures.cardiacOutputLMin).toBeCloseTo(1.14912, 10);

    const corrected = extractMeasures(
      volumeRun(
        'r1',
        '2026-10-01T08:00:00Z',
        applyCorrection(first(), { esPhase: 1 }),
      ),
    );
    expect(corrected.lvEfPercent).toBeCloseTo(20, 10);
    expect(corrected.lvEsvMl).toBeCloseTo(34.56, 10);
  });

  it('has no cardiac output without a heart rate, and nothing for a run without volumetry', () => {
    const noRate = buildVolumetry(cardioVolumeResult({ heartRateBpm: null }));
    expect(
      extractMeasures(volumeRun('r1', '2026-10-01T08:00:00Z', noRate))
        .cardiacOutputLMin,
    ).toBeNull();

    for (const volumetry of [null, undefined, { version: 9 }]) {
      const measures = extractMeasures(
        volumeRun('r1', '2026-10-01T08:00:00Z', volumetry),
      );
      expect(Object.keys(measures)).toHaveLength(9);
      expect(Object.values(measures).every((value) => value === null)).toBe(
        true,
      );
    }
  });

  it('is a DICOM source whatever the archive is called, with the pixel spacing of the stack', () => {
    const run = volumeRun('r1', '2026-10-01T08:00:00Z', first(), {
      sourceDocument: {
        documentType: 'MEDICAL_REPORT',
        mimeType: 'application/zip',
        originalName: 'export.zip',
      },
    });
    expect(sourceKindOf(run)).toBe('dicom');
    expect(toTimelineItem(run)).toMatchObject({
      hasMask: true,
      pixelSpacingMm: [1.5, 1.5],
      source: 'dicom',
    });
  });

  it('compares two studies: the difference in ml and in %, reliable with the same weights', () => {
    const timeline = buildAiTimeline('patient-a', 'cardio-volume-mri', [
      // Out of order: the line is oldest first.
      volumeRun('later', '2026-10-20T08:00:00Z', second()),
      volumeRun('earlier', '2026-10-01T08:00:00Z', first()),
    ]);

    expect(timeline.primaryMeasure).toBe('lvEfPercent');
    expect(timeline.items.map((item) => item.runId)).toEqual([
      'earlier',
      'later',
    ]);
    expect(timeline.items[0].comparison).toBeNull();
    const { comparison } = timeline.items[1];
    expect(comparison).toMatchObject({
      caveats: [],
      previousRunId: 'earlier',
      reliable: true,
    });
    expect(comparison?.deltas.lvEfPercent).toEqual({
      percent: 31.58,
      value: 12,
    });
    // The volume at ED is the same stack: no change.
    expect(comparison?.deltas.lvEdvMl).toEqual({ percent: 0, value: 0 });
  });

  it('flags a comparison across two versions of the model', () => {
    const timeline = buildAiTimeline('patient-a', 'cardio-volume-mri', [
      volumeRun('earlier', '2026-10-01T08:00:00Z', first()),
      volumeRun('later', '2026-10-20T08:00:00Z', second(), {
        segmentationWeightsSha256: 'f'.repeat(64),
      }),
    ]);
    expect(timeline.items[1].comparison).toMatchObject({
      caveats: ['MODEL_CHANGED'],
      reliable: false,
    });
  });

  it('is read with the volumetry column', () => {
    expect(TIMELINE_RUN_SELECT.volumetry).toBe(true);
  });
});
