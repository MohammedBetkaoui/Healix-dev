import { canLaunchCineMeasure, defaultCineStack, measurableStacks } from "./dicom-analysis";
import { type CineStack } from "./dicom.types";

const stack = (id: string, overrides: Partial<CineStack> = {}): CineStack => ({
  bytes: 3_000_000,
  description: null,
  instances: 250,
  number: 5,
  phases: 25,
  refusal: null,
  seriesId: id,
  seriesInstanceUid: `1.2.${id}`,
  shortAxisLikely: null,
  slices: 10,
  ...overrides,
});

describe("the cine series of a study", () => {
  it("keeps the ones the volumetry can read", () => {
    const stacks = [stack("a"), stack("b", { refusal: "MULTIFRAME" }), stack("c")];
    expect(measurableStacks(stacks).map((item) => item.seriesId)).toEqual(["a", "c"]);
  });

  it("offers a short axis first, then a series that does not say, then any readable one", () => {
    expect(
      defaultCineStack([stack("long", { shortAxisLikely: false }), stack("unknown"), stack("sa", { shortAxisLikely: true })])?.seriesId,
    ).toBe("sa");
    expect(defaultCineStack([stack("long", { shortAxisLikely: false }), stack("unknown")])?.seriesId).toBe("unknown");
    expect(defaultCineStack([stack("long", { shortAxisLikely: false })])?.seriesId).toBe("long");
  });

  it("never offers a series the volumetry cannot read", () => {
    expect(defaultCineStack([stack("sa", { refusal: "TOO_FEW_SLICES", shortAxisLikely: true })])).toBeNull();
    expect(defaultCineStack([])).toBeNull();
  });

  describe("the button", () => {
    const ready = { busy: false, consentMissing: false, readOnly: false, shortAxisConfirmed: true, stack: stack("a") };

    it("starts a series that can be read, confirmed as a short axis, for an account that may write", () => {
      expect(canLaunchCineMeasure(ready)).toBe(true);
    });

    it("waits for each of its conditions", () => {
      expect(canLaunchCineMeasure({ ...ready, stack: null })).toBe(false);
      expect(canLaunchCineMeasure({ ...ready, stack: stack("a", { refusal: "UNEQUAL_PHASES" }) })).toBe(false);
      expect(canLaunchCineMeasure({ ...ready, shortAxisConfirmed: false })).toBe(false);
      expect(canLaunchCineMeasure({ ...ready, consentMissing: true })).toBe(false);
      expect(canLaunchCineMeasure({ ...ready, readOnly: true })).toBe(false);
      expect(canLaunchCineMeasure({ ...ready, busy: true })).toBe(false);
    });
  });
});
