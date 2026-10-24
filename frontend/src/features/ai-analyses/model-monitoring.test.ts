import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import {
  algiersMonthKey,
  alertedModels,
  buildChartData,
  driftStatus,
  durationParts,
  entryKey,
  formatDuration,
  formatPercent,
  formatPoints,
  hasRuns,
  judgedOf,
  lineSegments,
  modelName,
  monitoringParams,
  monthLabel,
  shiftMonthKey,
  type ModelMonitoring,
  type ModelMonitoringEntry,
  type MonthlyModelStats,
  MONITORING_PERIODS,
} from "./model-monitoring";

const BRAIN = "brain-efficientnetb4-tumor-classification";

const drift = (overrides: Partial<MonthlyModelStats["drift"]> = {}) => ({ alert: false, baselineDecisions: 60, baselineRate: 0.1, deltaPoints: 0, ...overrides });

const month = (monthKey: string, overrides: Partial<MonthlyModelStats> = {}): MonthlyModelStats => ({
  corrected: 2,
  correctionRate: 0.1,
  decided: 20,
  drift: drift(),
  failed: 0,
  medianDecisionMs: 600_000,
  medianInferenceMs: 2_000,
  month: monthKey,
  rejected: 0,
  rejectedInput: 0,
  runs: 20,
  succeeded: 20,
  validated: 18,
  ...overrides,
});

const entry = (overrides: Partial<ModelMonitoringEntry> = {}): ModelMonitoringEntry => ({
  alert: null,
  correctionApplicable: true,
  matrix: null,
  modelId: BRAIN,
  months: [month("2026-08"), month("2026-09"), month("2026-10")],
  pipeline: "brain",
  ...overrides,
});

const board = (models: ModelMonitoringEntry[]): ModelMonitoring => ({
  models,
  period: { from: "2025-10-31T23:00:00.000Z", to: "2026-10-24T10:00:00.000Z" },
  thresholds: { baselineMonths: 3, driftPoints: 10, minDecisions: 20 },
  timeZone: "Africa/Algiers",
});

const t = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);

describe("the period asked for", () => {
  it("reads the month of an instant in Algiers", () => {
    expect(algiersMonthKey(new Date("2026-09-30T22:59:00.000Z"))).toBe("2026-09");
    expect(algiersMonthKey(new Date("2026-09-30T23:30:00.000Z"))).toBe("2026-10");
  });

  it("shifts months across the year", () => {
    expect(shiftMonthKey("2026-02", -3)).toBe("2025-11");
    expect(shiftMonthKey("2026-11", 3)).toBe("2027-02");
  });

  it.each([
    [6, "2026-05-15T12:00:00.000Z"],
    [12, "2025-11-15T12:00:00.000Z"],
    [24, "2024-11-15T12:00:00.000Z"],
  ] as const)("starts %s months back, in the middle of its month", (months, from) => {
    expect(monitoringParams(months, new Date("2026-10-24T10:00:00.000Z"))).toEqual({ from });
  });

  it("counts exactly the months asked for, current one included, whatever the day and the hour", () => {
    // The last night of a month is already the next one in Algiers: 24 months
    // must stay 24 (the backend refuses a 25th).
    const nows = ["2026-10-24T10:00:00.000Z", "2026-10-31T22:30:00.000Z", "2026-10-31T23:30:00.000Z", "2027-01-01T00:10:00.000Z", "2026-03-01T00:00:00.000Z"];

    for (const now of nows) {
      for (const months of MONITORING_PERIODS) {
        const last = algiersMonthKey(new Date(now));
        const first = algiersMonthKey(new Date(monitoringParams(months, new Date(now)).from as string));
        const [fy, fm] = first.split("-").map(Number);
        const [ly, lm] = last.split("-").map(Number);

        expect((ly - fy) * 12 + (lm - fm) + 1).toBe(months);
      }
    }
  });
});

describe("the names", () => {
  it("names a registry model in the user's language", () => {
    expect(modelName(BRAIN, t)).toBe("EfficientNetB4");
  });

  it("shows the raw id of a model the registry does not know", () => {
    expect(modelName("brain-test-model", t)).toBe("brain-test-model");
  });

  it("says when no model answered, instead of showing nothing", () => {
    expect(modelName(null, t)).toBe(dictionaries.fr.aiAnalyses.monitoring.unknownModel);
  });

  it("tells models apart by chain and model", () => {
    expect(entryKey({ modelId: BRAIN, pipeline: "brain" })).not.toBe(entryKey({ modelId: null, pipeline: "brain" }));
    expect(entryKey({ modelId: BRAIN, pipeline: "brain" })).toBe(entryKey({ modelId: BRAIN, pipeline: "brain" }));
  });

  it("labels a month in the language, whatever the zone of the browser", () => {
    expect(monthLabel("2026-10", "fr")).toMatch(/octobre\s+2026/);
    expect(monthLabel("2026-03", "fr", "short")).toMatch(/mars|mars\./);
    expect(monthLabel("2026-10", "ar")).toContain("2026");
  });
});

describe("the formats", () => {
  it("shows a rate as a percentage, or a dash without one", () => {
    expect(formatPercent(0.245, "fr")).toMatch(/24,5\s?%/);
    expect(formatPercent(0, "fr")).toMatch(/0\s?%/);
    expect(formatPercent(null, "fr")).toBe("—");
  });

  it("signs the gap in points", () => {
    expect(formatPoints(14, "fr")).toBe("+14");
    expect(formatPoints(-3.5, "fr")).toMatch(/[-−]3,5/);
    expect(formatPoints(10.5, "fr")).toBe("+10,5");
  });

  it.each([
    [850, "ms", 850],
    [2_340, "seconds", 2.3],
    [59_000, "seconds", 59],
    [720_000, "minutes", 12],
    [3_600_000, "hours", 1],
    [12_600_000, "hours", 3.5],
    [172_800_000, "days", 2],
  ] as const)("reads %s ms in the unit that fits: %s", (ms, unit, value) => {
    expect(durationParts(ms)).toEqual({ unit, value });
  });

  it("writes a duration in both languages, with the figure formatted for it", () => {
    expect(formatDuration(2_340, "fr", t)).toBe("2,3 s");
    expect(formatDuration(720_000, "fr", t)).toBe("12 min");
    expect(formatDuration(null, "fr", t)).toBe("—");
    const ar = (key: string, params?: Record<string, string | number>) => translate(dictionaries.ar, key, params);
    expect(formatDuration(720_000, "ar", ar)).toContain("12");
    expect(formatDuration(720_000, "ar", ar)).not.toContain("{value}");
  });
});

describe("the board", () => {
  it("knows whether there is anything to show, and which models alert", () => {
    expect(hasRuns(board([]))).toBe(false);
    expect(hasRuns(board([entry({ months: [] })]))).toBe(false);
    expect(hasRuns(board([entry()]))).toBe(true);

    const alerting = entry({ alert: { baselineRate: 0.1, deltaPoints: 14, month: "2026-10", rate: 0.24 } });
    expect(alertedModels(board([entry({ modelId: "other" }), alerting]))).toEqual([alerting]);
  });

  it("makes a rate of the decisions on a class: validated and corrected", () => {
    expect(judgedOf({ corrected: 2, validated: 18 })).toBe(20);
  });
});

describe("driftStatus: what the badge of a model says", () => {
  const thresholds = 20;

  it("says the alert when there is one", () => {
    expect(driftStatus(entry({ alert: { baselineRate: 0.1, deltaPoints: 14, month: "2026-10", rate: 0.24 } }), thresholds)).toBe("alert");
  });

  it("says no drift only when the rate could have been judged", () => {
    expect(driftStatus(entry(), thresholds)).toBe("stable");
  });

  it("says why there is no judgement: too few decisions in the month", () => {
    const few = entry({ months: [month("2026-10", { corrected: 1, validated: 9 })] });
    expect(driftStatus(few, thresholds)).toBe("tooFewDecisions");
  });

  it("says why there is no judgement: too few decisions in the months before", () => {
    const thin = entry({ months: [month("2026-10", { drift: drift({ baselineDecisions: 12 }) })] });
    expect(driftStatus(thin, thresholds)).toBe("noBaseline");
    const none = entry({ months: [month("2026-10", { drift: drift({ baselineDecisions: 0, baselineRate: null, deltaPoints: null }) })] });
    expect(driftStatus(none, thresholds)).toBe("noBaseline");
  });

  it("says when the latest month has no decision on a class at all", () => {
    const noDecision = entry({ months: [month("2026-10", { corrected: 0, correctionRate: null, validated: 0 })] });
    expect(driftStatus(noDecision, thresholds)).toBe("noDecision");
    expect(driftStatus(entry({ months: [] }), thresholds)).toBe("noDecision");
  });

  it("is about a map to validate, never a drift", () => {
    expect(driftStatus(entry({ correctionApplicable: false, pipeline: "pathology-nuclei" }), thresholds)).toBe("map");
  });
});

describe("buildChartData", () => {
  it("lays the months of the whole board along the axis, oldest to newest", () => {
    const data = buildChartData(
      board([entry({ months: [month("2026-10"), month("2026-08")].reverse() }), entry({ modelId: "second", months: [month("2026-09")] })]),
    );

    expect(data.months).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(data.series[0].points.map((point) => point.x)).toEqual([0, 0.5, 1]);
  });

  it("puts a lone month in the middle", () => {
    expect(buildChartData(board([entry({ months: [month("2026-10")] })])).series[0].points[0].x).toBe(0.5);
  });

  it("scales the axis to a round rate, never under 20 %", () => {
    expect(buildChartData(board([entry()])).yMax).toBe(0.2);
    expect(buildChartData(board([entry({ months: [month("2026-10", { correctionRate: 0.243 })] })])).yMax).toBe(0.3);
    expect(buildChartData(board([entry({ months: [month("2026-10", { correctionRate: 1 })] })])).yMax).toBe(1);
  });

  it("places each rate between the bottom and the top of the axis", () => {
    const data = buildChartData(board([entry({ months: [month("2026-10", { correctionRate: 0.1 })] })]));

    // 10 % of a 20 % axis.
    expect(data.series[0].points[0].y).toBeCloseTo(0.5);
  });

  it("marks the drift months and carries their counts", () => {
    const data = buildChartData(
      board([entry({ months: [month("2026-09"), month("2026-10", { corrected: 6, correctionRate: 0.24, drift: drift({ alert: true, deltaPoints: 14 }), validated: 19 })] })]),
    );

    expect(data.series[0].points.map((point) => point.drift)).toEqual([false, true]);
    expect(data.series[0].points[1]).toMatchObject({ corrected: 6, judged: 25 });
  });

  it("leaves a gap for a month without a rate, and for a month the model has no run", () => {
    const data = buildChartData(
      board([entry({ months: [month("2026-08"), month("2026-10", { corrected: 0, correctionRate: null, validated: 0 })] }), entry({ modelId: "b", months: [month("2026-09")] })]),
    );
    const [first] = data.series;

    expect(first.points.map((point) => point.rate)).toEqual([0.1, null, null]);
    expect(first.points.map((point) => point.y === null)).toEqual([false, true, true]);
  });

  it("draws the models that can be corrected and have a rate: not the maps, not a model with no decision", () => {
    const data = buildChartData(
      board([
        entry(),
        entry({ correctionApplicable: false, modelId: "nuclei", pipeline: "pathology-nuclei", months: [month("2026-10", { correctionRate: null })] }),
        entry({ modelId: "no-decision", months: [month("2026-10", { correctionRate: null })] }),
      ]),
    );

    expect(data.series.map((series) => series.entry.modelId)).toEqual([BRAIN]);
  });

  it("has no curve without a rate", () => {
    expect(buildChartData(board([])).series).toEqual([]);
  });
});

describe("lineSegments", () => {
  const point = (monthKey: string, y: number | null) => ({ corrected: 0, drift: false, judged: 0, month: monthKey, rate: y, x: 0, y });

  it("breaks the line where a month has no rate", () => {
    const segments = lineSegments([point("1", 0.1), point("2", 0.2), point("3", null), point("4", 0.3), point("5", null)]);

    expect(segments.map((segment) => segment.map((p) => p.month))).toEqual([["1", "2"], ["4"]]);
  });

  it("is empty without any rate", () => {
    expect(lineSegments([point("1", null)])).toEqual([]);
  });
});
