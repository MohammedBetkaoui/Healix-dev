import {
  buildModelMonitoring,
  DEFAULT_MONITORING_MONTHS,
  DRIFT_MIN_DECISIONS,
  MAX_MONITORING_MONTHS,
  median,
  type ModelMonitoringEntry,
  type MonitoringRun,
  monthKeyOf,
  monthStart,
  resolveMonitoringWindow,
  shiftMonth,
} from './model-monitoring';

const BRAIN_MODEL = 'brain-efficientnetb4-tumor-classification';
const NOW = new Date('2026-10-24T10:00:00.000Z');

// A run on the 10th of a month (Algiers noon-ish, far from the boundaries).
const at = (month: string, day = 10) =>
  new Date(`${month}-${String(day).padStart(2, '0')}T10:00:00.000Z`);

const predictionsOf = (label: string) => [
  { label, probability: 0.95 },
  { label: label === 'glioma' ? 'notumor' : 'glioma', probability: 0.05 },
];

function run(overrides: Partial<MonitoringRun> = {}): MonitoringRun {
  return {
    classificationModelId: BRAIN_MODEL,
    createdAt: at('2026-10'),
    decidedAt: null,
    decisionLabel: null,
    decisionStatus: null,
    durationMs: null,
    modelDecision: null,
    pipeline: 'brain',
    predictions: predictionsOf('glioma'),
    segmentationModelId: null,
    status: 'SUCCEEDED',
    ...overrides,
  };
}

// `judged` decisions on a class in a month, `corrected` of them corrected.
function decisions(
  month: string,
  judged: number,
  corrected: number,
  overrides: Partial<MonitoringRun> = {},
) {
  return Array.from({ length: judged }, (_, index) =>
    run({
      createdAt: at(month),
      decidedAt: new Date(at(month).getTime() + 60_000),
      decisionLabel: index < corrected ? 'notumor' : 'glioma',
      decisionStatus: index < corrected ? 'CORRECTED' : 'VALIDATED',
      ...overrides,
    }),
  );
}

const window = (firstMonth: string, lastMonth = firstMonth) => ({
  firstMonth,
  lastMonth,
  to: new Date('2026-12-31T22:00:00.000Z'),
});

const only = (entries: ModelMonitoringEntry[]) => {
  expect(entries).toHaveLength(1);
  return entries[0];
};

describe('the months of the board, in Algiers', () => {
  it.each([
    ['2026-09-30T22:59:59.999Z', '2026-09'],
    // Midnight of the 1st in Algiers (UTC+1) is 23:00 UTC the day before.
    ['2026-09-30T23:00:00.000Z', '2026-10'],
    ['2026-10-15T12:00:00.000Z', '2026-10'],
    ['2026-10-31T22:59:59.999Z', '2026-10'],
    ['2026-10-31T23:00:00.000Z', '2026-11'],
    ['2026-12-31T23:30:00.000Z', '2027-01'],
  ])('puts %s in %s', (instant, month) => {
    expect(monthKeyOf(new Date(instant))).toBe(month);
  });

  it('starts a month at midnight of its 1st in Algiers', () => {
    expect(monthStart('2026-10').toISOString()).toBe(
      '2026-09-30T23:00:00.000Z',
    );
    expect(monthStart('2027-01').toISOString()).toBe(
      '2026-12-31T23:00:00.000Z',
    );
  });

  it('shifts across the year', () => {
    expect(shiftMonth('2026-02', -3)).toBe('2025-11');
    expect(shiftMonth('2026-11', 3)).toBe('2027-02');
  });
});

describe('resolveMonitoringWindow', () => {
  it('defaults to the twelve months up to now, and reads three more before them', () => {
    const resolved = resolveMonitoringWindow({}, NOW);

    expect(resolved).toMatchObject({
      firstMonth: '2025-11',
      lastMonth: '2026-10',
      to: NOW,
    });
    expect(DEFAULT_MONITORING_MONTHS).toBe(12);
    expect((resolved as { fetchFrom: Date }).fetchFrom.toISOString()).toBe(
      monthStart('2025-08').toISOString(),
    );
  });

  it('rounds from down to the start of its month', () => {
    const resolved = resolveMonitoringWindow(
      {
        from: new Date('2026-05-20T10:00:00.000Z'),
        to: new Date('2026-08-02T10:00:00.000Z'),
      },
      NOW,
    );

    expect(resolved).toMatchObject({
      firstMonth: '2026-05',
      lastMonth: '2026-08',
    });
  });

  it('refuses a period that ends before it starts', () => {
    expect(
      resolveMonitoringWindow(
        {
          from: new Date('2026-09-01T00:00:00Z'),
          to: new Date('2026-08-01T00:00:00Z'),
        },
        NOW,
      ),
    ).toBe('INVALID_PERIOD');
  });

  it(`serves ${MAX_MONITORING_MONTHS} months and refuses a month more`, () => {
    const to = new Date('2026-10-20T00:00:00Z');

    expect(
      resolveMonitoringWindow(
        { from: new Date('2024-11-02T00:00:00Z'), to },
        NOW,
      ),
    ).toMatchObject({ firstMonth: '2024-11' });
    expect(
      resolveMonitoringWindow(
        { from: new Date('2024-10-02T00:00:00Z'), to },
        NOW,
      ),
    ).toBe('PERIOD_TOO_LONG');
  });
});

describe('median', () => {
  it('takes the middle value, or the mean of the two middle ones', () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 20, 30, 50])).toBe(25);
    expect(median([7])).toBe(7);
    expect(median([])).toBeNull();
  });

  it('is not moved by one very slow value', () => {
    expect(median([100, 110, 120, 130, 9_000_000])).toBe(120);
  });
});

describe('buildModelMonitoring', () => {
  it('counts the runs of a month by outcome and by decision', () => {
    const board = buildModelMonitoring(
      [
        run({
          status: 'SUCCEEDED',
          decisionStatus: 'VALIDATED',
          decisionLabel: 'glioma',
          decidedAt: at('2026-10', 11),
        }),
        run({
          status: 'SUCCEEDED',
          decisionStatus: 'CORRECTED',
          decisionLabel: 'notumor',
          decidedAt: at('2026-10', 11),
        }),
        run({
          status: 'SUCCEEDED',
          decisionStatus: 'REJECTED',
          decidedAt: at('2026-10', 11),
        }),
        run({ status: 'SUCCEEDED' }),
        run({ status: 'FAILED' }),
        run({ status: 'REJECTED_INPUT' }),
        run({ status: 'RUNNING' }),
      ],
      window('2026-10'),
    );

    expect(only(board.models).months).toEqual([
      expect.objectContaining({
        corrected: 1,
        decided: 3,
        failed: 1,
        month: '2026-10',
        rejected: 1,
        rejectedInput: 1,
        runs: 7,
        succeeded: 4,
        validated: 1,
      }),
    ]);
  });

  it('measures the correction rate among the decisions on a class: a rejected analysis is no correction', () => {
    const board = buildModelMonitoring(
      [
        ...decisions('2026-10', 8, 2),
        run({ decisionStatus: 'REJECTED', decidedAt: at('2026-10', 11) }),
        run({ decisionStatus: 'REJECTED', decidedAt: at('2026-10', 11) }),
      ],
      window('2026-10'),
    );

    // 2 corrected out of 8 decisions on a class (6 validated + 2 corrected).
    expect(only(board.models).months[0]).toMatchObject({
      corrected: 2,
      correctionRate: 0.25,
      decided: 10,
      rejected: 2,
    });
  });

  it('has no correction rate without any decision on a class', () => {
    const board = buildModelMonitoring(
      [
        run(),
        run({ decisionStatus: 'REJECTED', decidedAt: at('2026-10', 11) }),
      ],
      window('2026-10'),
    );

    expect(only(board.models).months[0].correctionRate).toBeNull();
  });

  it('gives the median delay of the decision and the median duration of the inference', () => {
    const created = at('2026-10');
    const board = buildModelMonitoring(
      [
        run({
          createdAt: created,
          decidedAt: new Date(created.getTime() + 60_000),
          decisionStatus: 'VALIDATED',
          decisionLabel: 'glioma',
          durationMs: 1_000,
        }),
        run({
          createdAt: created,
          decidedAt: new Date(created.getTime() + 600_000),
          decisionStatus: 'VALIDATED',
          decisionLabel: 'glioma',
          durationMs: 3_000,
        }),
        run({
          createdAt: created,
          decidedAt: new Date(created.getTime() + 3_600_000),
          decisionStatus: 'CORRECTED',
          decisionLabel: 'notumor',
          durationMs: 2_000,
        }),
        run({ createdAt: created, durationMs: null }),
      ],
      window('2026-10'),
    );

    expect(only(board.models).months[0]).toMatchObject({
      medianDecisionMs: 600_000,
      medianInferenceMs: 2_000,
    });
  });

  it('puts a run in the month it was made, in Algiers', () => {
    const board = buildModelMonitoring(
      [
        run({ createdAt: new Date('2026-09-30T22:30:00.000Z') }),
        run({ createdAt: new Date('2026-09-30T23:30:00.000Z') }),
        run({ createdAt: new Date('2026-10-31T23:30:00.000Z') }),
      ],
      window('2026-09', '2026-11'),
    );

    expect(only(board.models).months.map((m) => [m.month, m.runs])).toEqual([
      ['2026-09', 1],
      ['2026-10', 1],
      ['2026-11', 1],
    ]);
  });

  it('shows only the months asked for, and only months with runs, oldest first', () => {
    const board = buildModelMonitoring(
      [
        run({ createdAt: at('2026-10') }),
        run({ createdAt: at('2026-05') }),
        run({ createdAt: at('2026-08') }),
        run({ createdAt: at('2026-03') }),
      ],
      window('2026-05', '2026-10'),
    );

    expect(only(board.models).months.map((m) => m.month)).toEqual([
      '2026-05',
      '2026-08',
      '2026-10',
    ]);
  });

  it('keeps apart each chain and each model, the chains in their usual order', () => {
    const board = buildModelMonitoring(
      [
        run({
          classificationModelId: 'cardio-ecg-model',
          pipeline: 'cardio-ecg',
          predictions: { positive: [] },
        }),
        run({ classificationModelId: 'brain-model-2' }),
        run({ classificationModelId: 'brain-model-1' }),
        run({
          classificationModelId: null,
          pipeline: 'pathology-nuclei',
          segmentationModelId: 'nuclei-model',
        }),
        run({ classificationModelId: 'brain-model-1' }),
      ],
      window('2026-10'),
    );

    expect(
      board.models.map((m) => [m.pipeline, m.modelId, m.months[0].runs]),
    ).toEqual([
      ['brain', 'brain-model-1', 2],
      ['brain', 'brain-model-2', 1],
      ['pathology-nuclei', 'nuclei-model', 1],
      ['cardio-ecg', 'cardio-ecg-model', 1],
    ]);
  });

  it('judges a routed brain run on its classifier, whatever segmenter followed', () => {
    const board = buildModelMonitoring(
      [
        run({ segmentationModelId: 'brain-unet-meningioma-segmentation' }),
        run({ segmentationModelId: null }),
        run({ segmentationModelId: 'brain-unet-pituitary-segmentation' }),
      ],
      window('2026-10'),
    );

    expect(only(board.models)).toMatchObject({ modelId: BRAIN_MODEL });
    expect(only(board.models).months[0].runs).toBe(3);
  });

  describe('runs that failed before any model answered', () => {
    it("go to the chain's model when it has one only", () => {
      const board = buildModelMonitoring(
        [
          run(),
          run({ classificationModelId: null, status: 'FAILED' }),
          run({ classificationModelId: null, status: 'REJECTED_INPUT' }),
        ],
        window('2026-10'),
      );

      expect(only(board.models).months[0]).toMatchObject({
        failed: 1,
        rejectedInput: 1,
        runs: 3,
      });
      expect(only(board.models).modelId).toBe(BRAIN_MODEL);
    });

    it('stay apart when the chain has several models', () => {
      const board = buildModelMonitoring(
        [
          run({ classificationModelId: 'brain-a' }),
          run({ classificationModelId: 'brain-b' }),
          run({ classificationModelId: null, status: 'FAILED' }),
        ],
        window('2026-10'),
      );

      expect(board.models.map((m) => [m.modelId, m.months[0].runs])).toEqual([
        [null, 1],
        ['brain-a', 1],
        ['brain-b', 1],
      ]);
    });
  });

  describe('the model → physician matrix', () => {
    it('crosses what the brain model said with the class the physician kept', () => {
      const board = buildModelMonitoring(
        [
          run({ decisionLabel: 'glioma', decisionStatus: 'VALIDATED' }),
          run({ decisionLabel: 'glioma', decisionStatus: 'VALIDATED' }),
          run({ decisionLabel: 'notumor', decisionStatus: 'CORRECTED' }),
          run({ decisionLabel: 'other', decisionStatus: 'CORRECTED' }),
          run({ decisionStatus: 'REJECTED' }),
          run({ decisionStatus: null }),
        ],
        window('2026-10'),
      );
      const matrix = only(board.models).matrix!;
      const cell = (model: string, kept: string) =>
        matrix.counts[matrix.modelLabels.indexOf(model)][
          matrix.retainedLabels.indexOf(kept)
        ];

      expect(matrix.modelLabels).toEqual([
        'glioma',
        'meningioma',
        'notumor',
        'pituitary',
      ]);
      expect(matrix.retainedLabels).toEqual([...matrix.modelLabels, 'other']);
      expect(cell('glioma', 'glioma')).toBe(2);
      expect(cell('glioma', 'notumor')).toBe(1);
      expect(cell('glioma', 'other')).toBe(1);
      // A rejection and a pending run are not in it: 4 decisions on a class.
      expect(matrix.counts.flat().reduce((a, b) => a + b, 0)).toBe(4);
    });

    it('reads the BreakHis result for the breast chain', () => {
      const board = buildModelMonitoring(
        [
          run({
            classificationModelId: 'breast',
            decisionLabel: 'malignant',
            decisionStatus: 'VALIDATED',
            modelDecision: 'malignant',
            pipeline: 'pathology-breast',
            predictions: null,
          }),
          run({
            classificationModelId: 'breast',
            decisionLabel: 'benign',
            decisionStatus: 'CORRECTED',
            modelDecision: 'malignant',
            pipeline: 'pathology-breast',
            predictions: null,
          }),
        ],
        window('2026-10'),
      );
      const matrix = only(board.models).matrix!;

      expect(matrix.modelLabels).toEqual(['benign', 'malignant']);
      expect(matrix.counts[matrix.modelLabels.indexOf('malignant')]).toEqual([
        1, 1, 0,
      ]);
    });

    it('counts the months shown only', () => {
      const board = buildModelMonitoring(
        [...decisions('2026-08', 5, 0), ...decisions('2026-10', 3, 0)],
        window('2026-10'),
      );

      expect(
        only(board.models)
          .matrix!.counts.flat()
          .reduce((a, b) => a + b, 0),
      ).toBe(3);
    });

    it('has none for the multi-label ECG and for the segmentation maps', () => {
      const board = buildModelMonitoring(
        [
          run({
            classificationModelId: 'ecg',
            pipeline: 'cardio-ecg',
            predictions: { positive: ['NORM'] },
          }),
          run({
            classificationModelId: null,
            pipeline: 'cardio-seg-mri',
            segmentationModelId: 'mri',
          }),
        ],
        window('2026-10'),
      );

      expect(board.models.map((m) => [m.pipeline, m.matrix])).toEqual([
        ['cardio-ecg', null],
        ['cardio-seg-mri', null],
      ]);
    });
  });

  describe('a segmentation map', () => {
    it('is validated or rejected, never corrected: no correction rate, no drift', () => {
      const maps = (month: string, validated: number, rejected: number) => [
        ...Array.from({ length: validated }, () =>
          run({
            classificationModelId: null,
            createdAt: at(month),
            decisionStatus: 'VALIDATED',
            pipeline: 'pathology-nuclei',
            segmentationModelId: 'nuclei',
          }),
        ),
        ...Array.from({ length: rejected }, () =>
          run({
            classificationModelId: null,
            createdAt: at(month),
            decisionStatus: 'REJECTED',
            pipeline: 'pathology-nuclei',
            segmentationModelId: 'nuclei',
          }),
        ),
      ];
      const board = buildModelMonitoring(
        [...maps('2026-08', 30, 0), ...maps('2026-10', 5, 25)],
        window('2026-10'),
      );
      const entry = only(board.models);

      expect(entry.correctionApplicable).toBe(false);
      expect(entry.months[0]).toMatchObject({
        correctionRate: null,
        rejected: 25,
        validated: 5,
      });
      expect(entry.months[0].drift.alert).toBe(false);
      expect(entry.alert).toBeNull();
    });
  });

  describe('the drift alert', () => {
    // Baseline: July, August, September, 20 decisions each, 2 corrected (10 %).
    const baseline = () =>
      ['2026-07', '2026-08', '2026-09'].flatMap((month) =>
        decisions(month, 20, 2),
      );
    const october = (judged: number, corrected: number) =>
      buildModelMonitoring(
        [...baseline(), ...decisions('2026-10', judged, corrected)],
        window('2026-10'),
      );

    it('goes off when the rate of the month is more than 10 points above the average of the 3 months before', () => {
      // 6 of 25 = 24 %, against 10 %: +14 points.
      const entry = only(october(25, 6).models);

      expect(entry.months[0].drift).toEqual({
        alert: true,
        baselineDecisions: 60,
        baselineRate: 0.1,
        deltaPoints: 14,
      });
      expect(entry.alert).toEqual({
        baselineRate: 0.1,
        deltaPoints: 14,
        month: '2026-10',
        rate: 0.24,
      });
    });

    it('does not go off at exactly 10 points: the rate must exceed it', () => {
      // 5 of 25 = 20 %, against 10 %: +10 points.
      const entry = only(october(25, 5).models);

      expect(entry.months[0].drift).toEqual({
        alert: false,
        baselineDecisions: 60,
        baselineRate: 0.1,
        deltaPoints: 10,
      });
      expect(entry.alert).toBeNull();
    });

    it('does not go off for a rate that went down', () => {
      expect(only(october(30, 0).models).months[0].drift).toMatchObject({
        alert: false,
        deltaPoints: -10,
      });
    });

    it(`needs ${DRIFT_MIN_DECISIONS} decisions in the month`, () => {
      // 10 of 19 corrected is a huge rate, on too few decisions.
      expect(
        only(october(DRIFT_MIN_DECISIONS - 1, 10).models).months[0].drift.alert,
      ).toBe(false);
      expect(
        only(october(DRIFT_MIN_DECISIONS, 10).models).months[0].drift.alert,
      ).toBe(true);
    });

    it(`needs ${DRIFT_MIN_DECISIONS} decisions in the baseline too`, () => {
      const thin = buildModelMonitoring(
        [...decisions('2026-09', 10, 0), ...decisions('2026-10', 25, 10)],
        window('2026-10'),
      );

      expect(only(thin.models).months[0].drift).toMatchObject({
        alert: false,
        baselineDecisions: 10,
        baselineRate: 0,
      });
    });

    it('has no baseline for a model with no earlier month', () => {
      const first = buildModelMonitoring(
        decisions('2026-10', 40, 20),
        window('2026-10'),
      );

      expect(only(first.models).months[0].drift).toEqual({
        alert: false,
        baselineDecisions: 0,
        baselineRate: null,
        deltaPoints: null,
      });
    });

    it('averages the 3 months before only: an older month does not count', () => {
      // June had a very high rate (all corrected); it is the 4th month back.
      const board = buildModelMonitoring(
        [
          ...decisions('2026-06', 40, 40),
          ...baseline(),
          ...decisions('2026-10', 25, 6),
        ],
        window('2026-10'),
      );

      expect(only(board.models).months[0].drift.baselineRate).toBe(0.1);
    });

    it('weights the baseline by decisions, and skips a month without any', () => {
      // July 20 decisions (0 corrected), September 60 decisions (30 corrected); August has no run.
      const board = buildModelMonitoring(
        [
          ...decisions('2026-07', 20, 0),
          ...decisions('2026-09', 60, 30),
          ...decisions('2026-10', 25, 12),
        ],
        window('2026-10'),
      );

      // Baseline: 30 / 80 = 37.5 %. October: 12 / 25 = 48 %.
      expect(only(board.models).months[0].drift).toEqual({
        alert: true,
        baselineDecisions: 80,
        baselineRate: 0.375,
        deltaPoints: 10.5,
      });
    });

    it('is judged month by month, from the months before the first one shown', () => {
      const board = buildModelMonitoring(
        [
          ...baseline(),
          ...decisions('2026-10', 25, 6),
          ...decisions('2026-11', 25, 3),
        ],
        window('2026-10', '2026-11'),
      );
      const [oct, nov] = only(board.models).months;

      expect(oct.drift.alert).toBe(true);
      // November: against Aug, Sep, Oct: (2 + 2 + 6) / 65 = 15.4 %; 12 % is below it.
      expect(nov.drift.alert).toBe(false);
      // The alert on the board is the latest month's.
      expect(only(board.models).alert).toBeNull();
    });
  });

  it('says its period, its zone and its thresholds', () => {
    const board = buildModelMonitoring([run()], {
      firstMonth: '2026-10',
      lastMonth: '2026-10',
      to: NOW,
    });

    expect(board).toMatchObject({
      period: { from: '2026-09-30T23:00:00.000Z', to: NOW.toISOString() },
      thresholds: { baselineMonths: 3, driftPoints: 10, minDecisions: 20 },
      timeZone: 'Africa/Algiers',
    });
  });

  it('is empty without runs', () => {
    expect(buildModelMonitoring([], window('2026-10')).models).toEqual([]);
  });
});
