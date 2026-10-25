import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";

import {
  correctedVolumetryFixture,
  modelMeasures,
  volumetryFixture,
} from "./volumetry.fixtures";
import {
  curveGeometry,
  draftChanges,
  draftFromVolumetry,
  getCorrectionErrorKey,
  imagePhaseNumber,
  imagesDifferFromPhases,
  knownCorrectionErrorCodes,
  lvefClassOf,
  middleSlice,
  niceMaximum,
  parseTypedNumber,
  phaseNumber,
  phaseTimeMs,
  sliceNumber,
  toAutomaticPayload,
  toCorrectionPayload,
  toggleExcludedSlice,
  validateVolumetryDraft,
  visibleVolumeRows,
  volumeRows,
  volumetryNotices,
} from "./volumetry";

describe("lvefClassOf", () => {
  it("reads the 2021 ESC classes: reduced up to 40 %, mildly reduced 41 to 49 %, preserved from 50 %", () => {
    expect(lvefClassOf(25)).toBe("reduced");
    expect(lvefClassOf(40)).toBe("reduced");
    expect(lvefClassOf(41)).toBe("mildlyReduced");
    expect(lvefClassOf(49)).toBe("mildlyReduced");
    expect(lvefClassOf(50)).toBe("preserved");
    expect(lvefClassOf(65)).toBe("preserved");
  });

  it("reads the fraction rounded to the unit, as it is reported", () => {
    expect(lvefClassOf(40.4)).toBe("reduced");
    expect(lvefClassOf(40.5)).toBe("mildlyReduced");
    expect(lvefClassOf(49.4)).toBe("mildlyReduced");
    expect(lvefClassOf(49.5)).toBe("preserved");
  });

  it("has no class without a fraction", () => {
    expect(lvefClassOf(null)).toBeNull();
    expect(lvefClassOf(Number.NaN)).toBeNull();
    expect(lvefClassOf(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("agrees with the class the backend computed for the same fraction", () => {
    expect(lvefClassOf(modelMeasures.lv.efPercent)).toBe(modelMeasures.lvefClass);
  });
});

describe("numbering", () => {
  it("shows phases and slices from 1, the base being slice 1", () => {
    expect(phaseNumber(0)).toBe(1);
    expect(sliceNumber(0)).toBe(1);
    expect(sliceNumber(5)).toBe(6);
  });

  it("numbers the images by the phase of the model", () => {
    const volumetry = volumetryFixture({ images: { edPhase: 1, esPhase: 4, slices: 6 } });
    expect(imagePhaseNumber(volumetry, "ed")).toBe(2);
    expect(imagePhaseNumber(volumetry, "es")).toBe(5);
  });

  it("gives the time of a phase when the stack had one", () => {
    expect(phaseTimeMs(volumetryFixture(), 2)).toBe(320);
    expect(phaseTimeMs(volumetryFixture({ phaseTimesMs: null }), 2)).toBeNull();
  });
});

describe("the rows of the table", () => {
  it("lists the measures in the order they are read, the left ventricle first", () => {
    expect(volumeRows.map((row) => row.key)).toEqual([
      "lvEdv",
      "lvEsv",
      "lvSv",
      "lvEf",
      "lvMass",
      "cardiacOutput",
      "rvEdv",
      "rvEsv",
      "rvEf",
    ]);
  });

  it("reads each value and its indexed value from the measures", () => {
    const value = (key: string) => volumeRows.find((row) => row.key === key);
    expect(value("lvEdv")?.of(modelMeasures)).toBe(43.2);
    expect(value("lvEsv")?.of(modelMeasures)).toBe(26.784);
    expect(value("lvEf")?.of(modelMeasures)).toBe(38);
    expect(value("lvMass")?.of(modelMeasures)).toBe(34.02);
    expect(value("rvEf")?.of(modelMeasures)).toBe(19);
    expect(value("lvEdv")?.indexed?.of(modelMeasures)).toBeCloseTo(22.74, 2);
    expect(value("cardiacOutput")?.indexed?.of(modelMeasures)).toBeCloseTo(0.6048, 3);
    // The ejection fraction has no value per m².
    expect(value("lvEf")?.indexed).toBeUndefined();
  });

  it("leaves out the cardiac output without a heart rate, and nothing else", () => {
    expect(visibleVolumeRows(modelMeasures).map((row) => row.key)).toContain("cardiacOutput");
    const withoutRate = { ...modelMeasures, cardiacOutputLMin: null, heartRateBpm: null };
    const keys = visibleVolumeRows(withoutRate).map((row) => row.key);
    expect(keys).not.toContain("cardiacOutput");
    expect(keys).toHaveLength(volumeRows.length - 1);
  });
});

describe("volumetryNotices", () => {
  it("says nothing of a stack with nothing to check", () => {
    expect(volumetryNotices(volumetryFixture())).toEqual([]);
  });

  it("names what is to be checked: the inferred order, the warnings of the service, ES above ED", () => {
    const volumetry = volumetryFixture({
      sliceOrderInferred: true,
      warnings: [
        { code: "irregular_slice_spacing", maxMm: 10, medianMm: 8, minMm: 6 },
        { code: "duplicate_images_ignored", count: 3 },
        { code: "a_future_warning" },
      ],
    });
    volumetry.effective.measures = { ...modelMeasures, warnings: ["es_volume_exceeds_ed"] };

    expect(volumetryNotices(volumetry)).toEqual([
      { key: "sliceOrderInferred", params: {} },
      { key: "irregular_slice_spacing", params: { maxMm: 10, medianMm: 8, minMm: 6 } },
      { key: "duplicate_images_ignored", params: { count: 3 } },
      { key: "unknown", params: { code: "a_future_warning" } },
      { key: "es_volume_exceeds_ed", params: {} },
    ]);
  });
});

describe("the correction form", () => {
  it("opens on what is in force, the model's or the physician's", () => {
    expect(draftFromVolumetry(volumetryFixture())).toEqual({
      edPhase: 0,
      esPhase: 3,
      excludedSlices: [],
      heightCm: "",
      weightKg: "",
    });
    expect(draftFromVolumetry(correctedVolumetryFixture())).toMatchObject({ esPhase: 1, excludedSlices: [0] });
  });

  it("does not hold the arrays of the volumetry it was made from", () => {
    const volumetry = correctedVolumetryFixture();
    const draft = draftFromVolumetry(volumetry);
    draft.excludedSlices.push(4);
    expect(volumetry.effective.excludedSlices).toEqual([0]);
  });

  it("puts a slice in or out of the volumes, keeping the list in slice order", () => {
    const draft = draftFromVolumetry(volumetryFixture());
    const out = toggleExcludedSlice(toggleExcludedSlice(draft, 4), 1);
    expect(out.excludedSlices).toEqual([1, 4]);
    expect(toggleExcludedSlice(out, 4).excludedSlices).toEqual([1]);
    expect(draft.excludedSlices).toEqual([]);
  });

  it("reads a typed number, a comma being a decimal point", () => {
    expect(parseTypedNumber("171")).toBe(171);
    expect(parseTypedNumber(" 71,5 ")).toBe(71.5);
    expect(parseTypedNumber("")).toBeNull();
    expect(parseTypedNumber("   ")).toBeNull();
    expect(parseTypedNumber("abc")).toBeNull();
    expect(parseTypedNumber("1e999")).toBeNull();
  });

  describe("validation, as the backend does", () => {
    const volumetry = volumetryFixture();
    const valid = draftFromVolumetry(volumetry);

    it("accepts a draft with nothing typed, or a height and a weight within range", () => {
      expect(validateVolumetryDraft(valid, volumetry)).toEqual({});
      expect(validateVolumetryDraft({ ...valid, heightCm: "171", weightKg: "73,5" }, volumetry)).toEqual({});
      expect(validateVolumetryDraft({ ...valid, heightCm: "30", weightKg: "2" }, volumetry)).toEqual({});
      expect(validateVolumetryDraft({ ...valid, heightCm: "250", weightKg: "400" }, volumetry)).toEqual({});
    });

    it("refuses every slice left out", () => {
      expect(validateVolumetryDraft({ ...valid, excludedSlices: [0, 1, 2, 3, 4, 5] }, volumetry)).toEqual({ slices: "none" });
      expect(validateVolumetryDraft({ ...valid, excludedSlices: [0, 1, 2, 3, 4] }, volumetry)).toEqual({});
    });

    it("wants both the height and the weight, or neither", () => {
      expect(validateVolumetryDraft({ ...valid, heightCm: "171" }, volumetry)).toEqual({ body: "both" });
      expect(validateVolumetryDraft({ ...valid, weightKg: "73" }, volumetry)).toEqual({ body: "both" });
    });

    it("keeps them in the range the backend takes", () => {
      expect(validateVolumetryDraft({ ...valid, heightCm: "29", weightKg: "73" }, volumetry)).toEqual({ body: "invalidHeight" });
      expect(validateVolumetryDraft({ ...valid, heightCm: "251", weightKg: "73" }, volumetry)).toEqual({ body: "invalidHeight" });
      expect(validateVolumetryDraft({ ...valid, heightCm: "x", weightKg: "73" }, volumetry)).toEqual({ body: "invalidHeight" });
      expect(validateVolumetryDraft({ ...valid, heightCm: "171", weightKg: "1,9" }, volumetry)).toEqual({ body: "invalidWeight" });
      expect(validateVolumetryDraft({ ...valid, heightCm: "171", weightKg: "401" }, volumetry)).toEqual({ body: "invalidWeight" });
    });
  });

  describe("what is sent", () => {
    const volumetry = volumetryFixture();
    const draft = draftFromVolumetry(volumetry);

    it("sends nothing when nothing changed", () => {
      expect(toCorrectionPayload(draft, volumetry)).toBeNull();
      expect(draftChanges(draft, volumetry)).toEqual({ body: false, phases: false, slices: false });
    });

    it("sends only what differs from what is in force", () => {
      expect(toCorrectionPayload({ ...draft, esPhase: 1 }, volumetry)).toEqual({ esPhase: 1 });
      expect(toCorrectionPayload({ ...draft, edPhase: 2 }, volumetry)).toEqual({ edPhase: 2 });
      expect(toCorrectionPayload({ ...draft, excludedSlices: [4, 0] }, volumetry)).toEqual({ excludedSlices: [0, 4] });
      expect(toCorrectionPayload({ ...draft, esPhase: 1, excludedSlices: [0] }, volumetry)).toEqual({
        esPhase: 1,
        excludedSlices: [0],
      });
    });

    it("sends the height and the weight as numbers, once", () => {
      expect(toCorrectionPayload({ ...draft, heightCm: "171,5", weightKg: "73" }, volumetry)).toEqual({
        heightCm: 171.5,
        weightKg: 73,
      });
      expect(draftChanges({ ...draft, heightCm: "171", weightKg: "73" }, volumetry).body).toBe(true);
    });

    it("sends nothing that the backend would refuse", () => {
      expect(toCorrectionPayload({ ...draft, excludedSlices: [0, 1, 2, 3, 4, 5] }, volumetry)).toBeNull();
      expect(toCorrectionPayload({ ...draft, heightCm: "171" }, volumetry)).toBeNull();
    });

    it("compares to the physician's version once there is one", () => {
      const corrected = correctedVolumetryFixture();
      const same = draftFromVolumetry(corrected);
      expect(toCorrectionPayload(same, corrected)).toBeNull();
      expect(toCorrectionPayload({ ...same, excludedSlices: [] }, corrected)).toEqual({ excludedSlices: [] });
      // Back to the model's ES: still a change from what is in force.
      expect(toCorrectionPayload({ ...same, esPhase: 3 }, corrected)).toEqual({ esPhase: 3 });
    });

    it("asks for the automatic phases of the slices kept, with those slices", () => {
      expect(toAutomaticPayload({ ...draft, excludedSlices: [4, 1] })).toEqual({ automatic: true, excludedSlices: [1, 4] });
      expect(toAutomaticPayload(draft)).toEqual({ automatic: true, excludedSlices: [] });
    });
  });

  it("explains the refusals of the correction, and any other as unknown", () => {
    const refused = (code: unknown) =>
      new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
        config: { headers: new AxiosHeaders() },
        data: { code },
        headers: {},
        status: 409,
        statusText: "Conflict",
      } as AxiosResponse);
    for (const code of knownCorrectionErrorCodes) expect(getCorrectionErrorKey(refused(code))).toBe(code);
    expect(getCorrectionErrorKey(refused("SOMETHING_ELSE"))).toBe("unknown");
    expect(getCorrectionErrorKey(refused(undefined))).toBe("unknown");
    expect(getCorrectionErrorKey(new Error("network"))).toBe("unknown");
    expect(getCorrectionErrorKey(null)).toBe("unknown");
  });
});

describe("the curve", () => {
  it("rounds the top of the axis to a round number at or above the highest volume", () => {
    expect(niceMaximum(43.2)).toBe(45);
    expect(niceMaximum(120)).toBe(150);
    expect(niceMaximum(200)).toBe(200);
    expect(niceMaximum(9.2)).toBe(9.5);
    // Never an axis of nothing.
    expect(niceMaximum(0)).toBe(1);
    for (const volume of [3, 43.2, 99, 100, 127, 480, 999]) {
      expect(niceMaximum(volume)).toBeGreaterThanOrEqual(volume);
    }
  });

  it("places every phase left to right, the largest volume highest", () => {
    const geometry = curveGeometry([43.2, 34.56, 30.24, 26.784, 36.72]);
    expect(geometry.points).toHaveLength(5);
    const { plot, points } = geometry;
    expect(points[0].x).toBe(plot.left);
    expect(points[4].x).toBe(plot.right);
    const xs = points.map((point) => point.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    // SVG y grows downwards: the largest volume has the smallest y.
    const ys = points.map((point) => point.y);
    expect(Math.min(...ys)).toBe(points[0].y);
    expect(Math.max(...ys)).toBe(points[3].y);
    for (const point of points) {
      expect(point.y).toBeGreaterThanOrEqual(plot.top);
      expect(point.y).toBeLessThanOrEqual(plot.bottom);
    }
  });

  it("draws the axis from 0 to its top in four equal steps", () => {
    const { maximum, plot, yTicks } = curveGeometry([43.2, 30]);
    expect(yTicks.map((tick) => tick.value)).toEqual([0, 0.25, 0.5, 0.75, 1].map((fraction) => maximum * fraction));
    expect(yTicks[0].y).toBe(plot.bottom);
    expect(yTicks[4].y).toBe(plot.top);
  });

  it("labels few phases of a long cine, and always the last", () => {
    const long = curveGeometry(Array.from({ length: 30 }, (_, index) => 100 + index));
    expect(long.xTicks.length).toBeLessThan(15);
    expect(long.xTicks[0].phase).toBe(0);
    expect(long.xTicks[long.xTicks.length - 1].phase).toBe(29);
    const short = curveGeometry([1, 2, 3]);
    expect(short.xTicks.map((tick) => tick.phase)).toEqual([0, 1, 2]);
  });

  it("copes with one phase, a flat curve and an empty one", () => {
    expect(curveGeometry([10]).points[0].x).toBe(curveGeometry([10]).plot.left);
    for (const curve of [[0, 0, 0], [], [5, 5]]) {
      const geometry = curveGeometry(curve);
      for (const point of geometry.points) {
        expect(Number.isFinite(point.x)).toBe(true);
        expect(Number.isFinite(point.y)).toBe(true);
      }
    }
  });
});

describe("the images", () => {
  it("opens on the middle of the slices kept", () => {
    expect(middleSlice(volumetryFixture())).toBe(2);
    expect(middleSlice(correctedVolumetryFixture())).toBe(3);
    const lone = volumetryFixture();
    lone.effective.excludedSlices = [0, 1, 2, 3, 4];
    expect(middleSlice(lone)).toBe(5);
    lone.effective.excludedSlices = [0, 1, 2, 3, 4, 5];
    expect(middleSlice(lone)).toBe(2);
  });

  it("says when the images are not those of the phases in force", () => {
    expect(imagesDifferFromPhases(volumetryFixture())).toBe(false);
    expect(imagesDifferFromPhases(correctedVolumetryFixture())).toBe(true);
    const edMoved = volumetryFixture();
    edMoved.effective = { ...edMoved.effective, edPhase: 1 };
    expect(imagesDifferFromPhases(edMoved)).toBe(true);
  });
});
