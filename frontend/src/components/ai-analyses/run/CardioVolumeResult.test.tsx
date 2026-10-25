import { renderToStaticMarkup } from "react-dom/server";

import { type AiAnalysisRun, type AiVolumetry, type CardioVolumeEvaluation } from "@/features/ai-analyses/ai-analyses.types";
import { useCardioVolumeEvaluation } from "@/features/ai-analyses/hooks/use-ai-analysis-run";
import { useCorrectVolumetry } from "@/features/ai-analyses/hooks/use-correct-volumetry";
import {
  cineRunFixture,
  correctedVolumetryFixture,
  modelMeasures,
  volumetryFixture,
} from "@/features/ai-analyses/volumetry.fixtures";
import { dictionaries, type Locale } from "@/i18n";
import { translate, type TranslationFunction } from "@/lib/i18n";

import { CardioVolumeResult } from "./CardioVolumeResult";

jest.mock("@/features/ai-analyses/hooks/use-ai-analysis-run", () => ({
  useAiAnalysisVolumeImage: jest.fn(() => ({ data: undefined, isError: false })),
  useCardioVolumeEvaluation: jest.fn(),
}));
jest.mock("@/features/ai-analyses/hooks/use-colorized-label-map", () => ({
  useColorizedCardioSegMap: jest.fn(() => ({ status: "all" })),
}));
jest.mock("@/features/ai-analyses/hooks/use-correct-volumetry", () => ({ useCorrectVolumetry: jest.fn() }));

const tFor =
  (locale: Locale): TranslationFunction =>
  (key, params) =>
    translate(dictionaries[locale], key, params);
const fr = tFor("fr");
const ar = tFor("ar");

/** What a reader sees: no tags, entities decoded, bidi isolates dropped, every kind of space read as one. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[⁦-⁩]/g, "")
    .replace(/\s+/g, " ");

const evaluation: CardioVolumeEvaluation = {
  file: "cardio-volume-latest.json",
  generatedAt: "2026-10-20T10:00:00.000Z",
  lvef: { bias: -0.8, limitsOfAgreement: [-9.1, 7.5], mae: 3.2, n: 50, pearsonR: 0.93 },
  nPatients: 50,
  rvef: { bias: 1.4, limitsOfAgreement: null, mae: 5.1, n: 50, pearsonR: null },
  source: "service",
  weightsSha256: "a".repeat(64),
};

type Options = {
  evaluation?: { data?: CardioVolumeEvaluation | null; isLoading?: boolean };
  locale?: Locale;
  mutation?: object;
  run?: Partial<AiAnalysisRun>;
  volumetry?: AiVolumetry | null;
};

function render(options: Options = {}) {
  const locale = options.locale ?? "fr";
  (useCardioVolumeEvaluation as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, ...options.evaluation });
  (useCorrectVolumetry as jest.Mock).mockReturnValue({
    error: null,
    isError: false,
    isPending: false,
    isSuccess: false,
    mutate: jest.fn(),
    ...options.mutation,
  });
  const run = cineRunFixture({
    ...(options.volumetry === undefined ? {} : { volumetry: options.volumetry ?? undefined }),
    ...options.run,
  });
  return renderToStaticMarkup(
    <CardioVolumeResult locale={locale} patientId="patient-1" run={run} t={locale === "ar" ? ar : fr} />,
  );
}

/** The model's figures with a field changed, as the page shows them. */
function withMeasures(change: Partial<typeof modelMeasures>, volumetry: Partial<AiVolumetry> = {}): AiVolumetry {
  const base = volumetryFixture(volumetry);
  const measures = { ...modelMeasures, ...change };
  return {
    ...base,
    auto: { ...base.auto, measures },
    effective: { ...base.effective, bsaM2: measures.bsaM2, measures },
    ...volumetry,
  };
}

describe("the result of a cardiac cine volumetry", () => {
  describe("by the model", () => {
    const html = render();
    const words = text(html);

    it("puts the ejection fraction first, with its ESC class and where the class comes from", () => {
      expect(html).toMatch(/data-lvef="true"[^>]*>.*38.*%/);
      expect(html).toContain('data-lvef-class="reduced"');
      expect(words).toContain(fr("aiAnalyses.run.volumetry.classLine", { class: fr("aiAnalyses.run.volumetry.classes.reduced") }));
      expect(words).toContain("10.1093/eurheartj/ehab368");
      expect(words).toContain("McDonagh");
    });

    it("says it is the model's proposal and an aid to measurement, never a diagnosis", () => {
      expect(words).toContain(fr("aiAnalyses.run.volumetry.summary.byModel"));
      expect(words).not.toContain(fr("aiAnalyses.run.volumetry.summary.corrected"));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.aid"));
      expect(fr("aiAnalyses.run.volumetry.aid").toLowerCase()).toContain("médecin");
    });

    it("lists the measures with the indexed column, and no column of the model's proposal", () => {
      expect(html).toContain(`>${fr("aiAnalyses.run.volumetry.table.retained")}</th>`);
      expect(html).toContain(`>${fr("aiAnalyses.run.volumetry.table.indexed")}</th>`);
      expect(html).not.toContain(`>${fr("aiAnalyses.run.volumetry.table.proposal")}</th>`);
      for (const row of ["lvEdv", "lvEsv", "lvSv", "lvEf", "rvEdv", "rvEsv", "rvEf", "lvMass", "cardiacOutput"]) {
        expect(words).toContain(fr(`aiAnalyses.run.volumetry.rows.${row}`));
      }
      // 43.2 ml of LV volume at end-diastole, and 22.7 ml/m² of it for a 1.90 m² body: to the unit.
      expect(words).toContain("43 ml");
      expect(words).toContain("23 ml/m²");
      expect(words).not.toContain("43,2");
    });

    it("says which phases are in force and that the model chose them", () => {
      expect(words).toContain(fr("aiAnalyses.run.volumetry.phases.inForce", { ed: 1, es: 4, total: 5 }));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.phases.byModel"));
      expect(words).not.toContain(fr("aiAnalyses.run.volumetry.phases.excluded", { slices: "1" }));
    });

    it("gives the acquisition: step, pixel size, body surface and heart rate", () => {
      expect(words).toContain(fr("aiAnalyses.run.volumetry.acquisition.title"));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.acquisition.stepValue", { value: "8,00" }));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.acquisition.bsaValue", { source: fr("aiAnalyses.run.volumetry.acquisition.bsaDicom"), value: "1,90" }));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.acquisition.heartRateValue", { value: "70" }));
    });

    it("draws the volume curve with both extremes, and leaves a table of it for a screen reader", () => {
      expect(html).toContain('data-volume-curve="true"');
      expect(html).toContain('role="img"');
      expect(html).toMatch(/<polyline[^>]*points="[^"]+"/);
      expect(html).toContain(`>${fr("aiAnalyses.run.volumetry.phases.edShort")}</text>`);
      expect(html).toContain(`>${fr("aiAnalyses.run.volumetry.phases.esShort")}</text>`);
      expect(html).toContain('<table class="sr-only">');
      // The model's own markers are drawn only when the physician moved the phases.
      expect(html).not.toContain('stroke-dasharray="2 2"');
    });

    it("keeps the form open, with its two phase lists and one line per slice", () => {
      expect(html).toContain("<form");
      expect(html.match(/<select/g)).toHaveLength(2);
      expect(html.match(/aria-label="[^"]*"[^>]*checked=""|checked=""[^>]*aria-label/g)).toHaveLength(6);
      expect(words).toContain(fr("aiAnalyses.run.volumetry.correction.base"));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.correction.apex"));
      expect(html).toMatch(/<button type="submit"[^>]*disabled=""/);
    });

    it("shows the slices the model segmented and no raw key anywhere", () => {
      expect(html).toContain('data-volume-images="true"');
      expect(html).not.toMatch(/aiAnalyses\.|dicom\./);
      expect(words).not.toMatch(/NaN|undefined|\[object/);
    });
  });

  describe("once the physician corrected it", () => {
    const html = render({ volumetry: correctedVolumetryFixture() });
    const words = text(html);

    it("shows the figures in force, the model's proposal next to them, and says it was corrected", () => {
      expect(words).toContain(fr("aiAnalyses.run.volumetry.summary.corrected"));
      expect(html).toContain(`>${fr("aiAnalyses.run.volumetry.table.proposal")}</th>`);
      expect(html).toMatch(/data-lvef="true"[^>]*>.*20.*%/);
      expect(words).toMatch(/38 %/);
      expect(words).toContain(fr("aiAnalyses.run.volumetry.summary.proposal", { value: "38 %" }));
    });

    it("names the phases it proposed, the slice left out, and marks the model's phases on the curve", () => {
      expect(words).toContain(fr("aiAnalyses.run.volumetry.phases.inForce", { ed: 1, es: 2, total: 5 }));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.phases.proposed", { ed: 1, es: 4 }));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.phases.excluded", { slices: "1" }));
      expect(html).toContain('stroke-dasharray="2 2"');
    });

    it("starts the form from what is in force", () => {
      // The slice left out is unticked: five of the six lines are.
      expect(html.match(/aria-label="[^"]*"[^>]*checked=""|checked=""[^>]*aria-label/g)).toHaveLength(5);
    });
  });

  describe("when a figure is missing", () => {
    it("hides the indexed column and the cardiac output without a body surface or a heart rate", () => {
      const volumetry = withMeasures(
        { bsaM2: null, cardiacOutputLMin: null, heartRateBpm: null, indexed: null },
        { bsaM2: null, heartRateBpm: null },
      );
      volumetry.effective.bsaSource = "dicom";
      const html = render({ volumetry });
      const words = text(html);

      expect(html).not.toContain(`>${fr("aiAnalyses.run.volumetry.table.indexed")}</th>`);
      expect(words).not.toContain(fr("aiAnalyses.run.volumetry.rows.cardiacOutput"));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.acquisition.bsaNone"));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.acquisition.heartRateNone"));
      expect(words).not.toMatch(/NaN|undefined/);
    });

    it("says the fraction cannot be measured, and gives no class", () => {
      const volumetry = withMeasures({ lv: { ...modelMeasures.lv, efPercent: null }, lvefClass: null });
      const html = render({ volumetry });

      expect(text(html)).toContain(fr("aiAnalyses.run.volumetry.summary.notMeasurable"));
      expect(html).not.toContain("data-lvef-class");
      expect(text(html)).not.toContain("McDonagh");
    });

    it("names the class of a preserved and of a mildly reduced fraction", () => {
      for (const lvefClass of ["preserved", "mildlyReduced"] as const) {
        const html = render({ volumetry: withMeasures({ lvefClass }) });
        expect(html).toContain(`data-lvef-class="${lvefClass}"`);
        expect(text(html)).toContain(fr(`aiAnalyses.run.volumetry.classes.${lvefClass}`));
      }
    });
  });

  describe("what is to be checked", () => {
    it("lists the warnings of the service, the slice order that was inferred, and an ES above the ED", () => {
      const volumetry = withMeasures(
        { warnings: ["es_volume_exceeds_ed"] },
        {
          sliceOrderInferred: true,
          warnings: [
            { code: "irregular_slice_spacing", maxMm: 10.5, medianMm: 8, minMm: 7.5 },
            { code: "duplicate_images_ignored", count: 3 },
            { code: "something_new" },
          ],
        },
      );
      const html = render({ volumetry });
      const words = text(html);

      expect(html).toContain('role="note"');
      expect(words).toContain(fr("aiAnalyses.run.volumetry.notices.title"));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.notices.sliceOrderInferred"));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.notices.irregular_slice_spacing", { maxMm: 10.5, medianMm: 8, minMm: 7.5 }));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.notices.duplicate_images_ignored", { count: 3 }));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.notices.es_volume_exceeds_ed"));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.notices.unknown", { code: "something_new" }));
    });

    it("has no note to show when nothing is to be checked", () => {
      expect(render()).not.toContain('role="note"');
    });

    it("warns when the images shown are no longer those of the phases in force", () => {
      const words = text(render({ volumetry: correctedVolumetryFixture() }));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.images.phaseDiffers", { ed: 1, es: 4 }));
    });
  });

  describe("the performance of the model", () => {
    it("shows the agreement measured on the test patients, with its date and size", () => {
      const html = render({ evaluation: { data: evaluation } });
      const words = text(html);

      expect(html).toContain('data-volume-metrics="true"');
      expect(words).toContain(fr("aiAnalyses.run.volumetry.metrics.lvef"));
      expect(words).toContain(fr("aiAnalyses.run.volumetry.metrics.rvef"));
      expect(words).toMatch(/3,2/);
      expect(words).toMatch(/0,93/);
      expect(words).not.toContain(fr("aiAnalyses.run.volumetry.metrics.none"));
    });

    it("says it has none for these weights, rather than leaving the section empty", () => {
      const html = render({ evaluation: { data: null } });

      expect(html).not.toContain("data-volume-metrics");
      expect(text(html)).toContain(fr("aiAnalyses.run.volumetry.metrics.none"));
    });

    it("says it is loading", () => {
      const html = render({ evaluation: { data: undefined, isLoading: true } });
      expect(text(html)).toContain(fr("aiAnalyses.run.volumetry.metrics.loading"));
    });

    it("asks for the evaluation of the weights of the run", () => {
      render();
      expect(useCardioVolumeEvaluation).toHaveBeenLastCalledWith("a".repeat(64));
    });
  });

  describe("after the decision", () => {
    it("locks the correction", () => {
      const html = render({ run: { decisionStatus: "VALIDATED" } });

      expect(text(html)).toContain(fr("aiAnalyses.run.volumetry.correction.decided"));
      expect(html).not.toContain("<form");
      // The figures stay on the page.
      expect(html).toMatch(/data-lvef="true"/);
    });
  });

  describe("while the physician corrects", () => {
    it("says the model is not run again, and shows the error of a refused save", () => {
      const html = render({ mutation: { error: new Error("boom"), isError: true } });

      expect(html).toContain('role="alert"');
      expect(text(html)).toContain(fr("aiAnalyses.run.volumetry.correction.hint"));
    });

    it("locks the form while it saves", () => {
      const html = render({ mutation: { isPending: true } });

      expect(text(html)).toContain(fr("aiAnalyses.run.volumetry.correction.saving"));
      expect(html).toMatch(/<select[^>]*disabled=""/);
      expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    });
  });

  it("says there is nothing to show for a run that holds no volumetry", () => {
    const html = render({ volumetry: null });

    expect(text(html)).toContain(fr("aiAnalyses.run.none"));
    expect(html).not.toContain("data-lvef");
  });

  it("is in Arabic too, with no key left raw and the numbers kept left-to-right", () => {
    const html = render({ evaluation: { data: evaluation }, locale: "ar", volumetry: correctedVolumetryFixture() });
    const words = text(html);

    expect(words).toContain(ar("aiAnalyses.run.volumetry.title"));
    expect(words).toContain(ar("aiAnalyses.run.volumetry.summary.corrected"));
    expect(words).toContain(ar("aiAnalyses.run.volumetry.aid"));
    expect(html).not.toMatch(/aiAnalyses\./);
    expect(words).not.toMatch(/NaN|undefined|\{[a-zA-Z]+\}/);
    expect(html).toContain('<bdi dir="ltr">');
    expect(ar("aiAnalyses.run.volumetry.title")).not.toBe(fr("aiAnalyses.run.volumetry.title"));
  });
});
