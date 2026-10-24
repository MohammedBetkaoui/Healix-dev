import {
  BRAIN_GLIOMA_URGENT_MIN_PROBABILITY,
  BRAIN_TUMOR_POSSIBLE_MIN_PROBABILITY,
  BREAST_BORDERLINE_RATIO,
  BREAST_URGENT_MARGIN,
  comparePriority,
  computeAiPriority,
  NUCLEI_ABSENT_MAX_SHARE,
  type PriorityRun,
  rankByPriority,
} from './ai-priority';

function run(overrides: Partial<PriorityRun> = {}): PriorityRun {
  return {
    decisionStatus: null,
    decisionThreshold: null,
    malignancyScore: null,
    modelDecision: null,
    nucleiFractions: null,
    pipeline: 'brain',
    predictions: null,
    status: 'SUCCEEDED',
    ...overrides,
  };
}

// A brain softmax: the top class and its probability, the rest shared.
function brain(top: string, probability: number): PriorityRun {
  const others = ['glioma', 'meningioma', 'notumor', 'pituitary'].filter(
    (label) => label !== top,
  );
  return run({
    pipeline: 'brain',
    predictions: [
      { label: top, probability },
      ...others.map((label) => ({
        label,
        probability: (1 - probability) / others.length,
      })),
    ],
  });
}

const breast = (
  score: number | null,
  threshold: number | null,
  modelDecision: string | null = null,
) =>
  run({
    decisionThreshold: threshold,
    malignancyScore: score,
    modelDecision,
    pipeline: 'pathology-breast',
  });

const ecg = (positive: string[], probabilities: Record<string, number> = {}) =>
  run({ pipeline: 'cardio-ecg', predictions: { positive, probabilities } });

const area = (pixels: number) => ({ areaMm2: null, pixels });
const heart = (lv: number, rv: number, myo: number, noStructureFound = false) =>
  run({
    pipeline: 'cardio-seg-mri',
    predictions: {
      noStructureFound,
      structures: { LV: area(lv), MYO: area(myo), RV: area(rv) },
    },
  });

const nuclei = (background: number, types: Record<string, number | null>) =>
  run({
    nucleiFractions: { background, nucleusTypes: types },
    pipeline: 'pathology-nuclei',
  });

const codes = (r: PriorityRun) =>
  computeAiPriority(r).reasons.map((reason) => reason.code);

describe('computeAiPriority: the brain', () => {
  it('puts a glioma the model leans on first: URGENT, with the class and its probability', () => {
    const priority = computeAiPriority(brain('glioma', 0.82));

    expect(priority.level).toBe('URGENT');
    expect(priority.reasons).toEqual([
      { code: 'BRAIN_GLIOMA', params: { probability: 0.82 } },
      { code: 'LOW_CONFIDENCE', params: { probability: 0.82 } },
    ]);
    expect(priority.score).toBeGreaterThanOrEqual(70);
  });

  it(`is URGENT from a glioma probability of ${BRAIN_GLIOMA_URGENT_MIN_PROBABILITY}, HIGH just under`, () => {
    expect(
      computeAiPriority(brain('glioma', BRAIN_GLIOMA_URGENT_MIN_PROBABILITY))
        .level,
    ).toBe('URGENT');
    expect(
      computeAiPriority(
        brain('glioma', BRAIN_GLIOMA_URGENT_MIN_PROBABILITY - 0.01),
      ).level,
    ).toBe('HIGH');
  });

  it.each(['meningioma', 'pituitary'])(
    'is HIGH for a %s, whatever its probability',
    (label) => {
      for (const probability of [0.4, 0.7, 0.99]) {
        const priority = computeAiPriority(brain(label, probability));

        expect(priority.level).toBe('HIGH');
        expect(priority.reasons[0]).toEqual({
          code: 'BRAIN_TUMOR_PREDICTED',
          params: { label, probability },
        });
      }
    },
  );

  it('is HIGH for a glioma under the urgent probability, still a tumour predicted', () => {
    expect(computeAiPriority(brain('glioma', 0.4)).reasons[0]).toEqual({
      code: 'BRAIN_TUMOR_PREDICTED',
      params: { label: 'glioma', probability: 0.4 },
    });
  });

  it('is ROUTINE for a confident "no tumour", with a low score', () => {
    const priority = computeAiPriority(brain('notumor', 0.99));

    expect(priority).toMatchObject({ level: 'ROUTINE', reasons: [] });
    expect(priority.score).toBeLessThan(5);
  });

  it(`is HIGH for a "no tumour" that leaves ${BRAIN_TUMOR_POSSIBLE_MIN_PROBABILITY} or more to the tumour classes`, () => {
    const hesitating = computeAiPriority(brain('notumor', 0.65));

    expect(hesitating.level).toBe('HIGH');
    expect(hesitating.reasons).toEqual([
      {
        code: 'BRAIN_TUMOR_POSSIBLE',
        params: { probability: expect.closeTo(0.35, 6) as number },
      },
      { code: 'LOW_CONFIDENCE', params: { probability: 0.65 } },
    ]);
    expect(
      computeAiPriority(
        brain('notumor', 1 - BRAIN_TUMOR_POSSIBLE_MIN_PROBABILITY),
      ).level,
    ).toBe('HIGH');
    expect(
      computeAiPriority(
        brain('notumor', 1 - BRAIN_TUMOR_POSSIBLE_MIN_PROBABILITY + 0.01),
      ).level,
    ).toBe('ROUTINE');
  });

  it('says the model is unsure when its top class is under the 0.90 of the result page, at any level', () => {
    expect(codes(brain('notumor', 0.85))).toEqual(['LOW_CONFIDENCE']);
    expect(codes(brain('notumor', 0.9))).toEqual([]);
    expect(codes(brain('meningioma', 0.85))).toContain('LOW_CONFIDENCE');
    expect(codes(brain('meningioma', 0.95))).not.toContain('LOW_CONFIDENCE');
  });

  it('ranks a tumour more probable above a less probable one of the same level', () => {
    expect(computeAiPriority(brain('meningioma', 0.97)).score).toBeGreaterThan(
      computeAiPriority(brain('meningioma', 0.55)).score,
    );
  });

  it('does not depend on the order the predictions were stored in', () => {
    const reversed = run({
      predictions: [
        ...(brain('glioma', 0.82).predictions as unknown[]),
      ].reverse() as never,
    });

    expect(computeAiPriority(reversed)).toEqual(
      computeAiPriority(brain('glioma', 0.82)),
    );
  });

  it.each([
    null,
    [],
    'glioma',
    { label: 'glioma' },
    [{ label: 'glioma' }],
    [{ label: 'unknown', probability: 0.99 }],
  ])('is ROUTINE for a result it cannot read: %j', (predictions) => {
    expect(
      computeAiPriority(run({ predictions: predictions as never })),
    ).toEqual({ level: 'ROUTINE', reasons: [], score: 0 });
  });
});

describe('computeAiPriority: the breast', () => {
  const threshold = 0.5;

  it('is URGENT once the score has covered half of the way from the threshold to 1', () => {
    // 0.5 + 0.5 * 0.5 = 0.75
    const priority = computeAiPriority(breast(0.75, threshold));

    expect(priority.level).toBe('URGENT');
    expect(priority.reasons).toEqual([
      { code: 'BREAST_MALIGNANT', params: { score: 0.75, threshold } },
    ]);
    expect(computeAiPriority(breast(0.74, threshold)).level).toBe('HIGH');
    expect(BREAST_URGENT_MARGIN).toBe(0.5);
  });

  it('is HIGH from the threshold itself up to there', () => {
    const priority = computeAiPriority(breast(threshold, threshold));

    expect(priority.level).toBe('HIGH');
    expect(priority.reasons).toEqual([
      {
        code: 'BREAST_ABOVE_THRESHOLD',
        params: { score: threshold, threshold },
      },
    ]);
  });

  it(`is HIGH just under the threshold, from ${BREAST_BORDERLINE_RATIO * 100} % of it: a borderline "benign"`, () => {
    const borderline = computeAiPriority(
      breast(threshold * BREAST_BORDERLINE_RATIO, threshold),
    );

    expect(borderline.level).toBe('HIGH');
    expect(borderline.reasons[0].code).toBe('BREAST_BORDERLINE');
    expect(
      computeAiPriority(
        breast(threshold * BREAST_BORDERLINE_RATIO - 0.01, threshold),
      ).level,
    ).toBe('ROUTINE');
  });

  it('is ROUTINE for a score well under the threshold', () => {
    expect(computeAiPriority(breast(0.05, threshold))).toMatchObject({
      level: 'ROUTINE',
      reasons: [],
    });
  });

  it('keeps the score growing across the threshold: a higher score never ranks lower', () => {
    const scores = [0.05, 0.3, 0.4, 0.45, 0.5, 0.6, 0.74, 0.75, 0.9, 1].map(
      (score) => computeAiPriority(breast(score, threshold)).score,
    );

    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it('reads another threshold the same way: the margin is relative to it', () => {
    // Threshold 0.8: URGENT from 0.8 + 0.2 * 0.5 = 0.9.
    expect(computeAiPriority(breast(0.91, 0.8)).level).toBe('URGENT');
    expect(computeAiPriority(breast(0.85, 0.8)).level).toBe('HIGH');
    // Borderline from 80 % of 0.8, that is 0.64.
    expect(computeAiPriority(breast(0.65, 0.8)).level).toBe('HIGH');
    expect(computeAiPriority(breast(0.6, 0.8)).level).toBe('ROUTINE');
  });

  it('falls back on the stored answer when there is no usable score', () => {
    expect(computeAiPriority(breast(null, null, 'malignant'))).toMatchObject({
      level: 'HIGH',
      reasons: [{ code: 'BREAST_MALIGNANT' }],
    });
    expect(computeAiPriority(breast(null, null, 'benign')).level).toBe(
      'ROUTINE',
    );
    expect(computeAiPriority(breast(0.9, 0, 'malignant')).level).toBe('HIGH');
    expect(computeAiPriority(breast(Number.NaN, 0.5)).level).toBe('ROUTINE');
  });
});

describe('computeAiPriority: the ECG', () => {
  it('is URGENT for a myocardial infarction, with its probability', () => {
    const priority = computeAiPriority(ecg(['MI'], { MI: 0.91, NORM: 0.02 }));

    expect(priority.level).toBe('URGENT');
    expect(priority.reasons).toEqual([
      { code: 'ECG_MI', params: { probability: 0.91 } },
    ]);
    expect(priority.score).toBeGreaterThanOrEqual(70);
  });

  it('is URGENT for MI among other abnormal classes, and says so', () => {
    expect(
      computeAiPriority(
        ecg(['MI', 'STTC'], { MI: 0.8, STTC: 0.7 }),
      ).reasons.map((r) => r.code),
    ).toEqual(['ECG_MI', 'ECG_MULTIPLE_ABNORMAL']);
  });

  it('is HIGH for two abnormal classes without MI', () => {
    const priority = computeAiPriority(
      ecg(['STTC', 'CD'], { CD: 0.6, STTC: 0.8 }),
    );

    expect(priority.level).toBe('HIGH');
    expect(priority.reasons).toEqual([
      { code: 'ECG_MULTIPLE_ABNORMAL', params: { count: 2 } },
    ]);
  });

  it('is HIGH for three abnormal classes, and ranks them above two', () => {
    const three = computeAiPriority(
      ecg(['STTC', 'CD', 'HYP'], { CD: 0.9, HYP: 0.9, STTC: 0.9 }),
    );
    const two = computeAiPriority(ecg(['STTC', 'CD'], { CD: 0.5, STTC: 0.5 }));

    expect(three.reasons[0].params).toEqual({ count: 3 });
    expect(three.score).toBeGreaterThan(two.score);
  });

  it.each([[[]], [['NORM']], [['STTC']], [['CD']], [['HYP']]])(
    'is ROUTINE for %j: normal, or a single abnormal class',
    (positive) => {
      expect(
        computeAiPriority(
          ecg(positive, { CD: 0.6, HYP: 0.6, NORM: 0.9, STTC: 0.6 }),
        ).level,
      ).toBe('ROUTINE');
    },
  );

  it('does not count NORM as an abnormal class', () => {
    expect(computeAiPriority(ecg(['NORM', 'STTC'])).level).toBe('ROUTINE');
  });

  it.each([null, 'MI', { positive: 'MI' }, []])(
    'is ROUTINE for a result it cannot read: %j',
    (predictions) => {
      expect(
        computeAiPriority(
          run({ pipeline: 'cardio-ecg', predictions: predictions as never }),
        ).level,
      ).toBe('ROUTINE');
    },
  );
});

describe('computeAiPriority: the cardiac MRI map', () => {
  it('is ROUTINE when the three structures are found', () => {
    expect(computeAiPriority(heart(4000, 3000, 2500))).toEqual({
      level: 'ROUTINE',
      reasons: [],
      score: 0,
    });
  });

  it('is HIGH when a structure is absent, naming it', () => {
    expect(computeAiPriority(heart(4000, 0, 2500))).toMatchObject({
      level: 'HIGH',
      reasons: [
        { code: 'CARDIO_STRUCTURE_ABSENT', params: { structure: 'RV' } },
      ],
    });
  });

  it('names every structure that is absent, and ranks two missing above one', () => {
    const two = computeAiPriority(heart(0, 0, 2500));

    expect(two.reasons.map((reason) => reason.params?.structure)).toEqual([
      'LV',
      'RV',
    ]);
    expect(two.score).toBeGreaterThan(
      computeAiPriority(heart(0, 3000, 2500)).score,
    );
  });

  it('is HIGH when no structure was found at all', () => {
    expect(computeAiPriority(heart(0, 0, 0))).toMatchObject({
      level: 'HIGH',
      reasons: [{ code: 'CARDIO_NO_STRUCTURE' }],
    });
    expect(computeAiPriority(heart(10, 10, 10, true)).reasons).toEqual([
      { code: 'CARDIO_NO_STRUCTURE' },
    ]);
  });

  it.each([null, {}, { structures: null }, []])(
    'is ROUTINE for a result it cannot read: %j',
    (predictions) => {
      expect(
        computeAiPriority(
          run({
            pipeline: 'cardio-seg-mri',
            predictions: predictions as never,
          }),
        ).level,
      ).toBe('ROUTINE');
    },
  );
});

describe('computeAiPriority: the nuclei map', () => {
  const types = {
    connective: 0.2,
    dead: 0.1,
    epithelial: 0.3,
    inflammatory: 0.2,
    neoplastic: 0.2,
  };

  it('is ROUTINE when nuclei were found', () => {
    expect(computeAiPriority(nuclei(0.6, types))).toEqual({
      level: 'ROUTINE',
      reasons: [],
      score: 0,
    });
  });

  it('is HIGH when the map is empty: nothing but background', () => {
    expect(
      computeAiPriority(
        nuclei(1, {
          connective: null,
          dead: null,
          epithelial: null,
          inflammatory: null,
          neoplastic: null,
        }),
      ),
    ).toMatchObject({
      level: 'HIGH',
      reasons: [{ code: 'NUCLEI_NONE_FOUND' }],
    });
  });

  it(`is HIGH under ${NUCLEI_ABSENT_MAX_SHARE * 100} % of nucleus pixels, ROUTINE over`, () => {
    expect(
      computeAiPriority(nuclei(1 - NUCLEI_ABSENT_MAX_SHARE / 2, types)).level,
    ).toBe('HIGH');
    expect(
      computeAiPriority(nuclei(1 - NUCLEI_ABSENT_MAX_SHARE * 2, types)).level,
    ).toBe('ROUTINE');
  });

  it.each([null, {}, { background: 'a' }, []])(
    'is ROUTINE for a result it cannot read: %j',
    (fractions) => {
      expect(
        computeAiPriority(
          run({
            nucleiFractions: fractions as never,
            pipeline: 'pathology-nuclei',
          }),
        ).level,
      ).toBe('ROUTINE');
    },
  );
});

describe('computeAiPriority: what is not to be reviewed first', () => {
  const suspicious: Record<string, PriorityRun> = {
    brain: brain('glioma', 0.95),
    'cardio-ecg': ecg(['MI'], { MI: 0.95 }),
    'cardio-seg-mri': heart(0, 0, 0),
    'pathology-breast': breast(0.95, 0.5),
    'pathology-nuclei': nuclei(1, { neoplastic: null }),
  };

  it.each(Object.keys(suspicious))(
    'falls back to ROUTINE, score 0, once a physician decided: %s',
    (pipeline) => {
      for (const decisionStatus of [
        'VALIDATED',
        'CORRECTED',
        'REJECTED',
      ] as const) {
        expect(
          computeAiPriority({ ...suspicious[pipeline], decisionStatus }),
        ).toEqual({
          level: 'ROUTINE',
          reasons: [{ code: 'ALREADY_DECIDED' }],
          score: 0,
        });
      }
    },
  );

  it.each(['RUNNING', 'FAILED', 'REJECTED_INPUT'] as const)(
    'is ROUTINE, score 0, for a run that is %s: there is no result to read',
    (status) => {
      expect(computeAiPriority({ ...suspicious.brain, status })).toEqual({
        level: 'ROUTINE',
        reasons: [{ code: 'NO_RESULT' }],
        score: 0,
      });
    },
  );

  it('is ROUTINE for a chain it does not know', () => {
    expect(
      computeAiPriority(
        run({
          pipeline: 'something-new',
          predictions: [{ label: 'glioma', probability: 1 }],
        }),
      ).level,
    ).toBe('ROUTINE');
  });
});

describe('the score', () => {
  const urgent = [
    brain('glioma', 0.5),
    brain('glioma', 1),
    ecg(['MI'], { MI: 0.5 }),
    breast(0.75, 0.5),
    breast(1, 0.5),
  ];
  const high = [
    brain('meningioma', 0.34),
    brain('meningioma', 1),
    breast(0.5, 0.5),
    breast(0.4, 0.5),
    heart(0, 1, 1),
    nuclei(1, { a: null }),
  ];

  it('stays in 0-100, in the band of its level: ROUTINE under 40, HIGH 40-69, URGENT 70 and over', () => {
    for (const r of urgent)
      expect(computeAiPriority(r).score).toBeGreaterThanOrEqual(70);
    for (const r of urgent)
      expect(computeAiPriority(r).score).toBeLessThanOrEqual(100);
    for (const r of high) {
      const { score } = computeAiPriority(r);
      expect(score).toBeGreaterThanOrEqual(40);
      expect(score).toBeLessThanOrEqual(69);
    }
    for (const r of [
      brain('notumor', 0.99),
      brain('notumor', 0.75),
      breast(0.1, 0.5),
      ecg(['STTC'], { STTC: 0.9 }),
      heart(1, 1, 1),
    ]) {
      const { score } = computeAiPriority(r);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(39);
    }
  });

  it('is a whole number', () => {
    expect(
      Number.isInteger(computeAiPriority(brain('glioma', 0.8137)).score),
    ).toBe(true);
  });

  it('does not change the run it reads', () => {
    const input = brain('glioma', 0.9);
    const copy = JSON.parse(JSON.stringify(input)) as PriorityRun;

    computeAiPriority(input);

    expect(input).toEqual(copy);
  });
});

describe('the reading order', () => {
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 8, minutes));
  const entry = (id: string, minutes: number, source: PriorityRun) => ({
    ...source,
    createdAt: at(minutes),
    id,
  });

  const runs = [
    entry('routine-old', 0, brain('notumor', 0.99)),
    entry('high-meningioma', 1, brain('meningioma', 0.95)),
    entry('urgent-glioma', 2, brain('glioma', 0.9)),
    entry('urgent-mi', 3, ecg(['MI'], { MI: 0.99 })),
    entry('high-heart', 4, heart(0, 2, 2)),
    entry('routine-new', 5, brain('notumor', 0.97)),
  ];

  it('puts URGENT before HIGH before ROUTINE, the strongest finding first inside a level', () => {
    expect(rankByPriority(runs).map((ranked) => ranked.run.id)).toEqual([
      'urgent-mi',
      'urgent-glioma',
      'high-meningioma',
      'high-heart',
      'routine-new',
      'routine-old',
    ]);
  });

  it('keeps one level when asked', () => {
    expect(
      rankByPriority(runs, 'URGENT').map((ranked) => ranked.run.id),
    ).toEqual(['urgent-mi', 'urgent-glioma']);
    expect(rankByPriority(runs, 'HIGH').map((ranked) => ranked.run.id)).toEqual(
      ['high-meningioma', 'high-heart'],
    );
    expect(rankByPriority(runs, 'ROUTINE')).toHaveLength(2);
  });

  it('gives each run its priority, the one it was ranked on', () => {
    for (const ranked of rankByPriority(runs)) {
      expect(ranked.priority).toEqual(computeAiPriority(ranked.run));
    }
  });

  it('puts the run that has waited longest first when the findings are equal', () => {
    const twins = [
      entry('late', 20, brain('glioma', 0.9)),
      entry('early', 10, brain('glioma', 0.9)),
      entry('earliest', 5, brain('glioma', 0.9)),
    ];

    expect(rankByPriority(twins).map((ranked) => ranked.run.id)).toEqual([
      'earliest',
      'early',
      'late',
    ]);
  });

  it('breaks a last tie by id, so that two requests give the same order', () => {
    const same = [
      entry('b', 1, brain('glioma', 0.9)),
      entry('a', 1, brain('glioma', 0.9)),
    ];

    expect(rankByPriority(same).map((ranked) => ranked.run.id)).toEqual([
      'a',
      'b',
    ]);
    expect(
      rankByPriority([...same].reverse()).map((ranked) => ranked.run.id),
    ).toEqual(['a', 'b']);
  });

  it('is a total order: comparing two runs both ways gives opposite answers', () => {
    const ranked = rankByPriority(runs).map(({ priority, run: source }) => ({
      createdAt: source.createdAt,
      id: source.id,
      priority,
    }));

    for (const a of ranked) {
      for (const b of ranked) {
        expect(
          Math.sign(comparePriority(a, b)) + Math.sign(comparePriority(b, a)),
        ).toBe(0);
      }
    }
  });

  it('sorts a decided run after every run still to review', () => {
    const decided = entry('decided-glioma', 0, {
      ...brain('glioma', 0.99),
      decisionStatus: 'VALIDATED',
    });

    const order = rankByPriority([decided, ...runs]).map(
      (ranked) => ranked.run.id,
    );

    expect(order.indexOf('decided-glioma')).toBeGreaterThan(
      order.indexOf('routine-new'),
    );
  });
});
