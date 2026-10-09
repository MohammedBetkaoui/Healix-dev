import {
  buildTrackingSearch,
  DEFAULT_TRACKING_STATE,
  formatRate,
  isUncertainProbability,
  parseTrackingState,
  pendingAge,
  periodParams,
  ratesHidden,
  type TrackingState,
  worklistParams,
} from "./runs-tracking";

const state = (overrides: Partial<TrackingState>): TrackingState => ({ ...DEFAULT_TRACKING_STATE, ...overrides });

describe("URL filters", () => {
  it("opens on the worklist of pending runs", () => {
    expect(parseTrackingState(new URLSearchParams(""))).toEqual(DEFAULT_TRACKING_STATE);
    expect(DEFAULT_TRACKING_STATE.decision).toBe("pending");
    expect(buildTrackingSearch(DEFAULT_TRACKING_STATE)).toBe("");
  });

  it("writes only what differs from the defaults, and reads it back", () => {
    const filtered = state({ decision: "CORRECTED", from: "2026-10-01", mine: true, page: 3, status: "SUCCEEDED", to: "2026-10-09" });
    const search = buildTrackingSearch(filtered);

    expect(search).toBe("?decision=CORRECTED&status=SUCCEEDED&from=2026-10-01&to=2026-10-09&mine=1&page=3");
    expect(parseTrackingState(new URLSearchParams(search))).toEqual(filtered);
    expect(buildTrackingSearch(state({ period: "all", tab: "agreement" }))).toBe("?tab=agreement&period=all");
  });

  it("ignores values it does not know", () => {
    expect(
      parseTrackingState(new URLSearchParams("tab=x&decision=APPROVED&status=DONE&from=hier&to=2026-13&page=-2&mine=yes&period=7d")),
    ).toEqual(DEFAULT_TRACKING_STATE);
  });

  it("turns the filters into API parameters", () => {
    expect(worklistParams(DEFAULT_TRACKING_STATE)).toEqual({
      decision: "pending",
      from: undefined,
      limit: 20,
      page: 1,
      requestedBy: undefined,
      status: undefined,
      to: undefined,
    });

    const params = worklistParams(state({ decision: "all", from: "2026-10-01", mine: true, page: 2, status: "FAILED", to: "2026-10-09" }));
    expect(params).toEqual(expect.objectContaining({ decision: undefined, page: 2, requestedBy: "me", status: "FAILED" }));
    // Whole local days, both included.
    expect(params.from).toBe(new Date("2026-10-01T00:00:00.000").toISOString());
    expect(params.to).toBe(new Date("2026-10-09T23:59:59.999").toISOString());
  });

  it("starts a period at the beginning of the local day N days ago", () => {
    const now = new Date(2026, 9, 9, 15, 30);

    expect(periodParams("30d", now)).toEqual({ from: new Date(2026, 8, 9).toISOString() });
    expect(periodParams("all", now)).toEqual({});
  });
});

describe("rates, always with their counts", () => {
  const reliable = { count: 8, insufficientData: false, rate: 8 / 12, total: 12 };

  it("formats a rate with its counts", () => {
    expect(formatRate(reliable, "fr")).toEqual({ count: "8", percent: "66,7 %", total: "12" });
  });

  it("shows no rate under the minimum of decisions", () => {
    expect(formatRate({ count: 3, insufficientData: true, rate: null, total: 9 }, "fr")).toBeNull();
    // Nor any rate at all once the summary lacks decisions.
    expect(formatRate(reliable, "fr", { insufficientData: true })).toBeNull();
    expect(formatRate(reliable, "fr", { insufficientData: false })).not.toBeNull();
    expect(ratesHidden({ insufficientData: true })).toBe(true);
  });
});

describe("worklist cells", () => {
  it("marks a result as uncertain under 0.90, as the result page does", () => {
    expect(isUncertainProbability(0.89)).toBe(true);
    expect(isUncertainProbability(0.9)).toBe(false);
    expect(isUncertainProbability(null)).toBe(false);
  });

  it("gives the age of the oldest pending run in hours, then days", () => {
    expect(pendingAge(null)).toBeNull();
    expect(pendingAge(5)).toEqual({ unit: "hours", value: 5 });
    expect(pendingAge(47)).toEqual({ unit: "hours", value: 47 });
    expect(pendingAge(75)).toEqual({ unit: "days", value: 3 });
  });
});
