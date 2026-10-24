import { AxiosError, AxiosHeaders, type AxiosResponse } from "axios";
import { renderToStaticMarkup } from "react-dom/server";

import { type DicomStudyDetail } from "@/features/dicom/dicom.types";
import { useDicomStudy } from "@/features/dicom/hooks/use-dicom-studies";
import { dictionaries } from "@/i18n";
import { useSessionKeepAlive } from "@/lib/auth/use-session-keep-alive";
import { translate } from "@/lib/i18n";

import { DicomStudyViewerPage } from "./DicomStudyViewerPage";

jest.mock("@/features/dicom/hooks/use-dicom-studies", () => ({ useDicomStudy: jest.fn() }));
jest.mock("@/lib/auth/use-session-keep-alive", () => ({ useSessionKeepAlive: jest.fn() }));
jest.mock("@/features/auth/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ data: { fullName: "Dr Test" } }),
}));
jest.mock("@/features/verification/hooks/use-establishment-verification-prefill", () => ({
  useEstablishmentVerificationPrefill: () => ({ data: undefined }),
}));
jest.mock("@/features/patients/hooks/use-patient", () => ({
  usePatient: () => ({
    data: { firstName: "Amine", firstNameAr: "أمين", lastName: "Benali", lastNameAr: "بن علي" },
  }),
}));
jest.mock("@/components/shared/VerificationRequiredNotice", () => ({
  VerificationRequiredNotice: () => <div data-verification-required="true" />,
}));
// The shell needs a router and several queries: only what it frames matters.
jest.mock("@/components/dashboard/layout/DashboardShell", () => ({
  DashboardShell: ({ breadcrumbLabel, children }: { breadcrumbLabel?: string; children: React.ReactNode }) => (
    <div data-shell="true" data-breadcrumb={breadcrumbLabel}>{children}</div>
  ),
}));

const fr = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);
const escaped = (text: string) => text.replaceAll("'", "&#x27;").replaceAll('"', "&quot;");

const study: DicomStudyDetail = {
  createdAt: "2026-10-24T10:00:00.000Z",
  id: "study-1",
  identityWarnings: [],
  instancesCount: 20,
  modalities: ["MR"],
  patientId: "patient-1",
  series: [],
  seriesCount: 1,
  sizeBytes: 1024,
  studyDate: "2026-03-12",
  studyDescription: "IRM CARDIAQUE",
  studyInstanceUid: "1.2.826.0.1.3680043.8.498.1",
  uploadedById: "user-1",
};

function axiosError(status: number) {
  const config = { headers: new AxiosHeaders() };
  const response: AxiosResponse = { config, data: {}, headers: {}, status, statusText: "" };
  return new AxiosError("Request failed", "ERR_BAD_REQUEST", config, {}, response);
}

function render(
  query: object = {},
  options: { accountType?: "DOCTOR" | "ESTABLISHMENT"; ended?: boolean } = {},
) {
  (useDicomStudy as jest.Mock).mockReturnValue({
    data: study,
    error: null,
    isError: false,
    isLoading: false,
    ...query,
  });
  (useSessionKeepAlive as jest.Mock).mockReturnValue({ ended: options.ended ?? false });
  return renderToStaticMarkup(
    <DicomStudyViewerPage
      accountType={options.accountType ?? "DOCTOR"}
      patientId="patient-1"
      studyId="study-1"
    />,
  );
}

describe("the page of a DICOM study", () => {
  it("frames the viewer on the study, at /viewer/ on the same origin, full height", () => {
    const html = render();

    expect(html).toContain("<iframe");
    expect(html).toContain('src="/viewer/viewer?StudyInstanceUIDs=1.2.826.0.1.3680043.8.498.1"');
    expect(html).toContain(`title="${escaped(fr("dicom.viewer.frameTitle"))}"`);
    expect(html).toContain('referrerPolicy="same-origin"');
    expect(html).toContain("h-[calc(100dvh-16rem)]");
    expect(html).toContain("w-full");
    // No sandbox that would cut the viewer from its cookies and workers.
    expect(html).not.toContain("sandbox");
  });

  it("renews the session while it is open", () => {
    render();

    expect(useSessionKeepAlive).toHaveBeenCalled();
  });

  it("names the study and the patient, and goes back to the imaging tab of the record", () => {
    const html = render();

    expect(html).toContain("IRM CARDIAQUE");
    expect(html).toContain("Amine Benali");
    expect(html).toContain('href="/doctor/patients/patient-1?tab=imaging"');
    expect(html).toContain(fr("dicom.viewer.back"));
    expect(render({}, { accountType: "ESTABLISHMENT" })).toContain(
      'href="/establishment/patients/patient-1?tab=imaging"',
    );
  });

  it("shows what the header says that the record does not, above the images", () => {
    const html = render({
      data: { ...study, identityWarnings: [{ dicomValue: "PATIENT^FICTIF", field: "PatientName" }] },
    });

    expect(html).toContain('role="note"');
    expect(html).toContain(
      escaped(fr("dicom.studies.warningDetail", { field: "Nom", value: "PATIENT^FICTIF" })),
    );
    expect(html.indexOf('role="note"')).toBeLessThan(html.indexOf("<iframe"));
  });

  it("warns when the session is over: the images would stop", () => {
    expect(render({}, { ended: true })).toContain(escaped(fr("dicom.viewer.sessionEnded")));
    expect(render({}, { ended: false })).not.toContain(escaped(fr("dicom.viewer.sessionEnded")));
  });

  it("frames nothing while the study loads, nor when it is not found, nor when the store is down", () => {
    const loading = render({ data: undefined, isLoading: true });
    const notFound = render({ data: undefined, error: axiosError(404), isError: true });
    const down = render({ data: undefined, error: axiosError(502), isError: true });

    expect(loading).toContain(escaped(fr("dicom.viewer.loading")));
    expect(notFound).toContain(escaped(fr("dicom.viewer.notFound")));
    expect(down).toContain(escaped(fr("dicom.viewer.unavailable")));
    for (const html of [loading, notFound, down]) {
      expect(html).not.toContain("<iframe");
    }
  });
});
