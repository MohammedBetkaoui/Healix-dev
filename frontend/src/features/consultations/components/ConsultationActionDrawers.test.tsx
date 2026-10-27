import { renderToStaticMarkup } from "react-dom/server";

import { CreateReportDrawer } from "@/features/reports/components/CreateReportDrawer";
import { NewPrescriptionDrawer } from "@/features/prescriptions/components/NewPrescriptionDrawer";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { type ConsultationDetail } from "../types/consultation.types";
import { consultationContext, ConsultationPrescribeDrawer, ConsultationReportDrawer } from "./ConsultationActionDrawers";

// The builders are replaced by recorders: what matters here is what they receive.
jest.mock("@/features/prescriptions/components/NewPrescriptionDrawer", () => ({ NewPrescriptionDrawer: jest.fn(() => null) }));
jest.mock("@/features/reports/components/CreateReportDrawer", () => ({ CreateReportDrawer: jest.fn(() => null) }));

const prescriptionDrawer = NewPrescriptionDrawer as unknown as jest.Mock;
const reportDrawer = CreateReportDrawer as unknown as jest.Mock;
const t = (key: string) => translate(dictionaries.fr, key);

const consultation = {
  id: "consultation-7",
  createdAt: "2026-10-20T09:30:00.000Z",
  patient: { birthDate: "1985-03-12", firstName: "Amina", firstNameAr: "أمينة", gender: "FEMALE", hospitalRecordNumber: "DOS-001", id: "patient-3", lastName: "Benali", lastNameAr: "بن علي" },
  startedAt: "2026-10-20T09:00:00.000Z",
  chiefComplaint: "Douleur thoracique",
} as unknown as ConsultationDetail;

const noop = () => undefined;

beforeEach(() => jest.clearAllMocks());

describe("consultationContext", () => {
  it("names the patient and the consultation, whatever the script of the page", () => {
    expect(consultationContext(consultation, "fr")).toEqual({
      encounterId: "consultation-7",
      encounterLabel: "20/10/2026 — Douleur thoracique",
      patient: { id: "patient-3", label: "Amina Benali · DOS-001" },
    });
    expect(consultationContext(consultation, "ar").patient.label).toBe("أمينة بن علي · DOS-001");
  });
});

describe("Prescribe from a consultation", () => {
  it("opens the prescription builder with the patient and the consultation already filled", () => {
    const capabilities = { canCreatePrescription: true } as never;

    renderToStaticMarkup(<ConsultationPrescribeDrawer capabilities={capabilities} consultation={consultation} locale="fr" onClose={noop} onDone={noop} t={t} />);

    expect(prescriptionDrawer).toHaveBeenCalledTimes(1);
    const props = prescriptionDrawer.mock.calls[0][0];
    expect(props.context).toEqual({ encounterId: "consultation-7", encounterLabel: "20/10/2026 — Douleur thoracique", patient: { id: "patient-3", label: "Amina Benali · DOS-001" } });
    expect(props.capabilities).toBe(capabilities);
    expect(props.draft).toBeUndefined();
  });
});

describe("Write a report from a consultation", () => {
  it("opens the report editor with the patient and the consultation already filled", () => {
    const capabilities = { canCreateReports: true } as never;

    renderToStaticMarkup(<ConsultationReportDrawer capabilities={capabilities} consultation={consultation} locale="fr" onClose={noop} onDone={noop} t={t} />);

    expect(reportDrawer).toHaveBeenCalledTimes(1);
    const props = reportDrawer.mock.calls[0][0];
    expect(props.context).toEqual({ encounterId: "consultation-7", encounterLabel: "20/10/2026 — Douleur thoracique", patient: { id: "patient-3", label: "Amina Benali · DOS-001" } });
    expect(props.draft).toBeUndefined();
  });
});
