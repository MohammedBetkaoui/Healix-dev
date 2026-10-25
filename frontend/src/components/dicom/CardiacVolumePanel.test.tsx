import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { renderToStaticMarkup } from "react-dom/server";

import { type CineStack } from "@/features/dicom/dicom.types";
import { useAnalyzeCineStack, useCineStacks } from "@/features/dicom/hooks/use-dicom-studies";
import { usePatientConsents } from "@/features/patients/hooks/use-patient-consents";
import { useReadOnlyAction } from "@/features/subscriptions/hooks/use-read-only-action";
import { dictionaries, type Locale } from "@/i18n";
import { translate, type TranslationFunction } from "@/lib/i18n";

import { CardiacVolumePanel } from "./CardiacVolumePanel";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/features/dicom/hooks/use-dicom-studies", () => ({
  useAnalyzeCineStack: jest.fn(),
  useCineStacks: jest.fn(),
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
const plain = (html: string) => html.replace(/&#x27;/g, "'").replace(/\s/g, " ");

const stack = (id: string, overrides: Partial<CineStack> = {}): CineStack => ({
  bytes: 32_000_000,
  description: "SA cine",
  instances: 250,
  number: 5,
  phases: 25,
  refusal: null,
  seriesId: id,
  seriesInstanceUid: `1.2.${id}`,
  shortAxisLikely: true,
  slices: 10,
  ...overrides,
});

function axiosError(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
}

type Options = {
  accountType?: "DOCTOR" | "ESTABLISHMENT";
  consents?: object;
  locale?: Locale;
  measure?: object;
  readOnly?: boolean;
  stacks?: object;
};

function render(options: Options = {}) {
  const t = options.locale === "ar" ? ar : fr;
  (useCineStacks as jest.Mock).mockReturnValue({
    data: [stack("a")],
    isError: false,
    isLoading: false,
    ...options.stacks,
  });
  (useAnalyzeCineStack as jest.Mock).mockReturnValue({
    error: null,
    isError: false,
    isPending: false,
    mutate: jest.fn(),
    reset: jest.fn(),
    ...options.measure,
  });
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
    <CardiacVolumePanel accountType={options.accountType ?? "DOCTOR"} patientId="patient-1" studyId="study-1" t={t} />,
  );
}

const launchButton = (html: string) => html.match(/<button[^>]*>/)?.[0] ?? "";

describe("measuring the heart from a study", () => {
  it("lists the cine series of the study, with what the first holds", () => {
    const html = render({ stacks: { data: [stack("a"), stack("b", { description: null, number: 7 })] } });

    expect(html).toContain('data-cardiac-volume="true"');
    expect(html).toContain(escaped(fr("dicom.cine.title")));
    expect(html).toContain(escaped(fr("dicom.cine.option", { description: "SA cine", number: 5, phases: 25, slices: 10 })));
    expect(html).toContain(escaped(fr("dicom.cine.optionPlain", { number: 7, phases: 25, slices: 10 })));
    // 250 images of 32 MB in all: 10 slices of 25 phases.
    expect(plain(html)).toContain("25 phases × 10 coupes, 250 images");
    expect(useCineStacks).toHaveBeenLastCalledWith("study-1");
  });

  it("says it reads a short axis when the description does, and asks to check when it does not", () => {
    expect(render()).toContain(escaped(fr("dicom.cine.shortAxisYes")));
    expect(render({ stacks: { data: [stack("a", { shortAxisLikely: null })] } })).toContain(
      escaped(fr("dicom.cine.shortAxisUnknown")),
    );
    expect(render({ stacks: { data: [stack("a", { shortAxisLikely: false })] } })).toContain(
      escaped(fr("dicom.cine.shortAxisNo")),
    );
  });

  it("keeps the button off until the physician confirms it is a short axis", () => {
    const html = render();

    expect(html).toContain(escaped(fr("dicom.cine.shortAxisConfirm")));
    expect(html).toMatch(/<input[^>]*type="checkbox"/);
    expect(html).not.toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
    expect(launchButton(html)).toContain('disabled=""');
    expect(html).toContain(`>${escaped(fr("dicom.cine.launch"))}</button>`);
  });

  it("shows why a series cannot be measured, and gives no way to start it", () => {
    const html = render({ stacks: { data: [stack("a", { refusal: "TOO_FEW_SLICES", slices: 4 })] } });

    expect(html).toContain(escaped(fr("dicom.cine.refusals.TOO_FEW_SLICES")));
    expect(html).toContain(escaped(fr("dicom.cine.optionRefused", { number: 5 })));
    expect(html).toContain('role="alert"');
    expect(html).not.toContain(escaped(fr("dicom.cine.shortAxisConfirm")));
    expect(launchButton(html)).toContain('disabled=""');
  });

  it("says when the study holds no cine, loads, or cannot be read", () => {
    expect(render({ stacks: { data: [] } })).toContain(escaped(fr("dicom.cine.none")));
    expect(render({ stacks: { data: undefined, isLoading: true } })).toContain(escaped(fr("dicom.cine.loading")));
    expect(render({ stacks: { data: undefined, isError: true } })).toContain(escaped(fr("dicom.cine.error")));
  });

  it("explains that the consent for diagnostic AI is missing, and where to sign it", () => {
    const html = render({ consents: { data: [] } });

    expect(html).toContain(escaped(fr("dicom.cine.consentMissing")));
    expect(html).toContain('href="/doctor/patients/patient-1?tab=consents"');
    expect(render({ accountType: "ESTABLISHMENT", consents: { data: [] } })).toContain(
      'href="/establishment/patients/patient-1?tab=consents"',
    );
    expect(launchButton(html)).toContain('disabled=""');
  });

  it("leaves a read-only account with the panel and the button off", () => {
    const html = render({ readOnly: true });

    expect(launchButton(html)).toContain('disabled=""');
    expect(html).toContain(`title="${escaped(fr("subscription.readOnly.hint"))}"`);
  });

  it("says it can take up to three minutes while it runs, and locks the choices", () => {
    const html = render({ measure: { isPending: true } });

    expect(html).toContain(escaped(fr("dicom.cine.launching")));
    expect(html).toContain(escaped(fr("dicom.cine.launchingHint")));
    expect(html).toContain('role="status"');
    expect(html).toMatch(/<select[^>]*disabled=""/);
    expect(fr("dicom.cine.launching")).toContain("3 minutes");
  });

  it("explains a refusal before any run, but not one that was recorded (its page says why)", () => {
    const refused = render({
      measure: {
        error: axiosError(422, { code: "DICOM_CINE_STACK_INVALID", reason: "UNEQUAL_PHASES" }),
        isError: true,
      },
    });
    expect(refused).toContain(escaped(fr("dicom.errors.DICOM_CINE_STACK_INVALID.UNEQUAL_PHASES")));

    const recorded = render({
      measure: {
        error: axiosError(422, { code: "AI_INPUT_REJECTED", reason: "CARDIO_VOLUME_NOT_MR", runId: "run-9" }),
        isError: true,
      },
    });
    expect(recorded).not.toContain('role="alert"');

    const quota = render({
      measure: { error: axiosError(403, { code: "QUOTA_EXCEEDED", limit: 10, quota: "aiAnalysesPerMonth", used: 10 }), isError: true },
    });
    expect(quota).toContain('role="alert"');
  });

  it("is in Arabic too, with no key left raw", () => {
    const html = render({ locale: "ar", stacks: { data: [stack("a"), stack("b", { refusal: "MULTIFRAME" })] } });

    expect(html).toContain(escaped(ar("dicom.cine.title")));
    expect(html).toContain(escaped(ar("dicom.cine.shortAxisConfirm")));
    expect(html).not.toMatch(/dicom\.cine\./);
    expect(html).not.toContain("{");
    expect(ar("dicom.cine.title")).not.toBe(fr("dicom.cine.title"));
  });
});
