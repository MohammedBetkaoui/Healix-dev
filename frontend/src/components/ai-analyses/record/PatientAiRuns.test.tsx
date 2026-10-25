import { renderToStaticMarkup } from "react-dom/server";

import { type AiAnalysisRun } from "@/features/ai-analyses/ai-analyses.types";
import { aiPipelines, wizardPipelines } from "@/features/ai-analyses/ai-models.registry";
import { useAiAnalysisRuns } from "@/features/ai-analyses/hooks/use-ai-analysis-runs";
import { cineRunFixture, correctedVolumetryFixture } from "@/features/ai-analyses/volumetry.fixtures";
import { useReadOnlyAction } from "@/features/subscriptions/hooks/use-read-only-action";
import { dictionaries, type Locale } from "@/i18n";
import { translate, type TranslationFunction } from "@/lib/i18n";

import { LatestRetainedAiRun, NewAiAnalysisMenu, getNewAiAnalysisHref } from "./PatientAiRuns";

jest.mock("@/features/ai-analyses/hooks/use-ai-analysis-runs", () => ({ useAiAnalysisRuns: jest.fn() }));
jest.mock("@/features/ai-analyses/hooks/use-download-ai-report", () => ({ useDownloadAiReport: jest.fn() }));
jest.mock("@/features/subscriptions/hooks/use-read-only-action", () => ({ useReadOnlyAction: jest.fn() }));

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

function renderMenu(options: { locale?: Locale; readOnly?: boolean } = {}) {
  const t = options.locale === "ar" ? ar : fr;
  (useReadOnlyAction as jest.Mock).mockReturnValue({
    disabled: options.readOnly ?? false,
    readOnly: options.readOnly ?? false,
    title: options.readOnly ? t("subscription.readOnly.hint") : undefined,
  });
  return renderToStaticMarkup(
    <NewAiAnalysisMenu accountType="DOCTOR" className="button" patientId="patient-1" t={t}>
      {t("aiAnalyses.record.newAnalysis")}
    </NewAiAnalysisMenu>,
  );
}

function renderLatest(runs: AiAnalysisRun[], locale: Locale = "fr") {
  (useAiAnalysisRuns as jest.Mock).mockReturnValue({ data: runs, error: null, isError: false, isLoading: false });
  return renderToStaticMarkup(
    <LatestRetainedAiRun accountType="DOCTOR" locale={locale} patientId="patient-1" t={locale === "ar" ? ar : fr} />,
  );
}

const decided = (overrides: Partial<AiAnalysisRun>): AiAnalysisRun =>
  cineRunFixture({
    decidedAt: "2026-10-25T10:30:00.000Z",
    decidedById: "user-1",
    decidedByName: "Dr. Benali",
    ...overrides,
  });

describe("starting an analysis from a record", () => {
  it("offers the chains the wizard launches from an image or a signal, not the cine series", () => {
    const html = renderMenu();
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));

    expect(hrefs).toEqual(wizardPipelines.map((pipeline) => getNewAiAnalysisHref("DOCTOR", "patient-1", pipeline.id)));
    expect(hrefs.some((href) => href.includes("cardio-volume-mri"))).toBe(false);
    expect(aiPipelines.some((pipeline) => pipeline.id === "cardio-volume-mri")).toBe(true);
  });

  it("says where a cine series is measured from", () => {
    const html = renderMenu();

    expect(text(html)).toContain(fr("aiAnalyses.record.cineHint"));
    expect(fr("aiAnalyses.record.cineHint")).toMatch(/DICOM|étude/i);
  });

  it("is in Arabic, with no key left raw", () => {
    const html = renderMenu({ locale: "ar" });

    expect(text(html)).toContain(ar("aiAnalyses.record.cineHint"));
    expect(html).not.toMatch(/aiAnalyses\./);
  });

  it("leaves a read-only account with a button that does nothing", () => {
    const html = renderMenu({ readOnly: true });

    expect(html).toContain("<button");
    expect(html).toContain("disabled");
    expect(html).not.toContain("<details");
  });
});

describe("the latest analysis retained in the record", () => {
  it("shows the ejection fraction in force of a validated cine, with its status", () => {
    const html = renderLatest([decided({ decisionStatus: "VALIDATED" })]);
    const words = text(html);

    expect(words).toContain(fr("aiAnalyses.record.volumetryResult", { value: "38" }));
    expect(words).toContain(fr("aiAnalyses.decision.statuses.VALIDATED"));
    expect(words).toContain("Dr. Benali");
    expect(html).toContain('href="/doctor/ai-analyses/runs/run-cine?patient=patient-1"');
  });

  it("shows the fraction the physician corrected, not the model's", () => {
    const html = renderLatest([
      decided({ decisionReason: "ES déplacée.", decisionStatus: "CORRECTED", volumetry: correctedVolumetryFixture() }),
    ]);
    const words = text(html);

    expect(words).toContain(fr("aiAnalyses.record.volumetryResult", { value: "20" }));
    expect(words).not.toContain(fr("aiAnalyses.record.volumetryResult", { value: "38" }));
    expect(words).toContain(fr("aiAnalyses.decision.statuses.CORRECTED"));
  });

  it("retains nothing of a rejected or an undecided cine", () => {
    for (const run of [decided({ decisionReason: "Mauvais cadrage.", decisionStatus: "REJECTED" }), cineRunFixture()]) {
      const words = text(renderLatest([run]));
      expect(words).toContain(fr("aiAnalyses.record.latest.none"));
      expect(words).not.toContain("%");
    }
  });

  it("retains nothing of a cine whose volumetry is absent", () => {
    const words = text(renderLatest([decided({ decisionStatus: "VALIDATED", volumetry: undefined })]));
    expect(words).toContain(fr("aiAnalyses.record.latest.none"));
  });

  it("is in Arabic, with no key left raw", () => {
    const html = renderLatest([decided({ decisionStatus: "VALIDATED" })], "ar");

    expect(text(html)).toContain(ar("aiAnalyses.decision.statuses.VALIDATED"));
    expect(html).not.toMatch(/aiAnalyses\./);
    expect(text(html)).not.toMatch(/NaN|undefined|\{[a-zA-Z]+\}/);
  });
});
