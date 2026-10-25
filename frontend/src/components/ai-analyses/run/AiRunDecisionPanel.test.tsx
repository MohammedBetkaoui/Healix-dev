import { renderToStaticMarkup } from "react-dom/server";

import { type AiAnalysisRun } from "@/features/ai-analyses/ai-analyses.types";
import { useDecideAiAnalysisRun } from "@/features/ai-analyses/hooks/use-decide-ai-analysis-run";
import { cineRunFixture, correctedVolumetryFixture } from "@/features/ai-analyses/volumetry.fixtures";
import { dictionaries, type Locale } from "@/i18n";
import { translate, type TranslationFunction } from "@/lib/i18n";

import { AiRunDecisionPanel } from "./AiRunDecisionPanel";

jest.mock("@/features/ai-analyses/hooks/use-decide-ai-analysis-run", () => ({ useDecideAiAnalysisRun: jest.fn() }));

const tFor =
  (locale: Locale): TranslationFunction =>
  (key, params) =>
    translate(dictionaries[locale], key, params);
const fr = tFor("fr");
const ar = tFor("ar");

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[⁦-⁩]/g, "")
    .replace(/\s+/g, " ");

function render(run: AiAnalysisRun, locale: Locale = "fr", mutation: object = {}) {
  (useDecideAiAnalysisRun as jest.Mock).mockReturnValue({
    error: null,
    isError: false,
    isPending: false,
    isSuccess: false,
    mutate: jest.fn(),
    reset: jest.fn(),
    ...mutation,
  });
  return renderToStaticMarkup(
    <AiRunDecisionPanel locale={locale} patientId="patient-1" run={run} t={locale === "ar" ? ar : fr} />,
  );
}

const radios = (html: string) => [...html.matchAll(/<input[^>]*type="radio"[^>]*value="([A-Z]+)"/g)].map((match) => match[1]);

const decided = (overrides: Partial<AiAnalysisRun>): AiAnalysisRun =>
  cineRunFixture({
    decidedAt: "2026-10-25T10:30:00.000Z",
    decidedById: "user-1",
    decidedByName: "Dr. Benali",
    ...overrides,
  });

describe("the decision on a cardiac cine volumetry", () => {
  describe("while it is awaited", () => {
    it("offers to validate the model's measures as they are, or to reject them, when none was changed", () => {
      const html = render(cineRunFixture());

      expect(radios(html)).toEqual(["VALIDATED", "REJECTED"]);
      expect(text(html)).toContain(fr("aiAnalyses.decision.volumetryOptions.VALIDATED"));
      expect(text(html)).toContain(fr("aiAnalyses.decision.volumetryOptionHints.VALIDATED"));
      expect(text(html)).toContain(fr("aiAnalyses.decision.volumetryOptions.REJECTED"));
      expect(text(html)).toContain(fr("aiAnalyses.decision.volumetryUnmodified"));
      expect(text(html)).not.toContain(fr("aiAnalyses.decision.volumetryOptions.CORRECTED"));
    });

    it("offers to validate the corrected measures, or to reject them, once the physician changed any", () => {
      const html = render(cineRunFixture({ volumetry: correctedVolumetryFixture() }));

      expect(radios(html)).toEqual(["CORRECTED", "REJECTED"]);
      expect(text(html)).toContain(fr("aiAnalyses.decision.volumetryOptions.CORRECTED"));
      expect(text(html)).toContain(fr("aiAnalyses.decision.volumetryOptionHints.CORRECTED"));
      expect(text(html)).toContain(fr("aiAnalyses.decision.volumetryModified"));
      expect(text(html)).not.toContain(fr("aiAnalyses.decision.volumetryOptions.VALIDATED"));
    });

    it("asks no corrected class: a cine has measures, not a label", () => {
      const html = render(cineRunFixture({ volumetry: correctedVolumetryFixture() }));

      expect(html).not.toContain("<select");
      expect(html).not.toContain('type="checkbox"');
      // The reason is asked once a choice that needs one is made, which the markup of a first render does not hold.
      expect(html).not.toContain("<textarea");
    });

    it("recalls the impression typed before the analysis, and that the decision is awaited", () => {
      const html = render(cineRunFixture({ clinicianImpression: "Dyspnée d'effort, suspicion de cardiomyopathie." }));

      expect(text(html)).toContain("Dyspnée d'effort, suspicion de cardiomyopathie.");
      expect(text(html)).toContain(fr("aiAnalyses.decision.pending"));
      expect(text(html)).toContain(fr("aiAnalyses.decision.submit"));
    });
  });

  describe("once it is made", () => {
    it("records a validation of the model's measures as such", () => {
      const html = render(decided({ decisionStatus: "VALIDATED" }));
      const words = text(html);

      expect(html).not.toContain("<form");
      expect(words).toContain(fr("aiAnalyses.decision.decidedTitle"));
      expect(words).toContain(fr("aiAnalyses.decision.statuses.VALIDATED"));
      expect(words).toContain(fr("aiAnalyses.decision.retainedMeasures"));
      expect(words).toContain(fr("aiAnalyses.decision.measuresAccepted"));
      expect(words).toContain(fr("aiAnalyses.decision.volumetryAgreement.agrees"));
      expect(words).toContain("Dr. Benali");
      expect(words).toContain(fr("aiAnalyses.decision.final"));
    });

    it("records a correction with its reason, and that the measures are the physician's", () => {
      const html = render(
        decided({
          decisionReason: "Phase télésystolique déplacée, coupe basale exclue.",
          decisionStatus: "CORRECTED",
          volumetry: correctedVolumetryFixture(),
        }),
      );
      const words = text(html);

      expect(words).toContain(fr("aiAnalyses.decision.statuses.CORRECTED"));
      expect(words).toContain(fr("aiAnalyses.decision.volumetryOptions.CORRECTED"));
      expect(words).toContain(fr("aiAnalyses.decision.measuresAccepted"));
      expect(words).toContain(fr("aiAnalyses.decision.volumetryAgreement.disagrees"));
      expect(words).toContain("Phase télésystolique déplacée, coupe basale exclue.");
    });

    it("records a rejection: no measure is retained", () => {
      const html = render(decided({ decisionReason: "Série mal cadrée.", decisionStatus: "REJECTED" }));
      const words = text(html);

      expect(words).toContain(fr("aiAnalyses.decision.statuses.REJECTED"));
      expect(words).toContain(fr("aiAnalyses.decision.volumetryAgreement.rejected"));
      expect(words).toContain(fr("aiAnalyses.decision.noRetainedLabel"));
      expect(words).not.toContain(fr("aiAnalyses.decision.measuresAccepted"));
    });

    it("shows the decision that landed first when another submission was made meanwhile", () => {
      const html = render(decided({ decisionStatus: "VALIDATED" }), "fr", {
        error: Object.assign(new Error("conflict"), {
          isAxiosError: true,
          response: { data: { code: "AI_RUN_ALREADY_DECIDED" }, status: 409 },
        }),
        isError: true,
      });

      expect(text(html)).toContain(fr("aiAnalyses.decision.errors.AI_RUN_ALREADY_DECIDED"));
    });
  });

  it("is in Arabic too, with no key left raw", () => {
    for (const run of [
      cineRunFixture(),
      cineRunFixture({ volumetry: correctedVolumetryFixture() }),
      decided({ decisionStatus: "VALIDATED" }),
    ]) {
      const html = render(run, "ar");
      expect(html).not.toMatch(/aiAnalyses\./);
      expect(text(html)).not.toMatch(/NaN|undefined|\{[a-zA-Z]+\}/);
    }
    const html = render(cineRunFixture(), "ar");
    expect(text(html)).toContain(ar("aiAnalyses.decision.volumetryOptions.VALIDATED"));
    expect(ar("aiAnalyses.decision.volumetryOptions.VALIDATED")).not.toBe(fr("aiAnalyses.decision.volumetryOptions.VALIDATED"));
  });
});
