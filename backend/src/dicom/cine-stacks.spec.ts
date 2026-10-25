import {
  CINE_STACK_LIMITS,
  detectCineStack,
  detectCineStacks,
  toCineStackView,
} from './cine-stacks';
import { type OrthancInstance, type OrthancSeries } from './orthanc.client';

const ORIENTATION = [1, 0, 0, 0, 1, 0];

const series = (overrides: Partial<OrthancSeries> = {}): OrthancSeries => ({
  description: 'SA cine',
  id: 'series-1',
  instanceIds: [],
  modality: 'MR',
  number: 5,
  seriesInstanceUid: '1.2.3.5',
  ...overrides,
});

/** A cine as scanners number it: the images of a phase, slice after slice, then the next phase. */
function cine(
  slices: number,
  phases: number,
  options: {
    fileSize?: number;
    seriesId?: string;
    stepMm?: number;
  } = {},
): OrthancInstance[] {
  const instances: OrthancInstance[] = [];
  for (let phase = 0; phase < phases; phase += 1) {
    for (let slice = 0; slice < slices; slice += 1) {
      instances.push({
        fileSize: options.fileSize ?? 130_000,
        id: `i-${phase}-${slice}`,
        imageOrientationPatient: ORIENTATION,
        imagePositionPatient: [-100, -90, slice * (options.stepMm ?? 8)],
        instanceNumber: phase * slices + slice + 1,
        numberOfFrames: 1,
        parentSeries: options.seriesId ?? 'series-1',
        parentStudy: 'study-1',
        sopInstanceUid: `1.2.${phase}.${slice}`,
      });
    }
  }
  return instances;
}

describe('detectCineStack', () => {
  it('finds the slices and phases of a cine, images ordered by position then phase', () => {
    // Shuffled, as Orthanc may list them.
    const instances = cine(10, 25).reverse();

    const stack = detectCineStack(series(), instances);

    expect(stack).toMatchObject({
      bytes: 250 * 130_000,
      description: 'SA cine',
      instances: 250,
      number: 5,
      phases: 25,
      refusal: null,
      seriesId: 'series-1',
      shortAxisLikely: true,
      slices: 10,
    });
    expect(stack?.instanceIds).toHaveLength(250);
    // The first slice position, the 25 phases in order, then the next position.
    expect(stack?.instanceIds.slice(0, 3)).toEqual(['i-0-0', 'i-1-0', 'i-2-0']);
    expect(stack?.instanceIds[25]).toBe('i-0-1');
  });

  it('works along any normal, not only the z axis (a short axis is oblique)', () => {
    // Short-axis plane: row (0.8, 0.5, 0.33...) and column ... are arbitrary but orthonormal.
    const row = [0.6, 0.8, 0];
    const column = [-0.4, 0.3, 0.866];
    const normal = [
      row[1] * column[2] - row[2] * column[1],
      row[2] * column[0] - row[0] * column[2],
      row[0] * column[1] - row[1] * column[0],
    ];
    const instances = cine(8, 20).map((instance, index) => {
      const slice = index % 8;
      return {
        ...instance,
        imageOrientationPatient: [...row, ...column],
        imagePositionPatient: normal.map((value) => value * slice * 8 + 5),
      };
    });

    expect(detectCineStack(series(), instances)).toMatchObject({
      phases: 20,
      refusal: null,
      slices: 8,
    });
  });

  it('is not a cine when every position holds one image (an ordinary stack)', () => {
    expect(detectCineStack(series(), cine(20, 1))).toBeNull();
  });

  it('is not listed when it is not an MRI, has no images, or has no geometry', () => {
    expect(detectCineStack(series({ modality: 'CT' }), cine(10, 5))).toBeNull();
    expect(detectCineStack(series(), [])).toBeNull();
    const withoutPosition = cine(10, 5).map((instance) => ({
      ...instance,
      imagePositionPatient: null,
    }));
    expect(detectCineStack(series(), withoutPosition)).toBeNull();
  });

  it('treats images less than 0.5 mm apart as one position, as the service does', () => {
    const instances = cine(8, 10).map((instance, index) => ({
      ...instance,
      // A tiny jitter per phase: the same position.
      imagePositionPatient: [
        -100,
        -90,
        (index % 8) * 8 + Math.floor(index / 8) * 0.02,
      ],
    }));
    expect(detectCineStack(series(), instances)).toMatchObject({
      phases: 10,
      refusal: null,
      slices: 8,
    });
  });

  describe('refusals, before anything is downloaded', () => {
    it('a multi-frame series', () => {
      const instances = cine(8, 5).map((instance) => ({
        ...instance,
        numberOfFrames: 25,
      }));
      expect(detectCineStack(series(), instances)?.refusal).toBe('MULTIFRAME');
    });

    it('fewer than 6 slices', () => {
      expect(detectCineStack(series(), cine(5, 20))).toMatchObject({
        refusal: 'TOO_FEW_SLICES',
        slices: 5,
      });
      expect(detectCineStack(series(), cine(6, 20))?.refusal).toBeNull();
    });

    it('more than 30 phases', () => {
      expect(detectCineStack(series(), cine(8, 31))).toMatchObject({
        phases: 31,
        refusal: 'TOO_MANY_PHASES',
      });
      expect(detectCineStack(series(), cine(8, 30))?.refusal).toBeNull();
    });

    it('a slice with fewer phases than the others', () => {
      const instances = cine(8, 10).filter(
        (instance) => instance.id !== 'i-9-3',
      );
      expect(detectCineStack(series(), instances)).toMatchObject({
        phases: 10,
        refusal: 'UNEQUAL_PHASES',
      });
    });

    it('slices that are not parallel', () => {
      const instances = cine(8, 10).map((instance, index) =>
        index % 8 === 7
          ? { ...instance, imageOrientationPatient: [1, 0, 0, 0, 0.7, 0.7] }
          : instance,
      );
      expect(detectCineStack(series(), instances)?.refusal).toBe(
        'MIXED_ORIENTATION',
      );
    });

    it('more than 600 images', () => {
      expect(
        detectCineStack(series(), cine(25, 25, { fileSize: 1000 }))?.refusal,
      ).toBe('TOO_MANY_FILES');
      expect(
        detectCineStack(series(), cine(30, 20, { fileSize: 1000 }))?.refusal,
      ).toBeNull();
    });

    it('more than 300 MiB', () => {
      const big = Math.ceil(CINE_STACK_LIMITS.maxBytes / 250) + 1;
      expect(
        detectCineStack(series(), cine(10, 25, { fileSize: big }))?.refusal,
      ).toBe('TOO_LARGE');
    });
  });

  it('reads the view of the series from its description', () => {
    const view = (description: string | null) =>
      detectCineStack(series({ description }), cine(8, 10))?.shortAxisLikely;
    expect(view('cine_sa_retro')).toBe(true);
    expect(view('Cine Short Axis')).toBe(true);
    expect(view('CINE PETIT AXE')).toBe(true);
    expect(view('cine_4ch')).toBe(false);
    expect(view('Cine 2 chambers LAX')).toBe(false);
    expect(view('cine')).toBeNull();
    expect(view(null)).toBeNull();
  });
});

describe('detectCineStacks', () => {
  it('lists the cine series of a study by number, and leaves the others out', () => {
    const instances = [
      ...cine(8, 10, { seriesId: 'b' }),
      ...cine(1, 1, { seriesId: 'localizer' }),
      ...cine(8, 12, { seriesId: 'a' }),
    ];

    const stacks = detectCineStacks(
      [
        series({ id: 'b', number: 9 }),
        series({ id: 'localizer', number: 1 }),
        series({ id: 'a', number: 4 }),
        series({ id: 'empty', number: 2 }),
      ],
      instances,
    );

    expect(stacks.map((stack) => [stack.seriesId, stack.phases])).toEqual([
      ['a', 12],
      ['b', 10],
    ]);
  });

  it('gives a view without the identifiers of the images', () => {
    const [stack] = detectCineStacks([series()], cine(8, 10));
    const view = toCineStackView(stack);
    expect(view).not.toHaveProperty('instanceIds');
    expect(view).toMatchObject({ instances: 80, seriesId: 'series-1' });
  });
});
