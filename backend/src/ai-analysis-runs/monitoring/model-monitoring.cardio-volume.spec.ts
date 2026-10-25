import { AiAnalysisRunStatus, AiRunDecision } from '@prisma/client';

import { buildModelMonitoring, type MonitoringRun } from './model-monitoring';

const MODEL = 'cardio-seg-acdc-unet-effb4';

// A decided cine volumetry: the physician validated the measures, corrected
// them (ED, ES, slices), or rejected the run.
function volumeRun(
  month: string,
  decisionStatus: AiRunDecision | null,
  overrides: Partial<MonitoringRun> = {},
): MonitoringRun {
  const createdAt = new Date(`${month}-10T10:00:00Z`);
  return {
    classificationModelId: null,
    createdAt,
    decidedAt: decisionStatus ? new Date(createdAt.getTime() + 600_000) : null,
    decisionLabel: null,
    decisionStatus,
    durationMs: 31_000,
    modelDecision: null,
    pipeline: 'cardio-volume-mri',
    predictions: { configSha256: 'b'.repeat(64) },
    segmentationModelId: MODEL,
    status: AiAnalysisRunStatus.SUCCEEDED,
    ...overrides,
  };
}

const window = {
  firstMonth: '2026-08',
  lastMonth: '2026-10',
  to: new Date('2026-10-25T12:00:00Z'),
};

describe('the monitoring of the cardiac cine volumetry', () => {
  it('judges the model by how often the physicians correct its measures', () => {
    const runs = [
      volumeRun('2026-10', AiRunDecision.VALIDATED),
      volumeRun('2026-10', AiRunDecision.VALIDATED),
      volumeRun('2026-10', AiRunDecision.VALIDATED),
      volumeRun('2026-10', AiRunDecision.CORRECTED),
      volumeRun('2026-10', AiRunDecision.REJECTED),
      volumeRun('2026-10', null),
    ];

    const { models } = buildModelMonitoring(runs, window);

    expect(models).toHaveLength(1);
    const [entry] = models;
    expect(entry).toMatchObject({
      // Measures, not a map to review: they can be corrected.
      correctionApplicable: true,
      // No class to cross: no confusion matrix.
      matrix: null,
      modelId: MODEL,
      pipeline: 'cardio-volume-mri',
    });
    expect(entry.months[0]).toMatchObject({
      corrected: 1,
      correctionRate: 0.25,
      decided: 5,
      month: '2026-10',
      rejected: 1,
      runs: 6,
      validated: 3,
    });
    expect(entry.months[0].medianInferenceMs).toBe(31_000);
    expect(entry.months[0].medianDecisionMs).toBe(600_000);
  });

  it('keeps its own entry next to the single-slice segmentation, which has the same model', () => {
    const segmentation = volumeRun('2026-10', AiRunDecision.VALIDATED, {
      pipeline: 'cardio-seg-mri',
    });
    const { models } = buildModelMonitoring(
      [volumeRun('2026-10', AiRunDecision.CORRECTED), segmentation],
      window,
    );

    expect(models.map((entry) => entry.pipeline)).toEqual([
      'cardio-seg-mri',
      'cardio-volume-mri',
    ]);
    // A segmentation map is validated or rejected; the volumetry can be corrected.
    expect(models.map((entry) => entry.correctionApplicable)).toEqual([
      false,
      true,
    ]);
  });

  it('raises an alert when the physicians start correcting much more than before', () => {
    const baseline = ['2026-07', '2026-08', '2026-09'].flatMap((month) =>
      Array.from({ length: 10 }, (_, index) =>
        volumeRun(
          month,
          index === 0 ? AiRunDecision.CORRECTED : AiRunDecision.VALIDATED,
        ),
      ),
    );
    // 20 decisions this month at least are needed to speak of a drift.
    const now = Array.from({ length: 20 }, (_, index) =>
      volumeRun(
        '2026-10',
        index < 10 ? AiRunDecision.CORRECTED : AiRunDecision.VALIDATED,
      ),
    );

    const { models } = buildModelMonitoring([...baseline, ...now], window);

    expect(models[0].alert).toMatchObject({
      baselineRate: 0.1,
      month: '2026-10',
      rate: 0.5,
    });
  });

  it('puts a run that failed before the model answered with the model of the chain', () => {
    const { models } = buildModelMonitoring(
      [
        volumeRun('2026-10', AiRunDecision.VALIDATED),
        volumeRun('2026-10', null, {
          segmentationModelId: null,
          status: AiAnalysisRunStatus.REJECTED_INPUT,
        }),
      ],
      window,
    );
    expect(models).toHaveLength(1);
    expect(models[0].months[0]).toMatchObject({ rejectedInput: 1, runs: 2 });
  });
});
