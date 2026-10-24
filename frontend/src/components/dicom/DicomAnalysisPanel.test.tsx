import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { renderToStaticMarkup } from "react-dom/server";

import { type DicomInstance, type DicomSeries, type DicomStudyDetail } from "@/features/dicom/dicom.types";
import { useAnalyzeDicomInstance, useDicomPreview } from "@/features/dicom/hooks/use-dicom-studies";
import { usePatientConsents } from "@/features/patients/hooks/use-patient-consents";
import { useReadOnlyAction } from "@/features/subscriptions/hooks/use-read-only-action";
import { dictionaries, type Locale } from "@/i18n";
import { getSubscriptionLimitMessage } from "@/lib/api/get-mutation-error-message";
import { translate, type TranslationFunction } from "@/lib/i18n";

import { DicomAnalysisPanel } from "./DicomAnalysisPanel";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/features/dicom/hooks/use-dicom-studies", () => ({
  useAnalyzeDicomInstance: jest.fn(),
  useDicomPreview: jest.fn(),
}));
jest.mock("@/features/patients/hooks/use-patient-consents", () => ({ usePatientConsents: jest.fn() }));
jest.mock("@/features/subscriptions/hooks/use-read-only-action", () => ({ useReadOnlyAction: jest.fn() }));

const tFor =
  (locale: Locale): TranslationFunction =>
  (key, params) =>
    translate(dictionaries[locale], key, params);
const fr = tFor("fr");
const ar = tFor("ar");
const escaped = (text: string) => text.replaceAll("'", "&#x27;").replaceAll('"', "&quot;");

const instance = (n: number, overrides: Partial<DicomInstance> = {}): DicomInstance => ({
  frames: 1,
  id: `instance-${n}`,
  instanceNumber: n,
  multiFrame: false,
  sopInstanceUid: `1.2.3.${n}`,
  ...overrides,
});

const series = (id: string, number: number, count: number, overrides: Partial<DicomSeries> = {}): DicomSeries => ({
  description: null,
  id,
  instances: Array.from({ length: count }, (_, index) => instance(index + 1)),
  instancesCount: count,
  modality: "MR",
  number,
  seriesInstanceUid: `1.2.${id}`,
  ...overrides,
});

const study = (...allSeries: DicomSeries[]): DicomStudyDetail => ({
  createdAt: "2026-10-24T10:00:00.000Z",
  id: "study-1",
  identityWarnings: [],
  instancesCount: 10,
  modalities: ["MR"],
  patientId: "patient-1",
  series: allSeries,
  seriesCount: allSeries.length,
  sizeBytes: 1024,
  studyDate: null,
  studyDescription: null,
  studyInstanceUid: "1.2.826.0.1.1",
  uploadedById: "user-1",
});

function axiosError(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
}

type Options = {
  accountType?: "DOCTOR" | "ESTABLISHMENT";
  analyze?: object;
  consents?: object;
  initialPipeline?: "brain" | "cardio-seg-mri";
  locale?: Locale;
  preview?: object;
  readOnly?: boolean;
};

function render(data: DicomStudyDetail, options: Options = {}) {
  const t = options.locale === "ar" ? ar : fr;
  (useAnalyzeDicomInstance as jest.Mock).mockReturnValue({
    error: null,
    isError: false,
    isPending: false,
    mutate: jest.fn(),
    reset: jest.fn(),
    ...options.analyze,
  });
  (useDicomPreview as jest.Mock).mockReturnValue({ data: undefined, isError: false, isLoading: true, ...options.preview });
  (usePatientConsents as jest.Mock).mockReturnValue({
    data: [{ status: "SIGNED", type: "DIAGNOSTIC_AI" }],
    isSuccess: true,
    ...options.consents,
  });
  (useReadOnlyAction as jest.Mock).mockReturnValue({
    disabled: options.readOnly ?? false,
    readOnly: options.readOnly ?? false,
    title: options.readOnly ? t("subscription.readOnly.hint") : undefined,
  });
  return renderToStaticMarkup(
    <DicomAnalysisPanel accountType={options.accountType ?? "DOCTOR"} initialPipeline={options.initialPipeline} patientId="patient-1" study={data} t={t} />,
  );
}

const launchButton = (html: string) => html.match(/<button[^>]*>/)?.[0] ?? "";

describe("the analysis of a slice on the study page", () => {
  it("opens on the middle slice of the first MRI series, with its name and place in the stack", () => {
    const html = render(study(series("s1", 3, 5)));

    expect(html).toContain('data-dicom-analysis="true"');
    expect(html).toContain(escaped(fr("dicom.analysis.title")));
    expect(html).toContain(escaped(fr("dicom.analysis.sliceCounter", { position: 3, total: 5 })));
    expect(html).toContain(`>${fr("dicom.analysis.slice", { instance: 3, series: 3 })}</p>`);
    expect(useDicomPreview).toHaveBeenLastCalledWith("instance-3");
  });

  it("gives a slider over the stack, from the first slice to the last", () => {
    const html = render(study(series("s1", 3, 5)));

    expect(html).toMatch(/<input[^>]*type="range"[^>]*max="4"[^>]*min="0"[^>]*value="2"/);
    expect(html).toContain(`aria-valuetext="${escaped(fr("dicom.analysis.sliceCounter", { position: 3, total: 5 }))}"`);
  });

  it("locks the slider on a series of one image", () => {
    const html = render(study(series("s1", 1, 1)));

    expect(html).toMatch(/<input[^>]*type="range"[^>]*disabled=""/);
    expect(useDicomPreview).toHaveBeenLastCalledWith("instance-1");
  });

  it("skips the multi-frame images: they cannot be analysed", () => {
    const mixed = series("s1", 2, 3, {
      instances: [instance(1), instance(2, { frames: 30, multiFrame: true }), instance(3), instance(4)],
    });

    const html = render(study(mixed));

    expect(html).toContain(escaped(fr("dicom.analysis.sliceCounter", { position: 2, total: 3 })));
    expect(useDicomPreview).toHaveBeenLastCalledWith("instance-3");
  });

  it("offers a choice of series only when there are several, and lists only the MRI ones", () => {
    const one = render(study(series("s1", 1, 4), series("ct", 2, 4, { modality: "CT" })));
    const many = render(study(series("s1", 1, 4), series("s2", 2, 6, { description: "SAX CINE" })));

    expect(one).not.toContain("<select");
    expect(many).toContain("<select");
    expect(many).toContain(escaped(fr("dicom.analysis.seriesOptionPlain", { count: 4, number: 1 })));
    expect(many).toContain(escaped(fr("dicom.analysis.seriesOption", { count: 6, description: "SAX CINE", number: 2 })));
  });

  it("offers both chains, by their names, with none chosen: the physician decides", () => {
    const html = render(study(series("s1", 1, 4)));

    for (const id of ["brain", "cardio-seg-mri"]) {
      expect(html).toContain(escaped(fr(`aiAnalyses.pipelines.${id}.name`)));
      expect(html).toContain(escaped(fr(`dicom.analysis.pipelineHints.${id}`)));
    }
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).not.toMatch(/type="radio"[^>]*checked=""/);
    expect(html).not.toContain("pathology");
    expect(html).not.toContain("cardio-ecg");
  });

  it("keeps the button off until a chain is chosen, and says so", () => {
    const html = render(study(series("s1", 1, 4)));

    expect(launchButton(html)).toContain('disabled=""');
    expect(html).toContain(escaped(fr("dicom.analysis.pipelineRequired")));
    expect(html).toContain(escaped(fr("dicom.analysis.launch")));
  });

  it("turns the button on once a chain is chosen, and checks it", () => {
    const html = render(study(series("s1", 1, 4)), { initialPipeline: "cardio-seg-mri" });

    expect(launchButton(html)).not.toContain('disabled=""');
    expect(html).toMatch(/type="radio"[^>]*checked=""[^>]*value="cardio-seg-mri"/);
    expect(html).not.toContain(escaped(fr("dicom.analysis.pipelineRequired")));
  });

  it("says there is nothing to analyse in a study with no usable MRI, and offers no button", () => {
    const ct = render(study(series("ct", 1, 4, { modality: "CT" })));
    const cine = render(study(series("cine", 1, 1, { instances: [instance(1, { frames: 25, multiFrame: true })] })));

    for (const html of [ct, cine]) {
      expect(html).toContain(escaped(fr("dicom.analysis.noSeries")));
      expect(html).not.toContain("<button");
      expect(html).not.toContain('type="range"');
    }
  });

  it("warns, and keeps the button off, when the patient has not signed the AI consent", () => {
    const html = render(study(series("s1", 1, 4)), { consents: { data: [{ status: "SIGNED", type: "HEALTH_DATA" }] }, initialPipeline: "brain" });
    const pending = render(study(series("s1", 1, 4)), { consents: { data: [{ status: "REVOKED", type: "DIAGNOSTIC_AI" }] }, initialPipeline: "brain" });

    for (const markup of [html, pending]) {
      expect(markup).toContain('role="note"');
      expect(markup).toContain(escaped(fr("dicom.analysis.consentMissing")));
      expect(markup).toContain('href="/doctor/patients/patient-1?tab=consents"');
      expect(launchButton(markup)).toContain('disabled=""');
    }
  });

  it("says nothing of the consent while it is loading, or when it could not be read: the server decides", () => {
    const loading = render(study(series("s1", 1, 4)), { consents: { data: undefined, isSuccess: false } });

    expect(loading).not.toContain(escaped(fr("dicom.analysis.consentMissing")));
  });

  it("points an establishment to the consents of its own workspace", () => {
    const html = render(study(series("s1", 1, 4)), {
      accountType: "ESTABLISHMENT",
      consents: { data: [] },
    });

    expect(html).toContain('href="/establishment/patients/patient-1?tab=consents"');
  });

  it("keeps the button off on a read-only account, and says why", () => {
    const html = render(study(series("s1", 1, 4)), { initialPipeline: "brain", readOnly: true });

    expect(launchButton(html)).toContain('disabled=""');
    expect(launchButton(html)).toContain(`title="${escaped(fr("subscription.readOnly.hint"))}"`);
  });

  it("shows the preview of the slice once loaded, in a frame of fixed size before", () => {
    const loading = render(study(series("s1", 1, 4)));
    const failed = render(study(series("s1", 1, 4)), { preview: { isError: true, isLoading: false } });

    expect(loading).toContain(escaped(fr("dicom.analysis.previewLoading")));
    expect(failed).toContain('role="alert"');
    expect(failed).toContain(escaped(fr("dicom.analysis.previewError")));
    expect(loading).toContain("aspect-square");
  });

  describe("while the analysis runs", () => {
    it("locks everything and says it takes up to a minute", () => {
      const html = render(study(series("s1", 1, 4), series("s2", 2, 4)), { analyze: { isPending: true }, initialPipeline: "brain" });

      expect(html).toContain(escaped(fr("dicom.analysis.launching")));
      expect(html).toContain("animate-spin");
      expect(launchButton(html)).toContain('disabled=""');
      expect(html).toMatch(/<input[^>]*type="range"[^>]*disabled=""/);
      expect(html).toMatch(/<select[^>]*disabled=""/);
      expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    });
  });

  describe("when the analysis is refused", () => {
    it("explains a refusal before any run existed, in the language of the user", () => {
      const error = axiosError(422, { code: "DICOM_PIPELINE_NOT_SUPPORTED", reason: "MODALITY" });

      const html = render(study(series("s1", 1, 4)), { analyze: { error, isError: true } });
      const arabic = render(study(series("s1", 1, 4)), { analyze: { error, isError: true }, locale: "ar" });

      expect(html).toContain('role="alert"');
      expect(html).toContain(escaped(fr("dicom.errors.DICOM_PIPELINE_NOT_SUPPORTED.MODALITY")));
      expect(arabic).toContain(ar("dicom.errors.DICOM_PIPELINE_NOT_SUPPORTED.MODALITY"));
    });

    it("explains a quota that is used up", () => {
      const error = axiosError(403, { code: "QUOTA_EXCEEDED", limit: 10, quota: "aiAnalysesPerMonth", trial: false, used: 10 });

      const html = render(study(series("s1", 1, 4)), { analyze: { error, isError: true } });

      expect(html).toContain('role="alert"');
      expect(html).toContain(escaped(getSubscriptionLimitMessage(error, fr) ?? "missing"));
      expect(html).not.toContain(escaped(fr("dicom.analysis.error")));
    });

    it("falls back on a generic text for an error it does not know", () => {
      const html = render(study(series("s1", 1, 4)), { analyze: { error: new Error("boom"), isError: true } });

      expect(html).toContain(escaped(fr("dicom.analysis.error")));
    });

    it("shows no alert when the service refused a run that was recorded: the page of the run says why", () => {
      const error = axiosError(422, { code: "AI_INPUT_REJECTED", runId: "run-9" });

      const html = render(study(series("s1", 1, 4)), { analyze: { error, isError: true } });

      expect(html).not.toContain('role="alert"');
    });
  });

  it("is written in Arabic, whole", () => {
    const html = render(study(series("s1", 1, 5), series("s2", 2, 5, { description: "SAX" })), {
      consents: { data: [] },
      locale: "ar",
    });

    expect(html).toContain(ar("dicom.analysis.title"));
    expect(html).toContain(ar("dicom.analysis.launch"));
    expect(html).toContain(ar("dicom.analysis.consentMissing"));
    expect(html).not.toContain("dicom.analysis");
  });
});
