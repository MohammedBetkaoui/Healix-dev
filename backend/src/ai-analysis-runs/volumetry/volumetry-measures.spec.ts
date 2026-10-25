import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  automaticPhases,
  computeMeasures,
  lvVolumeCurveMl,
  lvefClass,
  MYOCARDIAL_DENSITY_G_ML,
  mostellerBsa,
  type SliceAreas,
  type StackAreas,
  structureVolumeMl,
  VolumetryInputError,
} from './volumetry-measures';

// The cases of ai-service/tests/fixtures/cardio-volume/measures-cases.json are the
// ones the Python version (ai-service/app/cardio_volume_measures.py, which
// recalculates the measures after the model) is tested against: the inputs were
// chosen by hand and the expected values computed in exact rational arithmetic,
// independently of both implementations.
type Case = {
  expected: Record<string, unknown>;
  input: {
    areas: StackAreas;
    bsaM2: number | null;
    edPhase: number;
    esPhase: number;
    excludedSlices: number[];
    gapMm: number;
    heartRateBpm: number | null;
  };
  name: string;
};

const CASES = (
  JSON.parse(
    readFileSync(
      join(
        __dirname,
        '../../../../ai-service/tests/fixtures/cardio-volume/measures-cases.json',
      ),
      'utf8',
    ),
  ) as { cases: Case[] }
).cases;

// Every number to 1e-9 (relative or absolute), everything else equal, key for key.
function expectSame(actual: unknown, expected: unknown, path = 'measures') {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    const list = actual as unknown[];
    expect(list).toHaveLength(expected.length);
    expected.forEach((value, index) =>
      expectSame(list[index], value, `${path}[${index}]`),
    );
  } else if (expected !== null && typeof expected === 'object') {
    expect(actual && typeof actual === 'object').toBeTruthy();
    const record = actual as Record<string, unknown>;
    expect(Object.keys(record).sort()).toEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) {
      expectSame(record[key], value, `${path}.${key}`);
    }
  } else if (typeof expected === 'number') {
    expect(typeof actual).toBe('number');
    const tolerance = Math.max(1e-9, Math.abs(expected) * 1e-9);
    expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(
      tolerance,
    );
  } else {
    expect(actual).toEqual(expected);
  }
}

const slice = (lv: number, rv = 1200, myo = 800): SliceAreas => ({
  LV: lv,
  MYO: myo,
  RV: rv,
});
const uniform = (lvEd = 1000, lvEs = 400, slices = 6): StackAreas => [
  Array.from({ length: slices }, () => slice(lvEd, 1200, 800)),
  Array.from({ length: slices }, () => slice(lvEs, 700, 900)),
];

describe('computeMeasures: the cases shared with the Python version', () => {
  it('has the cases the Python tests have', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(15);
  });

  it.each(CASES.map((item) => [item.name, item] as const))(
    '%s',
    (_name, item) => {
      const { input } = item;

      const measures = computeMeasures(
        input.areas,
        input.gapMm,
        input.edPhase,
        input.esPhase,
        input.excludedSlices,
        input.bsaM2,
        input.heartRateBpm,
      );

      expectSame(measures, item.expected);
    },
  );
});

describe('volumes, fractions and mass', () => {
  it('the volume of a uniform stack is the sum of its discs', () => {
    // 6 slices of 1000 mm² and a 10 mm step: 60 000 mm³ = 60 ml.
    expect(structureVolumeMl(uniform(), 10, 0, 'LV')).toBe(60);
    expect(structureVolumeMl(uniform(), 10, 1, 'LV')).toBe(24);
  });

  it('the step between slices is the height of each disc, not the slice thickness', () => {
    expect(structureVolumeMl(uniform(), 20, 0, 'LV')).toBe(
      2 * structureVolumeMl(uniform(), 10, 0, 'LV'),
    );
  });

  it('gives the EF, the mass and the preserved class of the uniform stack', () => {
    const measures = computeMeasures(uniform(), 10, 0, 1);

    expect(measures.lv).toEqual({
      edvMl: 60,
      efPercent: expect.closeTo(60, 9) as number,
      esvMl: 24,
      svMl: 36,
    });
    expect(MYOCARDIAL_DENSITY_G_ML).toBe(1.05);
    expect(measures.lvMassG).toBeCloseTo(48 * 1.05, 9);
    expect(measures.lvefClass).toBe('preserved');
  });

  it('needs the heart rate for the output and the surface for the indexing', () => {
    const bare = computeMeasures(uniform(), 10, 0, 1);
    expect(bare.cardiacOutputLMin).toBeNull();
    expect(bare.indexed).toBeNull();
    expect(bare.heartRateBpm).toBeNull();

    expect(computeMeasures(uniform(), 10, 0, 1, [], null, 60)).toMatchObject({
      cardiacOutputLMin: expect.closeTo(2.16, 9) as number,
      indexed: null,
    });
    expect(computeMeasures(uniform(), 10, 0, 1, [], 2, null)).toMatchObject({
      cardiacOutputLMin: null,
      indexed: {
        cardiacIndexLMinM2: null,
        lvEdvMlM2: 30,
      },
    });
    expect(
      computeMeasures(uniform(), 10, 0, 1, [], 2, 60).indexed
        ?.cardiacIndexLMinM2,
    ).toBeCloseTo(1.08, 9);
  });

  it('leaves the excluded slices out of every sum and of the curve', () => {
    const areas: StackAreas = [
      [
        slice(3000, 1, 1),
        ...Array.from({ length: 5 }, () => slice(1000, 1, 1)),
      ],
      [slice(1500, 1, 1), ...Array.from({ length: 5 }, () => slice(500, 1, 1))],
    ];

    expect(lvVolumeCurveMl(areas, 10)).toEqual([80, 40]);
    expect(lvVolumeCurveMl(areas, 10, [0])).toEqual([50, 25]);
    const corrected = computeMeasures(areas, 10, 0, 1, [0]);
    expect(corrected.lv.efPercent).toBeCloseTo(50, 9);
    expect(corrected.excludedSlices).toEqual([0]);
  });

  it('finds ED and ES as the largest and the smallest LV volume, the first one on a tie', () => {
    expect(automaticPhases([60, 55, 41, 30, 24, 28, 45, 58])).toEqual([0, 4]);
    expect(automaticPhases([30, 62, 40, 25, 33])).toEqual([1, 3]);
    expect(automaticPhases([50, 50, 20, 20])).toEqual([0, 2]);
    expect(() => automaticPhases([])).toThrow(VolumetryInputError);
  });

  it('computes a negative stroke volume, and warns about it', () => {
    const measures = computeMeasures(uniform(), 10, 1, 0);

    expect(measures.lv.svMl).toBe(-36);
    expect(measures.lv.efPercent).toBeCloseTo(-150, 9);
    expect(measures.warnings).toEqual(['es_volume_exceeds_ed']);
  });

  it('gives no EF and no class without an LV at ED', () => {
    const empty: StackAreas = Array.from({ length: 2 }, () =>
      Array.from({ length: 6 }, () => slice(0, 0, 0)),
    );

    const measures = computeMeasures(empty, 10, 0, 1);

    expect(measures.lv.efPercent).toBeNull();
    expect(measures.lvefClass).toBeNull();
  });
});

describe('the ESC class of the LVEF', () => {
  it.each([
    [10, 'reduced'],
    [39.9, 'reduced'],
    [40, 'reduced'],
    [40.4, 'reduced'],
    [40.6, 'mildlyReduced'],
    [41, 'mildlyReduced'],
    [45, 'mildlyReduced'],
    [49, 'mildlyReduced'],
    [49.4, 'mildlyReduced'],
    [49.6, 'preserved'],
    [50, 'preserved'],
    [62, 'preserved'],
    [-5, 'reduced'],
    [null, null],
    [Number.NaN, null],
  ])('reads %s as %s (on the EF rounded to the unit)', (ef, expected) => {
    expect(lvefClass(ef)).toBe(expected);
  });
});

describe('Mosteller', () => {
  it('is sqrt(cm x kg / 3600), and null for anything that is not a positive number', () => {
    expect(mostellerBsa(180, 80)).toBeCloseTo(Math.sqrt((180 * 80) / 3600), 12);
    expect(mostellerBsa(170, 70)).toBeCloseTo(1.8181, 4);
    for (const [height, weight] of [
      [0, 70],
      [170, 0],
      [-1, 70],
      [Number.NaN, 70],
      [170, Number.POSITIVE_INFINITY],
    ]) {
      expect(mostellerBsa(height, weight)).toBeNull();
    }
  });
});

describe('impossible arguments', () => {
  it.each([
    ['ED out of range', () => computeMeasures(uniform(), 10, 2, 0)],
    ['ES negative', () => computeMeasures(uniform(), 10, 0, -1)],
    ['ED not an integer', () => computeMeasures(uniform(), 10, 0.5, 1)],
    ['slice out of range', () => computeMeasures(uniform(), 10, 0, 1, [6])],
    ['slice negative', () => computeMeasures(uniform(), 10, 0, 1, [-1])],
    [
      'every slice excluded',
      () => computeMeasures(uniform(), 10, 0, 1, [0, 1, 2, 3, 4, 5]),
    ],
    ['BSA zero', () => computeMeasures(uniform(), 10, 0, 1, [], 0, null)],
    [
      'negative heart rate',
      () => computeMeasures(uniform(), 10, 0, 1, [], null, -60),
    ],
    ['step zero', () => computeMeasures(uniform(), 0, 0, 1)],
    ['step NaN', () => computeMeasures(uniform(), Number.NaN, 0, 1)],
    ['no phase', () => computeMeasures([], 10, 0, 0)],
    [
      'phases of different sizes',
      () => computeMeasures([uniform()[0], uniform(1000, 400, 5)[1]], 10, 0, 1),
    ],
  ])('refuses %s', (_name, call) => {
    expect(call).toThrow(VolumetryInputError);
  });
});
