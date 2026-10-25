import {
  cardioVolumeAreas,
  cardioVolumeResult,
  CARDIO_VOLUME_GAP_MM,
} from './cardio-volume.fixtures';
import {
  applyCorrection,
  automaticFor,
  buildVolumetry,
  effectiveMeasures,
  effectiveState,
  isModified,
  readVolumetry,
  volumetryImageName,
  volumetryResponse,
} from './volumetry';
import { VolumetryInputError } from './volumetry-measures';

// The fixture: 5 phases of 6 slices, 8 mm apart. At ED (phase 0) the LV areas
// add up to 5400 mm², at ES (phase 3) to 62 % of that: EDV 43.2 ml, ESV 26.784 ml,
// EF 38 %. The myocardium at ED adds up to 4050 mm²: 32.4 ml, 34.02 g.
const base = () => buildVolumetry(cardioVolumeResult());

describe('buildVolumetry', () => {
  it('keeps the areas, the curve and the model measures, and nothing is corrected yet', () => {
    const volumetry = base();

    expect(volumetry.auto.edPhase).toBe(0);
    expect(volumetry.auto.esPhase).toBe(3);
    expect(volumetry.auto.measures.lv.edvMl).toBeCloseTo(43.2, 10);
    expect(volumetry.auto.measures.lv.efPercent).toBeCloseTo(38, 10);
    expect(volumetry.auto.measures.lvMassG).toBeCloseTo(34.02, 10);
    expect(volumetry.auto.measures.lvefClass).toBe('reduced');
    expect(volumetry.corrected).toBeNull();
    expect(volumetry.areasMm2).toHaveLength(5);
    expect(volumetry.images).toEqual({ edPhase: 0, esPhase: 3, slices: 6 });
    expect(isModified(volumetry)).toBe(false);
  });

  it('survives the JSON column it is stored in', () => {
    const volumetry = base();
    const stored: unknown = JSON.parse(JSON.stringify(volumetry));
    expect(readVolumetry(stored)).toEqual(volumetry);
  });
});

describe('readVolumetry', () => {
  it('reads nothing from a value that is not a volumetry', () => {
    for (const value of [
      null,
      undefined,
      42,
      'text',
      [],
      {},
      { version: 2 },
      { ...base(), version: 2 },
      { ...base(), areasMm2: 'x' },
      { ...base(), auto: null },
      { ...base(), images: undefined },
    ]) {
      expect(readVolumetry(value)).toBeNull();
    }
  });
});

describe('effectiveState', () => {
  it('is the model as long as nothing was corrected', () => {
    const state = effectiveState(base());
    expect(state).toMatchObject({
      bsaM2: 1.9,
      bsaSource: 'dicom',
      edPhase: 0,
      esPhase: 3,
      excludedSlices: [],
    });
    expect(effectiveMeasures(base())).toEqual(base().auto.measures);
  });

  it('has no body surface source without a body surface', () => {
    const volumetry = buildVolumetry(cardioVolumeResult({ bsaM2: null }));
    expect(effectiveState(volumetry)).toMatchObject({
      bsaM2: null,
      bsaSource: null,
    });
  });
});

describe('applyCorrection', () => {
  const now = new Date('2026-10-25T09:00:00.000Z');

  it('moves ES and calculates the measures again from the stored areas', () => {
    const volumetry = applyCorrection(base(), { esPhase: 1 }, now);

    // ES at phase 1 (80 % of the areas): ESV 34.56 ml, EF 20 %.
    const { lv } = effectiveMeasures(volumetry);
    expect(lv.edvMl).toBeCloseTo(43.2, 10);
    expect(lv.esvMl).toBeCloseTo(34.56, 10);
    expect(lv.efPercent).toBeCloseTo(20, 10);
    expect(volumetry.corrected).toMatchObject({
      correctedAt: '2026-10-25T09:00:00.000Z',
      edPhase: 0,
      esPhase: 1,
      excludedSlices: [],
    });
    expect(isModified(volumetry)).toBe(true);
    // The model's proposal is untouched, next to it.
    expect(volumetry.auto).toEqual(base().auto);
    expect(volumetry.areasMm2).toEqual(base().areasMm2);
  });

  it('leaves a slice out of every sum', () => {
    const volumetry = applyCorrection(base(), { excludedSlices: [0] }, now);

    // The base (1500 mm² at ED) is out: (5400 - 1500) mm² x 8 mm = 31.2 ml.
    const { lv } = effectiveMeasures(volumetry);
    expect(lv.edvMl).toBeCloseTo(31.2, 10);
    expect(lv.esvMl).toBeCloseTo((3900 * 0.62 * 8) / 1000, 10);
    expect(effectiveState(volumetry).excludedSlices).toEqual([0]);
    expect(effectiveState(volumetry).lvVolumeCurveMl[0]).toBeCloseTo(31.2, 10);
    expect(isModified(volumetry)).toBe(true);
  });

  it('merges successive corrections: what is not named stays as it was', () => {
    const first = applyCorrection(base(), { esPhase: 1 }, now);
    const second = applyCorrection(first, { excludedSlices: [5] }, now);
    expect(second.corrected).toMatchObject({
      edPhase: 0,
      esPhase: 1,
      excludedSlices: [5],
    });
    // [] puts every slice back.
    const third = applyCorrection(second, { excludedSlices: [] }, now);
    expect(third.corrected?.excludedSlices).toEqual([]);
    expect(third.corrected?.esPhase).toBe(1);
  });

  it('is a modification when ED alone, ES alone or the slices alone change', () => {
    expect(isModified(applyCorrection(base(), { edPhase: 1 }, now))).toBe(true);
    expect(isModified(applyCorrection(base(), { esPhase: 4 }, now))).toBe(true);
    expect(
      isModified(applyCorrection(base(), { excludedSlices: [3] }, now)),
    ).toBe(true);
    // Back to what the model proposed: not a modification any more.
    const moved = applyCorrection(base(), { esPhase: 1 }, now);
    expect(isModified(applyCorrection(moved, { esPhase: 3 }, now))).toBe(false);
  });

  it('keeps ED where it is when only ES is named, whatever phase that is', () => {
    const late = buildVolumetry(
      cardioVolumeResult({ factors: [0.7, 0.62, 0.8, 1, 0.9] }),
    );
    expect(late.auto.edPhase).toBe(3);
    const moved = applyCorrection(late, { esPhase: 0 }, now);
    expect(moved.corrected?.edPhase).toBe(3);
    expect(moved.corrected?.esPhase).toBe(0);
    expect(moved.corrected?.measures.lv.edvMl).toBeCloseTo(43.2, 10);
  });

  it('keeps the slices left out when a later correction names only a phase', () => {
    const left = applyCorrection(base(), { excludedSlices: [2] }, now);
    const moved = applyCorrection(left, { esPhase: 1 }, now);
    expect(moved.corrected?.excludedSlices).toEqual([2]);
    expect(moved.corrected?.esPhase).toBe(1);
    expect(effectiveMeasures(moved).lv.edvMl).toBeCloseTo(
      ((5400 - 1050) * 8) / 1000,
      10,
    );
  });

  it('indexes with a typed height and weight, and keeps neither', () => {
    const volumetry = applyCorrection(
      buildVolumetry(cardioVolumeResult({ bsaM2: null })),
      { heightCm: 171, weightKg: 73 },
      now,
    );

    const bsa = Math.sqrt((171 * 73) / 3600);
    expect(volumetry.corrected?.bsaM2).toBeCloseTo(bsa, 12);
    expect(volumetry.corrected?.bsaSource).toBe('manual');
    expect(effectiveMeasures(volumetry).indexed?.lvEdvMlM2).toBeCloseTo(
      43.2 / bsa,
      10,
    );
    // Not a correction of what was measured.
    expect(isModified(volumetry)).toBe(false);
    // Neither value is stored.
    const json = JSON.stringify(volumetry);
    expect(json).not.toMatch(/[:,[](?:171|73)[,}\]]/);
    expect(json).not.toMatch(/height|weight/i);
  });

  it('keeps the surface the DICOM gave when only the phases change', () => {
    const volumetry = applyCorrection(base(), { esPhase: 2 }, now);
    expect(volumetry.corrected).toMatchObject({
      bsaM2: 1.9,
      bsaSource: 'dicom',
    });
  });

  it('refuses what has no meaning for this stack', () => {
    const refused = (correction: Parameters<typeof applyCorrection>[1]) =>
      expect(() => applyCorrection(base(), correction, now)).toThrow(
        VolumetryInputError,
      );
    refused({ edPhase: 5 });
    refused({ esPhase: -1 });
    refused({ edPhase: 1.5 });
    refused({ excludedSlices: [6] });
    refused({ excludedSlices: [0, 1, 2, 3, 4, 5] });
    refused({ heightCm: 170 });
    refused({ weightKg: 70 });
    refused({ heightCm: 0, weightKg: 70 });
    refused({ heightCm: 170, weightKg: -3 });
  });

  it('does not change the volumetry it was given', () => {
    const volumetry = base();
    const before = JSON.stringify(volumetry);
    applyCorrection(volumetry, { esPhase: 1, excludedSlices: [2] }, now);
    expect(JSON.stringify(volumetry)).toBe(before);
  });
});

describe('automaticFor', () => {
  it('gives the phases of the largest and the smallest LV volume of the slices kept', () => {
    expect(automaticFor(base())).toEqual([0, 3]);
    expect(automaticFor(base(), [0, 1])).toEqual([0, 3]);
  });

  it('follows a stack whose cycle starts elsewhere', () => {
    const volumetry = buildVolumetry(
      cardioVolumeResult({ factors: [0.7, 0.62, 0.8, 1, 0.9] }),
    );
    expect(automaticFor(volumetry)).toEqual([3, 1]);
  });
});

describe('volumetryResponse', () => {
  it('sends the curve, the measures and the ED and ES areas, not the areas of every phase', () => {
    // A long cine: 30 phases.
    const factors = Array.from(
      { length: 30 },
      (_, i) => 1 - 0.38 * Math.sin((i / 29) * Math.PI),
    );
    const volumetry = applyCorrection(
      buildVolumetry(cardioVolumeResult({ factors })),
      { esPhase: 1 },
    );
    const response = volumetryResponse(volumetry);

    expect(response).not.toHaveProperty('areasMm2');
    expect(response.areas.ed).toEqual(cardioVolumeAreas(factors)[0]);
    expect(response.areas.es).toEqual(cardioVolumeAreas(factors)[1]);
    expect(response.modified).toBe(true);
    expect(response.effective.esPhase).toBe(1);
    expect(response.auto.esPhase).toBe(volumetry.auto.esPhase);
    expect(response.images.slices).toBe(6);
    expect(response.slices).toHaveLength(6);
    expect(response.sliceGapMm).toBe(CARDIO_VOLUME_GAP_MM);
    expect(JSON.stringify(response).length).toBeLessThan(
      JSON.stringify(volumetry).length,
    );
  });
});

describe('volumetryImageName', () => {
  it('numbers the slices on three digits, the shape the storage accepts', () => {
    expect(volumetryImageName('label', 'ed', 0)).toBe('label-ed-000.png');
    expect(volumetryImageName('slice', 'es', 12)).toBe('slice-es-012.png');
    expect(volumetryImageName('slice', 'es', 99)).toMatch(
      /^(?:label|slice)-(?:ed|es)-\d{3}\.png$/,
    );
  });
});
