import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { buildMeasureChart, formatDelta, formatMeasure, type MeasureInfo, type TimelineItem } from "./ai-timeline";

const item = (runId: string, createdAt: string, value: number | null): TimelineItem => ({
  comparison: null,
  createdAt,
  decisionLabel: null,
  decisionStatus: null,
  hasMask: true,
  hasOverlay: false,
  hasSlice: false,
  hasTrace: false,
  label: null,
  labels: null,
  measures: { lvEfPercent: value },
  model: {
    id: null,
    segmentationId: "cardio-seg-acdc-unet-effb4",
    segmentationWeightsSha256: "a".repeat(64),
    weightsSha256: "a".repeat(64),
  },
  pixelSpacingMm: [1.5, 1.5],
  runId,
  slice: null,
  source: "dicom",
  sourceDocumentId: `document-${runId}`,
});

// Spaces of every kind (the narrow no-break ones of the locale included) read as one.
const plain = (text: string) => text.replace(/\s/g, " ");

describe("the measures of a cine over time", () => {
  it("writes a volume, a mass, a flow and a fraction with their unit, in French", () => {
    expect(plain(formatMeasure(43.2, "ml", "fr"))).toBe("43 ml");
    expect(plain(formatMeasure(34.02, "g", "fr"))).toBe("34 g");
    expect(plain(formatMeasure(1.149, "l_min", "fr"))).toBe("1,1 L/min");
    expect(plain(formatMeasure(38, "percent", "fr"))).toBe("38 %");
    expect(formatMeasure(null, "percent", "fr")).toBe("—");
  });

  it("keeps the other units as they were", () => {
    expect(plain(formatMeasure(0.9, "probability", "fr"))).toBe("90 %");
    expect(plain(formatMeasure(150, "px", "fr"))).toBe("150 px");
    expect(plain(formatMeasure(3624.75, "mm2", "fr"))).toBe("3 624,8 mm²");
  });

  it("writes in the Arabic locale without failing", () => {
    for (const unit of ["ml", "g", "l_min", "percent"] as const) {
      expect(formatMeasure(38, unit, "ar")).toMatch(/\S/);
    }
  });

  it("writes a change of fraction in points, of a volume in ml", () => {
    const delta = (value: number) => ({ percent: null, value });
    expect(plain(formatDelta(delta(12), "percent", "fr"))).toBe("+12 pt");
    expect(plain(formatDelta(delta(4), "g", "fr"))).toBe("+4 g");
    expect(plain(formatDelta(delta(0.3), "l_min", "fr"))).toBe("+0,3 L/min");
    expect(plain(formatDelta(delta(-12), "ml", "fr"))).toMatch(/^[-−]12 ml$/);
    expect(plain(formatDelta(delta(-8), "percent", "fr"))).toMatch(/^[-−]8 pt$/);
    expect(formatDelta(null, "ml", "fr")).toBe("—");
  });

  it("draws a fraction between its extremes with some room, never under 0", () => {
    const measure: MeasureInfo = { area: false, key: "lvEfPercent", unit: "percent" };
    const chart = buildMeasureChart(
      [item("a", "2026-01-10T08:00:00Z", 38), item("b", "2026-04-10T08:00:00Z", 45), item("c", "2026-07-10T08:00:00Z", null)],
      measure,
    );
    expect(chart?.points).toHaveLength(2);
    expect(chart?.min).toBeGreaterThanOrEqual(0);
    expect(chart?.min).toBeLessThan(38);
    expect(chart?.max).toBeGreaterThan(45);
    // The later, higher fraction is drawn higher.
    expect(chart?.points[1].y).toBeGreaterThan(chart?.points[0].y ?? 1);
  });

  it("names every measure of the chain in both languages", () => {
    const keys = ["lvEfPercent", "lvEdvMl", "lvEsvMl", "lvSvMl", "rvEfPercent", "rvEdvMl", "rvEsvMl", "lvMassG", "cardiacOutputLMin"];
    for (const locale of ["fr", "ar"] as const) {
      for (const key of keys) {
        const path = `aiAnalyses.evolution.measures.${key}`;
        expect(translate(dictionaries[locale], path)).not.toBe(path);
      }
    }
  });
});
