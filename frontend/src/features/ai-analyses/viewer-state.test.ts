import {
  clampZoom,
  initialViewerState,
  keyToViewerAction,
  toViewerFilter,
  VIEWER_FILTER_MAX,
  VIEWER_MAX_ZOOM,
  VIEWER_MIN_ZOOM,
  VIEWER_PAN_STEP,
  viewerReducer,
  type ViewerAction,
  type ViewerState,
} from "./viewer-state";

const run = (actions: ViewerAction[], from: ViewerState = initialViewerState) =>
  actions.reduce(viewerReducer, from);

const repeat = (action: ViewerAction, times: number) =>
  Array.from({ length: times }, () => action);

describe("viewer zoom bounds (25 % – 800 %)", () => {
  it("clamps any value into the bounds", () => {
    expect(VIEWER_MIN_ZOOM).toBe(0.25);
    expect(VIEWER_MAX_ZOOM).toBe(8);
    expect(clampZoom(0.01)).toBe(0.25);
    expect(clampZoom(100)).toBe(8);
    expect(clampZoom(2)).toBe(2);
  });

  it("stops zooming in at 800 % and out at 25 %", () => {
    expect(run(repeat({ type: "zoomIn" }, 50)).zoom).toBe(VIEWER_MAX_ZOOM);
    expect(run(repeat({ type: "zoomOut" }, 50)).zoom).toBe(VIEWER_MIN_ZOOM);
    expect(run([{ type: "zoomBy", factor: 1000 }]).zoom).toBe(VIEWER_MAX_ZOOM);
    expect(run([{ type: "zoomBy", factor: 0 }]).zoom).toBe(VIEWER_MIN_ZOOM);
  });

  it("falls back to 100 % on a non-finite zoom", () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(run([{ type: "zoomBy", factor: Number.POSITIVE_INFINITY }]).zoom).toBe(1);
  });

  it("zooms in then out back to the same level", () => {
    expect(run([{ type: "zoomIn" }, { type: "zoomOut" }]).zoom).toBeCloseTo(1);
  });
});

describe("viewer reset", () => {
  it("restores zoom, pan, filters and inversion", () => {
    const changed = run([
      { type: "zoomIn" },
      { type: "pan", dx: 30, dy: -10 },
      { type: "setBrightness", value: 160 },
      { type: "setContrast", value: 40 },
      { type: "toggleInvert" },
    ]);

    expect(changed).not.toEqual(initialViewerState);
    expect(viewerReducer(changed, { type: "reset" })).toEqual(initialViewerState);
  });

  it("is bound to the 0 key", () => {
    expect(keyToViewerAction("0")).toEqual({ type: "reset" });
  });
});

describe("viewer filters", () => {
  it("clamps brightness and contrast to 0–200 %", () => {
    expect(run([{ type: "setBrightness", value: 500 }]).brightness).toBe(VIEWER_FILTER_MAX);
    expect(run([{ type: "setContrast", value: -20 }]).contrast).toBe(0);
  });

  it("builds the CSS filter, with invert only when on", () => {
    expect(toViewerFilter(initialViewerState)).toBe("brightness(100%) contrast(100%)");
    expect(toViewerFilter(run([{ type: "toggleInvert" }]))).toBe(
      "brightness(100%) contrast(100%) invert(1)",
    );
  });
});

describe("viewer keyboard", () => {
  it("maps the documented shortcuts", () => {
    expect(keyToViewerAction("+")).toEqual({ type: "zoomIn" });
    expect(keyToViewerAction("=")).toEqual({ type: "zoomIn" });
    expect(keyToViewerAction("-")).toEqual({ type: "zoomOut" });
    expect(keyToViewerAction("i")).toEqual({ type: "toggleInvert" });
    expect(keyToViewerAction("I")).toEqual({ type: "toggleInvert" });
    expect(keyToViewerAction("ArrowRight")).toEqual({ type: "pan", dx: -VIEWER_PAN_STEP, dy: 0 });
    expect(keyToViewerAction("ArrowUp")).toEqual({ type: "pan", dx: 0, dy: VIEWER_PAN_STEP });
  });

  it("ignores other keys", () => {
    expect(keyToViewerAction("a")).toBeNull();
    expect(keyToViewerAction("Tab")).toBeNull();
    expect(keyToViewerAction("Enter")).toBeNull();
  });
});
