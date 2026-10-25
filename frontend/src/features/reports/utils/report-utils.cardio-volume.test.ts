import { aiResults } from "./report-utils";

const summary = {
  cardiacOutputLMin: 1.15,
  lvEdvMl: 43.2,
  lvEfPercent: 38,
  lvEsvMl: 26.784,
  lvMassG: 34.02,
  lvefClass: "reduced" as const,
  modified: false,
  rvEfPercent: 19.4,
};

describe("the results of a cine volumetry in the reports center", () => {
  it("lists the measures in force with the abbreviations the reports use", () => {
    expect(
      aiResults({ pipeline: "cardio-volume-mri", predictions: { configSha256: "b".repeat(64) }, volumetry: summary }),
    ).toEqual([
      { code: "LVEF", label: "LVEF", value: "38 %" },
      { code: "EDV", label: "EDV", value: "43 ml" },
      { code: "ESV", label: "ESV", value: "27 ml" },
      { code: "MASS", label: "MASS", value: "34 g" },
      { code: "RVEF", label: "RVEF", value: "19 %" },
    ]);
  });

  it("leaves out a fraction that could not be measured", () => {
    const results = aiResults({
      pipeline: "cardio-volume-mri",
      predictions: null,
      volumetry: { ...summary, lvEfPercent: null, rvEfPercent: null },
    });
    expect(results.map((result) => result.code)).toEqual(["EDV", "ESV", "MASS"]);
  });

  it("lists nothing without the summary (a report made before it, a damaged column)", () => {
    expect(aiResults({ pipeline: "cardio-volume-mri", predictions: { configSha256: "b".repeat(64) } })).toEqual([]);
    expect(aiResults({ pipeline: "cardio-volume-mri", predictions: null, volumetry: null })).toEqual([]);
  });

  it("does not change the other chains", () => {
    expect(aiResults({ pipeline: "brain", predictions: [{ label: "meningioma", probability: 0.9 }] })).toEqual([
      { code: "meningioma", label: "meningioma", score: 0.9, value: "meningioma" },
    ]);
  });
});
