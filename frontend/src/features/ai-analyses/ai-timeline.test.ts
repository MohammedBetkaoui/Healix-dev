import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import {
  availableMeasures,
  buildMeasureChart,
  busiestPipeline,
  compareTimelineItems,
  countSucceeded,
  daysBetween,
  defaultPair,
  deltaOf,
  formatDay,
  formatDelta,
  formatMeasure,
  formatPercentChange,
  hasAreaMeasures,
  orderPair,
  resultText,
  type MeasureInfo,
  type TimelineItem,
} from "./ai-timeline";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const fr = (key: string) => translate(dictionaries.fr, key);

const brainMeasures: MeasureInfo[] = [
  { area: false, key: "topProbability", unit: "probability" },
  { area: true, key: "maskAreaPx", unit: "px" },
  { area: false, key: "maskAreaRatio", unit: "ratio" },
];
const heartMeasures: MeasureInfo[] = [
  { area: true, key: "lvAreaMm2", unit: "mm2" },
  { area: true, key: "lvPixels", unit: "px" },
];
const breastMeasures: MeasureInfo[] = [{ area: false, key: "malignancyScore", unit: "score" }];

let sequence = 0;
function item(overrides: Partial<TimelineItem> = {}): TimelineItem {
  sequence += 1;
  return {
    comparison: null,
    createdAt: new Date(Date.UTC(2026, 0, sequence, 10)).toISOString(),
    decisionLabel: null,
    decisionStatus: null,
    hasMask: false,
    hasOverlay: false,
    hasSlice: false,
    hasTrace: false,
    label: "meningioma",
    labels: null,
    measures: { maskAreaPx: null, maskAreaRatio: null, topProbability: 0.9 },
    model: { id: "brain-model", segmentationId: null, segmentationWeightsSha256: null, weightsSha256: SHA_A },
    pixelSpacingMm: null,
    runId: `run-${sequence}`,
    source: "image",
    sourceDocumentId: "doc-1",
    ...overrides,
  };
}

const areaItem = (maskAreaPx: number, overrides: Partial<TimelineItem> = {}) =>
  item({ measures: { maskAreaPx, maskAreaRatio: maskAreaPx / 65_536, topProbability: 0.9 }, ...overrides });
const heartItem = (lvPixels: number, lvAreaMm2: number | null, overrides: Partial<TimelineItem> = {}) =>
  item({
    label: null,
    measures: { lvAreaMm2, lvPixels },
    model: { id: "seg", segmentationId: null, segmentationWeightsSha256: null, weightsSha256: SHA_A },
    pixelSpacingMm: lvAreaMm2 === null ? null : [0.5, 0.5],
    source: "dicom",
    ...overrides,
  });

describe("deltaOf", () => {
  it("gives the difference in value and in %", () => {
    expect(deltaOf(1200, 1000)).toEqual({ percent: 20, value: 200 });
    expect(deltaOf(800, 1000)).toEqual({ percent: -20, value: -200 });
  });

  it("has no percentage against 0, and nothing without a value", () => {
    expect(deltaOf(300, 0)).toEqual({ percent: null, value: 300 });
    expect(deltaOf(null, 5)).toBeNull();
    expect(deltaOf(5, null)).toBeNull();
  });

  it("is not spoiled by floating point", () => {
    expect(deltaOf(0.3, 0.1)).toEqual({ percent: 200, value: 0.2 });
  });
});

describe("compareTimelineItems: the same rules as the API, for any two runs", () => {
  const compare = (measures: MeasureInfo[], earlier: TimelineItem, later: TimelineItem) => compareTimelineItems(measures, later, earlier);

  it("compares the later run with the earlier one", () => {
    const earlier = areaItem(1000);
    const later = areaItem(1200);

    expect(compare(brainMeasures, earlier, later)).toMatchObject({
      deltas: { maskAreaPx: { percent: 20, value: 200 } },
      previousRunId: earlier.runId,
    });
  });

  it("is reliable for the same weights, the same source and a spacing", () => {
    const comparison = compare(heartMeasures, heartItem(4000, 1000), heartItem(4400, 1100));

    expect(comparison).toMatchObject({ caveats: [], reliable: true });
    expect(comparison.deltas.lvAreaMm2).toEqual({ percent: 10, value: 100 });
  });

  describe("another model", () => {
    it("is flagged when the weights differ, or the id", () => {
      const other = { id: "brain-model", segmentationId: null, segmentationWeightsSha256: null, weightsSha256: SHA_B };

      expect(compare(breastMeasures, item(), item({ model: other })).caveats).toEqual(["MODEL_CHANGED"]);
      expect(compare(breastMeasures, item(), item({ model: { ...other, id: "x", weightsSha256: SHA_A } })).caveats).toEqual(["MODEL_CHANGED"]);
    });

    it("is flagged when the weights of a run are unknown: it cannot be said they are the same", () => {
      const unknown = { id: "brain-model", segmentationId: null, segmentationWeightsSha256: null, weightsSha256: null };

      expect(compare(breastMeasures, item({ model: unknown }), item({ model: unknown })).caveats).toEqual(["MODEL_CHANGED"]);
    });

    it("looks at the brain segmenter only when both runs used one", () => {
      const segmented = (sha: string) => item({ model: { id: "brain-model", segmentationId: "seg", segmentationWeightsSha256: sha, weightsSha256: SHA_A } });

      expect(compare(breastMeasures, segmented(SHA_A), segmented(SHA_B)).caveats).toContain("MODEL_CHANGED");
      expect(compare(breastMeasures, segmented(SHA_A), segmented(SHA_A)).caveats).not.toContain("MODEL_CHANGED");
      expect(compare(breastMeasures, segmented(SHA_A), item()).caveats).not.toContain("MODEL_CHANGED");
    });
  });

  describe("no pixel spacing", () => {
    it("is flagged when two brain runs have their areas compared: an image carries none", () => {
      expect(compare(brainMeasures, areaItem(1000), areaItem(1200)).caveats).toEqual(["NO_PIXEL_SPACING"]);
    });

    it("is not flagged when no area is compared", () => {
      expect(compare(brainMeasures, item(), areaItem(1200)).caveats).toEqual([]);
      expect(compare(breastMeasures, item(), item()).caveats).toEqual([]);
    });

    it("is flagged for an MRI when either run has no spacing, and keeps the pixels", () => {
      const without = heartItem(4400, null);
      const comparison = compare(heartMeasures, heartItem(4000, 1000), without);

      expect(comparison.caveats).toEqual(["NO_PIXEL_SPACING"]);
      expect(comparison.deltas).toEqual({ lvAreaMm2: null, lvPixels: { percent: 10, value: 400 } });
      expect(compare(heartMeasures, without, heartItem(4000, 1000)).caveats).toEqual(["NO_PIXEL_SPACING"]);
    });
  });

  describe("a different source", () => {
    it("is flagged when the kind changes, either way", () => {
      expect(compare(breastMeasures, item({ source: "dicom" }), item({ source: "image" })).caveats).toEqual(["SOURCE_CHANGED"]);
      expect(compare(breastMeasures, item({ source: "image" }), item({ source: "dicom" })).caveats).toEqual(["SOURCE_CHANGED"]);
    });

    it("is not flagged for the same kind", () => {
      expect(compare(breastMeasures, item({ source: "dicom" }), item({ source: "dicom" })).caveats).toEqual([]);
    });
  });

  it("flags every cause at once, in a fixed order", () => {
    const before = heartItem(4000, null, { source: "dicom" });
    const after = heartItem(4400, null, {
      model: { id: "seg", segmentationId: null, segmentationWeightsSha256: null, weightsSha256: SHA_B },
      source: "image",
    });

    expect(compare(heartMeasures, before, after)).toMatchObject({ caveats: ["MODEL_CHANGED", "NO_PIXEL_SPACING", "SOURCE_CHANGED"], reliable: false });
  });

  it("reports a change of result: a class, a result, or the set of ECG classes in any order", () => {
    expect(compare(breastMeasures, item({ label: "meningioma" }), item({ label: "notumor" })).labelChanged).toBe(true);
    expect(compare(breastMeasures, item({ label: "glioma" }), item({ label: "glioma" })).labelChanged).toBe(false);
    expect(compare(breastMeasures, item({ label: null, labels: ["MI", "STTC"] }), item({ label: null, labels: ["STTC", "MI"] })).labelChanged).toBe(false);
    expect(compare(breastMeasures, item({ label: null, labels: ["MI"] }), item({ label: null, labels: ["MI", "CD"] })).labelChanged).toBe(true);
  });

  it("agrees with the API for neighbours: what the backend sends is what the screen computes", () => {
    const earlier = areaItem(1000);
    const later = areaItem(1200);
    // What GET /patients/:id/ai-timeline answers for `later`.
    const fromApi = { caveats: ["NO_PIXEL_SPACING"], deltas: { maskAreaPx: { percent: 20, value: 200 }, maskAreaRatio: { percent: 20, value: 0.003052 }, topProbability: { percent: 0, value: 0 } }, labelChanged: false, previousRunId: earlier.runId, reliable: false };

    expect(compare(brainMeasures, earlier, later)).toEqual(fromApi);
  });
});

describe("choosing the two runs", () => {
  const items = [item(), item(), item()];

  it("opens on the last two, the earlier one first", () => {
    expect(defaultPair(items)).toEqual({ earlierId: items[1].runId, laterId: items[2].runId });
    expect(defaultPair([items[0]])).toBeNull();
    expect(defaultPair([])).toBeNull();
  });

  it("puts two picked runs in the order of their dates, whichever way they were picked", () => {
    expect(orderPair(items, items[2].runId, items[0].runId)).toEqual({ earlier: items[0], later: items[2] });
    expect(orderPair(items, items[0].runId, items[2].runId)).toEqual({ earlier: items[0], later: items[2] });
  });

  it("refuses the same run twice, and a run it does not know", () => {
    expect(orderPair(items, items[0].runId, items[0].runId)).toBeNull();
    expect(orderPair(items, items[0].runId, "nope")).toBeNull();
  });

  it("opens the tab on the chain with the most successful runs", () => {
    const runs = [
      { pipeline: "cardio-ecg", status: "SUCCEEDED" },
      { pipeline: "brain", status: "SUCCEEDED" },
      { pipeline: "brain", status: "SUCCEEDED" },
      { pipeline: "brain", status: "FAILED" },
      { pipeline: "cardio-ecg", status: "FAILED" },
    ] as const;

    expect(busiestPipeline(runs)).toBe("brain");
    expect(busiestPipeline([])).toBe("brain");
    expect(busiestPipeline([], "cardio-ecg")).toBe("cardio-ecg");
    expect(countSucceeded(runs, "brain")).toBe(2);
    expect(countSucceeded(runs, "cardio-ecg")).toBe(1);
    expect(countSucceeded(runs, "pathology-breast")).toBe(0);
  });

  it("offers the measures at least one run has a value for", () => {
    const measures = availableMeasures({ items: [item(), areaItem(1000)], measures: brainMeasures }).map((measure) => measure.key);

    expect(measures).toEqual(["topProbability", "maskAreaPx", "maskAreaRatio"]);
    expect(availableMeasures({ items: [item()], measures: brainMeasures }).map((measure) => measure.key)).toEqual(["topProbability"]);
  });
});

describe("what is shown", () => {
  it("writes each measure with its unit", () => {
    expect(formatMeasure(0.9, "probability", "fr")).toMatch(/90\s?%/);
    expect(formatMeasure(0.0183, "ratio", "fr")).toMatch(/1,83\s?%/);
    expect(formatMeasure(0.6, "score", "fr")).toBe("0,60");
    expect(formatMeasure(1000.5, "mm2", "fr")).toMatch(/1\s?000,5 mm²/);
    expect(formatMeasure(1200, "px", "fr")).toMatch(/1\s?200 px/);
    expect(formatMeasure(null, "px", "fr")).toBe("—");
  });

  it("signs a difference, and counts a share in points", () => {
    expect(formatDelta({ percent: 20, value: 200 }, "px", "fr")).toMatch(/\+200 px/);
    expect(formatDelta({ percent: -5, value: -12.5 }, "mm2", "fr")).toMatch(/[-−]12,5 mm²/);
    expect(formatDelta({ percent: 0, value: 0 }, "px", "fr")).toBe("0 px");
    expect(formatDelta({ percent: 11, value: 0.1 }, "probability", "fr")).toMatch(/\+10 pt/);
    expect(formatDelta({ percent: 20, value: 0.12 }, "score", "fr")).toBe("+0,12");
    expect(formatDelta(null, "px", "fr")).toBe("—");
  });

  it("writes the change in %, or a dash against 0", () => {
    expect(formatPercentChange({ percent: 20, value: 200 }, "fr")).toBe("+20 %");
    expect(formatPercentChange({ percent: -4.55, value: -1 }, "fr")).toMatch(/[-−]4,5 %|[-−]4,6 %/);
    expect(formatPercentChange({ percent: null, value: 300 }, "fr")).toBe("—");
    expect(formatPercentChange(null, "fr")).toBe("—");
  });

  it("writes a day in Algiers, in the language", () => {
    // 23:30 UTC is already the next day in Algiers (UTC+1).
    expect(formatDay("2026-10-24T22:30:00.000Z", "fr")).toMatch(/24 octobre 2026/);
    expect(formatDay("2026-10-24T23:30:00.000Z", "fr")).toMatch(/25 octobre 2026/);
    expect(formatDay("2026-10-24T10:00:00.000Z", "ar")).toContain("2026");
  });

  it("names the result of a run: a class, the classes of an ECG, or nothing", () => {
    expect(resultText(item({ label: "meningioma" }), fr)).toBe("Méningiome");
    expect(resultText(item({ label: "malignant" }), fr)).toBe("Malin");
    expect(resultText(item({ label: null, labels: ["MI", "CD"] }), fr)).toBe("Infarctus du myocarde, Trouble de la conduction");
    expect(resultText(item({ label: null, labels: [] }), fr)).toBe("—");
    expect(resultText(item({ label: null, labels: null }), fr)).toBe("—");
  });

  it("counts the days between two runs by the day they were made", () => {
    expect(daysBetween("2026-01-01T23:00:00.000Z", "2026-01-02T01:00:00.000Z")).toBe(1);
    expect(daysBetween("2026-01-01T01:00:00.000Z", "2026-01-01T23:00:00.000Z")).toBe(0);
    expect(daysBetween("2026-03-01T10:00:00.000Z", "2026-01-01T10:00:00.000Z")).toBe(0);
    expect(daysBetween("2026-01-01T10:00:00.000Z", "2026-04-11T10:00:00.000Z")).toBe(100);
  });

  it("warns about a 2D surface only for the chains whose measures are areas", () => {
    expect(hasAreaMeasures("brain")).toBe(true);
    expect(hasAreaMeasures("cardio-seg-mri")).toBe(true);
    expect(hasAreaMeasures("pathology-breast")).toBe(false);
    expect(hasAreaMeasures("cardio-ecg")).toBe(false);
    expect(hasAreaMeasures("pathology-nuclei")).toBe(false);
  });

  it("says in both languages that a 2D surface does not replace a volume and that slices must be comparable", () => {
    expect(dictionaries.fr.aiAnalyses.evolution.warning2d).toBe(
      "Une surface 2D ne remplace pas une mesure volumétrique ; les coupes doivent être comparables.",
    );
    expect(dictionaries.ar.aiAnalyses.evolution.warning2d).toMatch(/المقاطع/);
  });
});

describe("buildMeasureChart", () => {
  const dated = (day: number, maskAreaPx: number | null, overrides: Partial<TimelineItem> = {}) =>
    item({
      createdAt: new Date(Date.UTC(2026, 0, day, 10)).toISOString(),
      measures: { maskAreaPx, maskAreaRatio: null, topProbability: 0.9 },
      ...overrides,
    });
  const px = brainMeasures[1];

  it("places the points in time at their real distance from each other", () => {
    const chart = buildMeasureChart([dated(1, 100), dated(11, 110), dated(31, 120)], px);

    expect(chart?.points.map((point) => point.x)).toEqual([0, 1 / 3, 1]);
  });

  it("puts a lone point in the middle", () => {
    expect(buildMeasureChart([dated(1, 100)], px)?.points[0]).toMatchObject({ x: 0.5, y: 0.5 });
  });

  it("leaves out the runs with no value for the measure", () => {
    const chart = buildMeasureChart([dated(1, 100), dated(2, null), dated(3, 120)], px);

    expect(chart?.points.map((point) => point.value)).toEqual([100, 120]);
    expect(buildMeasureChart([dated(1, null)], px)).toBeNull();
    expect(buildMeasureChart([], px)).toBeNull();
  });

  it("draws an area between its extremes with some room, never under 0", () => {
    const chart = buildMeasureChart([dated(1, 1000), dated(2, 1200)], px)!;

    expect(chart.min).toBeCloseTo(970);
    expect(chart.max).toBeCloseTo(1230);
    expect(chart.min).toBeGreaterThan(0);
    expect(buildMeasureChart([dated(1, 10), dated(2, 1000)], px)!.min).toBeGreaterThanOrEqual(0);
    expect(chart.points.map((point) => point.y)).toEqual([expect.closeTo(0.115, 2), expect.closeTo(0.885, 2)]);
  });

  it("gives equal areas a visible axis, not a flat division", () => {
    const chart = buildMeasureChart([dated(1, 500), dated(2, 500)], px)!;

    expect(chart.max).toBeGreaterThan(chart.min);
    expect(chart.points.map((point) => point.y)).toEqual([0.5, 0.5]);
  });

  it("draws a probability or a score on 0 to 1, and a share from 0 to a round top", () => {
    const probability = buildMeasureChart([item()], brainMeasures[0])!;
    const ratio = buildMeasureChart([item({ measures: { maskAreaRatio: 0.0183 } })], brainMeasures[2])!;

    expect([probability.min, probability.max]).toEqual([0, 1]);
    expect(probability.points[0].y).toBeCloseTo(0.9);
    expect([ratio.min, ratio.max]).toEqual([0, 0.02]);
  });

  it("gives five ticks from the bottom to the top", () => {
    const chart = buildMeasureChart([dated(1, 100), dated(2, 200)], px)!;

    expect(chart.ticks).toHaveLength(5);
    expect(chart.ticks[0]).toBeCloseTo(chart.min);
    expect(chart.ticks[4]).toBeCloseTo(chart.max);
  });

  it("marks the points whose comparison with the run before cannot be trusted", () => {
    const comparison = (reliable: boolean) => ({ caveats: reliable ? [] : ["MODEL_CHANGED" as const], deltas: {}, labelChanged: false, previousRunId: "x", reliable });
    const chart = buildMeasureChart([dated(1, 100), dated(2, 110, { comparison: comparison(true) }), dated(3, 120, { comparison: comparison(false) })], px)!;

    expect(chart.points.map((point) => point.unreliable)).toEqual([false, false, true]);
  });
});
