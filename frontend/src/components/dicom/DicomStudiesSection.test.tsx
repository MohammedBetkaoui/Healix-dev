import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { renderToStaticMarkup } from "react-dom/server";

import { type DicomImportResult, type DicomStudy } from "@/features/dicom/dicom.types";
import {
  useDeleteDicomStudy,
  useDicomStudies,
  useImportDicomStudies,
} from "@/features/dicom/hooks/use-dicom-studies";
import { useReadOnlyAction } from "@/features/subscriptions/hooks/use-read-only-action";
import { dictionaries, type Locale } from "@/i18n";
import { translate, type TranslationFunction } from "@/lib/i18n";

import { DicomStudiesSection } from "./DicomStudiesSection";

jest.mock("@/features/dicom/hooks/use-dicom-studies", () => ({
  useDeleteDicomStudy: jest.fn(),
  useDicomStudies: jest.fn(),
  useImportDicomStudies: jest.fn(),
}));
jest.mock("@/features/subscriptions/hooks/use-read-only-action", () => ({
  useReadOnlyAction: jest.fn(),
}));
jest.mock("@/components/shared/VerificationRequiredNotice", () => ({
  VerificationRequiredNotice: () => <div data-verification-required="true" />,
}));

const tFor =
  (locale: Locale): TranslationFunction =>
  (key, params) =>
    translate(dictionaries[locale], key, params);
const fr = tFor("fr");
const ar = tFor("ar");
const escaped = (text: string) => text.replaceAll("'", "&#x27;").replaceAll('"', "&quot;");

function axiosError(status: number, data: unknown) {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
}

const study = (overrides: Partial<DicomStudy> = {}): DicomStudy => ({
  createdAt: "2026-10-24T10:00:00.000Z",
  id: "study-1",
  identityWarnings: [],
  instancesCount: 1250,
  modalities: ["MR"],
  patientId: "patient-1",
  seriesCount: 3,
  sizeBytes: 5 * 1024 * 1024,
  studyDate: "2026-03-12",
  studyDescription: "IRM CARDIAQUE",
  studyInstanceUid: "1.2.826.0.1.3680043.8.498.1",
  uploadedById: "user-1",
  ...overrides,
});

type ImportState = {
  data: DicomImportResult | undefined;
  error: unknown;
  isError: boolean;
  isPending: boolean;
  isSuccess: boolean;
  mutate: jest.Mock;
  progress: number;
  reset: jest.Mock;
};

const idleImport: ImportState = {
  data: undefined,
  error: null,
  isError: false,
  isPending: false,
  isSuccess: false,
  mutate: jest.fn(),
  progress: 0,
  reset: jest.fn(),
};

function render(options: {
  importState?: Partial<ImportState>;
  locale?: Locale;
  query?: object;
  readOnly?: boolean;
  accountType?: "DOCTOR" | "ESTABLISHMENT";
} = {}) {
  const t = options.locale === "ar" ? ar : fr;
  (useDicomStudies as jest.Mock).mockReturnValue({
    data: [study()],
    error: null,
    isError: false,
    isLoading: false,
    ...options.query,
  });
  (useDeleteDicomStudy as jest.Mock).mockReturnValue({ error: null, isError: false, isPending: false, mutate: jest.fn(), reset: jest.fn() });
  (useImportDicomStudies as jest.Mock).mockReturnValue({ ...idleImport, ...options.importState });
  (useReadOnlyAction as jest.Mock).mockReturnValue({
    disabled: options.readOnly ?? false,
    readOnly: options.readOnly ?? false,
    title: options.readOnly ? t("subscription.readOnly.hint") : undefined,
  });
  return renderToStaticMarkup(
    <DicomStudiesSection accountType={options.accountType ?? "DOCTOR"} locale={options.locale ?? "fr"} patientId="patient-1" t={t} />,
  );
}

describe("the DICOM studies of a patient record", () => {
  it("lists each study: date, modality, description, series, images and size", () => {
    const html = render();

    expect(html).toContain(escaped(fr("dicom.studies.title")));
    expect(html).toContain('data-study="study-1"');
    expect(html).toContain('<time dateTime="2026-03-12">');
    expect(html).toContain("MR");
    expect(html).toContain("IRM CARDIAQUE");
    expect(html).toMatch(/<td[^>]*>3<\/td>/);
    expect(html).toContain("5 Mo");
    for (const column of ["date", "modality", "description", "series", "images", "size", "identity", "actions"]) {
      expect(html).toContain(escaped(fr(`dicom.studies.columns.${column}`)));
    }
  });

  it("opens a study in its own page, for a doctor and for an establishment", () => {
    expect(render()).toContain('href="/doctor/patients/patient-1/imaging/study-1"');
    expect(render({ accountType: "ESTABLISHMENT" })).toContain(
      'href="/establishment/patients/patient-1/imaging/study-1"',
    );
  });

  it("says a study conforms to the record when its header has nothing to add", () => {
    const html = render();

    expect(html).toContain(fr("dicom.studies.identityOk"));
    expect(html).not.toContain("data-identity-warning");
  });

  it("shows what the DICOM header says that the record does not, in orange", () => {
    const html = render({
      query: {
        data: [
          study({
            identityWarnings: [
              { dicomValue: "PATIENT^FICTIF", field: "PatientName" },
              { dicomValue: "19000101", field: "PatientBirthDate" },
            ],
          }),
        ],
      },
    });

    expect(html).toContain('data-identity-warning="true"');
    expect(html).toContain(fr("dicom.studies.identityWarning"));
    expect(html).toContain("border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]");
    expect(html).toContain(
      escaped(fr("dicom.studies.warningDetail", { field: "Nom", value: "PATIENT^FICTIF" })),
    );
    expect(html).toContain(
      escaped(fr("dicom.studies.warningDetail", { field: "Date de naissance", value: "19000101" })),
    );
  });

  it("writes an empty description and no date as such", () => {
    const html = render({ query: { data: [study({ studyDate: null, studyDescription: null })] } });

    expect(html).toContain(fr("dicom.studies.noDescription"));
    expect(html).not.toContain("<time");
  });

  it("says when there is no study, while loading, and when loading failed", () => {
    expect(render({ query: { data: [] } })).toContain(fr("dicom.studies.empty"));
    expect(render({ query: { data: undefined, isLoading: true } })).toContain(fr("dicom.studies.loading"));
    expect(render({ query: { data: undefined, error: new Error("x"), isError: true } })).toContain(
      fr("dicom.studies.error"),
    );
  });

  it("shows the verification notice to an account that is not verified", () => {
    const html = render({
      query: {
        data: undefined,
        error: axiosError(403, { code: "VERIFICATION_REQUIRED" }),
        isError: true,
      },
    });

    expect(html).toContain("data-verification-required");
  });

  it("is written in Arabic too, whole", () => {
    const html = render({ locale: "ar" });

    expect(html).toContain(ar("dicom.studies.title"));
    expect(html).toContain(ar("dicom.import.dropHint"));
    expect(html).toContain(ar("dicom.studies.open"));
    expect(html).not.toContain("dicom.");
  });

  describe("on a read-only account", () => {
    it("still lists and opens the studies, but cannot import nor delete", () => {
      const html = render({ readOnly: true });

      expect(html).toContain('data-study="study-1"');
      expect(html).toContain('href="/doctor/patients/patient-1/imaging/study-1"');
      // The two import buttons and the delete button: three disabled buttons,
      // each saying why.
      const disabled = html.match(/<button[^>]*disabled=""[^>]*>/g) ?? [];
      expect(disabled).toHaveLength(3);
      for (const button of disabled) {
        expect(button).toContain(`title="${escaped(fr("subscription.readOnly.hint"))}"`);
      }
    });

    it("leaves the buttons on with a live subscription", () => {
      const html = render({ readOnly: false });

      expect(html.match(/<button[^>]*disabled=""[^>]*>/g) ?? []).toHaveLength(0);
    });
  });
});

describe("the import of a study", () => {
  it("invites to drop .dcm files, a folder or a ZIP, and gives the limits", () => {
    const html = render();

    expect(html).toContain('data-dropzone="true"');
    expect(html).toContain(escaped(fr("dicom.import.dropHint")));
    expect(html).toContain(escaped(fr("dicom.import.formats")));
    expect(html).toContain(fr("dicom.import.choose"));
    expect(html).toContain(fr("dicom.import.chooseFolder"));
  });

  it("shows the progress of the upload", () => {
    const html = render({ importState: { isPending: true, progress: 0.42 } });

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('style="width:42%"');
    expect(html).toContain(fr("dicom.import.uploading", { percent: 42 }));
  });

  it("says the server is working once everything is sent", () => {
    const html = render({ importState: { isPending: true, progress: 1 } });

    expect(html).toContain(escaped(fr("dicom.import.processing")));
    expect(html).toContain('aria-valuenow="100"');
  });

  it("locks the buttons while the import runs", () => {
    const html = render({ importState: { isPending: true, progress: 0.1 } });

    expect((html.match(/<button[^>]*disabled=""[^>]*>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("summarises an import: files imported, files skipped, studies, and what to check", () => {
    const result: DicomImportResult = {
      imported: 120,
      skipped: 3,
      studies: [study(), study({ id: "study-2", studyInstanceUid: "4.5.6" })],
      warnings: [
        { code: "IDENTITY_MISMATCH", fields: ["PatientName", "PatientSex"], studyInstanceUid: "1.2.3" },
        { code: "STUDY_ATTACHED_TO_ANOTHER_PATIENT", studyInstanceUid: "7.8.9" },
      ],
    };

    const html = render({ importState: { data: result, isSuccess: true } });

    expect(html).toContain(fr("dicom.import.summary.title"));
    expect(html).toContain(fr("dicom.import.summary.imported", { count: 120 }));
    expect(html).toContain(escaped(fr("dicom.import.summary.skipped", { count: 3 })));
    expect(html).toContain(escaped(fr("dicom.import.summary.studies", { count: 2 })));
    expect(html).toContain(fr("dicom.import.summary.warningsTitle"));
    expect(html).toContain(
      escaped(fr("dicom.import.warnings.IDENTITY_MISMATCH", { fields: "le nom, le sexe", uid: "1.2.3" })),
    );
    expect(html).toContain(
      escaped(fr("dicom.import.warnings.STUDY_ATTACHED_TO_ANOTHER_PATIENT", { uid: "7.8.9" })),
    );
  });

  it("does not mention skipped files, nor warnings, when there are none", () => {
    const html = render({
      importState: {
        data: { imported: 5, skipped: 0, studies: [study()], warnings: [] },
        isSuccess: true,
      },
    });

    expect(html).toContain(fr("dicom.import.summary.imported", { count: 5 }));
    expect(html).not.toContain(escaped(fr("dicom.import.summary.skipped", { count: 0 })));
    expect(html).not.toContain(fr("dicom.import.summary.warningsTitle"));
  });

  it("explains a refused ZIP in the language of the user", () => {
    const error = axiosError(422, { code: "DICOM_ZIP_UNSAFE", reason: "PATH" });

    const html = render({ importState: { error, isError: true } });
    const arabic = render({ importState: { error, isError: true }, locale: "ar" });

    expect(html).toContain('role="alert"');
    expect(html).toContain(escaped(fr("dicom.errors.DICOM_ZIP_UNSAFE.PATH")));
    expect(arabic).toContain(ar("dicom.errors.DICOM_ZIP_UNSAFE.PATH"));
  });
});
