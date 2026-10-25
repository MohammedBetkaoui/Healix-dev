import { AiAnalysisRunStatus } from '@prisma/client';

import {
  cardioVolumeResult,
  DEFAULT_FACTORS,
} from '../volumetry/cardio-volume.fixtures';
import { applyCorrection, buildVolumetry } from '../volumetry/volumetry';
import {
  computeAiPriority,
  PRIORITY_RUN_SELECT,
  rankByPriority,
  type PriorityRun,
} from './ai-priority';

// A volumetry whose LVEF is `ef` %: ED at the first phase (factor 1), ES at the
// second (factor 1 - ef / 100), the other phases in between.
function runWithLvef(
  ef: number,
  overrides: Partial<PriorityRun> = {},
): PriorityRun {
  const factors = [1, 1 - ef / 100, 1 - ef / 200, 1 - ef / 150, 1 - ef / 300];
  return {
    decisionStatus: null,
    decisionThreshold: null,
    malignancyScore: null,
    modelDecision: null,
    nucleiFractions: null,
    pipeline: 'cardio-volume-mri',
    predictions: null,
    status: AiAnalysisRunStatus.SUCCEEDED,
    volumetry: JSON.parse(
      JSON.stringify(buildVolumetry(cardioVolumeResult({ factors }))),
    ) as never,
    ...overrides,
  };
}

describe('the reading priority of a cardiac cine volumetry', () => {
  it('reads the ejection fraction in the 2021 ESC classes: reduced is URGENT, mildly reduced HIGH, preserved ROUTINE', () => {
    expect(computeAiPriority(runWithLvef(25))).toMatchObject({
      level: 'URGENT',
      reasons: [{ code: 'VOLUME_LVEF_REDUCED' }],
    });
    expect(computeAiPriority(runWithLvef(45))).toMatchObject({
      level: 'HIGH',
      reasons: [{ code: 'VOLUME_LVEF_MILDLY_REDUCED' }],
    });
    expect(computeAiPriority(runWithLvef(62))).toEqual({
      level: 'ROUTINE',
      reasons: [],
      score: expect.any(Number) as number,
    });
  });

  it('puts the class limits where the guidelines do, on the fraction rounded to the unit', () => {
    const level = (ef: number) => computeAiPriority(runWithLvef(ef)).level;
    // 40.4 reads 40: reduced. 40.5 reads 41: mildly reduced.
    expect(level(40.4)).toBe('URGENT');
    expect(level(40.5)).toBe('HIGH');
    // 49.4 reads 49: mildly reduced. 49.5 reads 50: preserved.
    expect(level(49.4)).toBe('HIGH');
    expect(level(49.5)).toBe('ROUTINE');
  });

  it('carries the fraction, for the screen to word', () => {
    const { reasons } = computeAiPriority(runWithLvef(25));
    expect(reasons[0].params?.efPercent).toBeCloseTo(25, 6);
  });

  it('orders runs of one level by how low the fraction is', () => {
    const low = computeAiPriority(runWithLvef(15));
    const high = computeAiPriority(runWithLvef(38));
    expect(low.level).toBe('URGENT');
    expect(high.level).toBe('URGENT');
    expect(low.score).toBeGreaterThan(high.score);
    expect(low.score).toBeLessThanOrEqual(100);
    // The bands do not overlap: a lower fraction in a lower level never outranks.
    expect(high.score).toBeGreaterThanOrEqual(70);
    expect(computeAiPriority(runWithLvef(45)).score).toBeLessThan(70);
    expect(computeAiPriority(runWithLvef(45)).score).toBeGreaterThanOrEqual(40);
    expect(computeAiPriority(runWithLvef(62)).score).toBeLessThan(40);
  });

  it('follows the measures the physician corrected, not the model proposal', () => {
    // The model finds ES at the second phase (LVEF 45 %, mildly reduced); the
    // physician puts it at the third (LVEF 10 %).
    const proposed = buildVolumetry(
      cardioVolumeResult({ factors: [1, 0.55, 0.9, 0.95, 0.97] }),
    );
    const stored = (volumetry: unknown) =>
      JSON.parse(JSON.stringify(volumetry)) as never;

    expect(
      computeAiPriority(runWithLvef(45, { volumetry: stored(proposed) })).level,
    ).toBe('HIGH');
    expect(
      computeAiPriority(
        runWithLvef(45, {
          volumetry: stored(applyCorrection(proposed, { esPhase: 2 })),
        }),
      ),
    ).toMatchObject({
      level: 'URGENT',
      reasons: [{ code: 'VOLUME_LVEF_REDUCED' }],
    });
  });

  it('flags measures to check first: ES above ED, or no fraction to read', () => {
    const swapped = JSON.parse(
      JSON.stringify(
        applyCorrection(buildVolumetry(cardioVolumeResult()), {
          edPhase: 3,
          esPhase: 0,
        }),
      ),
    ) as never;
    // A negative fraction is not "reduced": the phases are to be checked.
    expect(
      computeAiPriority(runWithLvef(60, { volumetry: swapped })),
    ).toMatchObject({
      level: 'HIGH',
      reasons: [{ code: 'VOLUME_ES_EXCEEDS_ED' }],
    });

    const empty = JSON.parse(
      JSON.stringify(
        buildVolumetry(
          cardioVolumeResult({
            factors: DEFAULT_FACTORS.map(() => 0),
          }),
        ),
      ),
    ) as never;
    expect(
      computeAiPriority(runWithLvef(60, { volumetry: empty })),
    ).toMatchObject({
      level: 'HIGH',
      reasons: [{ code: 'VOLUME_NOT_MEASURABLE' }],
    });
  });

  it('is ROUTINE for a run without usable measures, decided, or not finished', () => {
    expect(
      computeAiPriority(runWithLvef(20, { volumetry: null })),
    ).toMatchObject({ level: 'ROUTINE' });
    expect(
      computeAiPriority(
        runWithLvef(20, { volumetry: { version: 3 } as never }),
      ),
    ).toMatchObject({ level: 'ROUTINE' });
    expect(
      computeAiPriority(runWithLvef(20, { decisionStatus: 'VALIDATED' })),
    ).toEqual({
      level: 'ROUTINE',
      reasons: [{ code: 'ALREADY_DECIDED' }],
      score: 0,
    });
    expect(
      computeAiPriority(
        runWithLvef(20, { status: AiAnalysisRunStatus.RUNNING }),
      ),
    ).toMatchObject({ reasons: [{ code: 'NO_RESULT' }], score: 0 });
  });

  it('ranks the waiting queue with the other chains, the lowest fraction first', () => {
    const runs = [
      {
        ...runWithLvef(60),
        createdAt: new Date('2026-10-25T08:00:00Z'),
        id: 'normal',
      },
      {
        ...runWithLvef(30),
        createdAt: new Date('2026-10-25T09:00:00Z'),
        id: 'reduced',
      },
      {
        ...runWithLvef(12),
        createdAt: new Date('2026-10-25T10:00:00Z'),
        id: 'very-low',
      },
      {
        ...runWithLvef(45),
        createdAt: new Date('2026-10-25T07:00:00Z'),
        id: 'mild',
      },
    ];
    expect(rankByPriority(runs).map((entry) => entry.run.id)).toEqual([
      'very-low',
      'reduced',
      'mild',
      'normal',
    ]);
    expect(rankByPriority(runs, 'URGENT')).toHaveLength(2);
    expect(rankByPriority(runs, 'HIGH').map((entry) => entry.run.id)).toEqual([
      'mild',
    ]);
  });

  it('reads the volumetry column from the database', () => {
    expect(PRIORITY_RUN_SELECT.volumetry).toBe(true);
  });
});
