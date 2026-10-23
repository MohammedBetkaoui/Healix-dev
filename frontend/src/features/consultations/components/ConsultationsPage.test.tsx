import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { useConsultation } from "../hooks/use-consultation";
import { useConsultations } from "../hooks/use-consultations";
import { type ConsultationDetail, type ConsultationListItem } from "../types/consultation.types";
import { ConsultationsPage } from "./ConsultationsPage";

// The page renders here without a session, a router or the API: the data
// hooks answer what each test says, the shell is reached through the same
// stand-ins as in config/demo-modules.test.tsx.
jest.mock("@/features/auth/hooks/use-logout", () => ({ useLogout: () => ({ isLoading: false, logout: jest.fn() }) }));
jest.mock("@/features/auth/hooks/use-current-user", () => ({ useCurrentUser: () => ({ data: undefined }) }));
jest.mock("@/features/verification/hooks/use-establishment-verification-prefill", () => ({
  useEstablishmentVerificationPrefill: () => ({ data: undefined }),
}));
jest.mock("@/features/messaging/messaging.queries", () => ({ useUnreadCount: () => ({ data: undefined }) }));
jest.mock("@/features/notifications/hooks/useNotifications", () => ({
  useRecentNotifications: () => ({ data: undefined, isLoading: false }),
  useUnreadNotificationCount: () => ({ data: undefined }),
}));
jest.mock("@/lib/realtime/use-realtime-events", () => ({ useRealtimeEvents: () => undefined }));

let searchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));

jest.mock("../hooks/use-consultations", () => ({
  useConsultationCapabilities: () => ({ capabilities: { canCreateConsultation: true } }),
  useConsultationFilterOptions: () => ({ data: { patients: [] } }),
  useConsultationStats: () => ({ data: { month: 8, prescriptionShare: 38, today: 1, week: 4, withPrescription: 3 }, isLoading: false }),
  useConsultations: jest.fn(),
}));
jest.mock("../hooks/use-consultation", () => ({ useConsultation: jest.fn() }));
jest.mock("@/features/prescriptions/hooks/use-prescription-capabilities", () => ({
  usePrescriptionCapabilities: () => ({ capabilities: { canCreatePrescription: true } }),
}));
jest.mock("@/features/reports/hooks/use-report-capabilities", () => ({
  useReportCapabilities: () => ({ capabilities: { canCreateReports: true } }),
}));
// The drawers and the modal the page opens are not rendered here.
jest.mock("@/components/patients/CreateConsultationModal", () => ({ CreateConsultationModal: () => null }));

const mockedList = useConsultations as jest.Mock;
const mockedDetail = useConsultation as jest.Mock;
const fr = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);

const patient = { birthDate: "1985-03-12", firstName: "Amina", firstNameAr: "أمينة", gender: "FEMALE" as const, hospitalRecordNumber: "DOS-001", id: "p1", lastName: "Benali", lastNameAr: "بن علي" };

const row = (overrides: Partial<ConsultationListItem> = {}): ConsultationListItem => ({
  appointmentId: null,
  date: "2026-10-20T09:00:00.000Z",
  diagnosis: "Angor stable",
  doctor: { fullName: "Samir Kaci", id: "d1", speciality: "Cardiologie" },
  id: "c1",
  patient,
  prescriptionCount: 2,
  reason: "Douleur thoracique à l’effort",
  reportCount: 1,
  ...overrides,
});

const detail: ConsultationDetail = {
  appointment: { durationMinutes: 30, id: "apt-1", reason: "Suivi", scheduledAt: "2026-10-20T08:30:00.000Z", status: "COMPLETED" },
  appointmentId: "apt-1",
  createdAt: "2026-10-20T09:30:00.000Z",
  date: "2026-10-20T09:00:00.000Z",
  diagnosis: "Angor stable",
  doctor: { fullName: "Samir Kaci", id: "d1", speciality: "Cardiologie" },
  id: "c1",
  patient,
  prescriptions: [{ effectiveStatus: "VALIDATED", id: "rx1", itemCount: 2, number: "ORD-2026-000001", prescribedAt: "2026-10-20T10:00:00.000Z", status: "VALIDATED", type: "STANDARD" }],
  reason: "Douleur thoracique à l’effort",
  reports: [{ category: "CONSULTATION_NOTE", effectiveDate: "2026-10-20T11:00:00.000Z", finalizedAt: "2026-10-20T11:05:00.000Z", id: "r1", number: "CR-2026-000001", sourceType: "CONSULTATION", status: "FINAL", title: "Note de suivi", version: 1 }],
  treatment: "Bêtabloquant",
  updatedAt: "2026-10-20T09:30:00.000Z",
};

const render = (accountType: "DOCTOR" | "ESTABLISHMENT" = "DOCTOR") => renderToStaticMarkup(<ConsultationsPage accountType={accountType} />);
const answer = (query: object) => mockedList.mockReturnValue({ data: undefined, error: null, isError: false, isLoading: false, refetch: jest.fn(), ...query });

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = new URLSearchParams();
  mockedDetail.mockReturnValue({ data: undefined, error: null, isError: false, isLoading: false, refetch: jest.fn() });
});

describe("ConsultationsPage", () => {
  it("shows skeletons while the first page loads", () => {
    answer({ isLoading: true });
    const html = render();
    expect(html).toContain(`aria-label="${fr("consultations.states.loading")}"`);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain(fr("consultations.table.empty"));
  });

  it("then lists the consultations of the API, with their links and the counters", () => {
    answer({ data: { data: [row(), row({ diagnosis: "Grippe", id: "c2", prescriptionCount: 0, reason: "Fièvre", reportCount: 0 })], meta: { limit: 20, page: 1, total: 2, totalPages: 1 } } });
    const html = render();
    expect(html).not.toContain(`aria-label="${fr("consultations.states.loading")}"`);
    expect(html).toContain("Amina Benali");
    expect(html).toContain("Douleur thoracique à l’effort");
    expect(html).toContain("Angor stable");
    expect(html).toContain("Fièvre");
    expect(html).toContain(fr("consultations.actions.new"));
    // The counters come from GET /consultations/stats.
    expect(html).toContain(">38 %<");
    expect(html).toContain(">8<");
  });

  it("shows the empty state, the error with a retry, and the pagination", () => {
    answer({ data: { data: [], meta: { limit: 20, page: 1, total: 0, totalPages: 0 } } });
    expect(render()).toContain(fr("consultations.table.empty"));

    answer({ error: Object.assign(new Error("x"), { isAxiosError: true, response: { data: {}, status: 403 } }), isError: true });
    const failed = render();
    expect(failed).toContain(fr("consultations.states.errorTitle"));
    expect(failed).toContain(fr("consultations.actions.retry"));
    expect(failed).toContain(fr("consultations.errors.forbidden"));

    answer({ data: { data: [row()], meta: { limit: 20, page: 1, total: 45, totalPages: 3 } } });
    expect(render()).toContain(fr("consultations.pagination.page", { page: 1, total: 3 }));
  });

  it("opens the detail of a consultation: the record, the appointment, the linked prescription and report", () => {
    searchParams = new URLSearchParams("consultation=c1");
    answer({ data: { data: [row()], meta: { limit: 20, page: 1, total: 1, totalPages: 1 } } });
    mockedDetail.mockReturnValue({ data: detail, error: null, isError: false, isLoading: false, refetch: jest.fn() });

    const html = render();

    expect(mockedDetail).toHaveBeenCalledWith("c1");
    expect(html).toContain('aria-labelledby="consultation-detail-title"');
    expect(html).toContain("Bêtabloquant");
    expect(html).toContain(fr("consultations.appointmentStatuses.COMPLETED"));
    // The linked items open their own detail.
    expect(html).toContain('href="/doctor/prescriptions?prescription=rx1"');
    expect(html).toContain("ORD-2026-000001");
    expect(html).toContain('href="/doctor/reports?report=r1"');
    expect(html).toContain("CR-2026-000001");
    expect(html).toContain('href="/doctor/patients/p1"');
    // A consultation is a piece of the record: nothing edits or deletes it.
    expect(html).toContain(fr("consultations.detail.recordNotice"));
  });

  it("loads the detail with skeletons, and explains a consultation that cannot be read", () => {
    searchParams = new URLSearchParams("consultation=c1");
    answer({ data: { data: [], meta: { limit: 20, page: 1, total: 0, totalPages: 0 } } });
    mockedDetail.mockReturnValue({ data: undefined, error: null, isError: false, isLoading: true, refetch: jest.fn() });
    expect(render()).toContain(`aria-label="${fr("consultations.states.loading")}"`);

    mockedDetail.mockReturnValue({ data: undefined, error: Object.assign(new Error("x"), { isAxiosError: true, response: { data: {}, status: 404 } }), isError: true, isLoading: false, refetch: jest.fn() });
    expect(render()).toContain(fr("consultations.errors.notFound"));
  });

  it("offers Prescribe and Write a report from the detail, each only with its right", () => {
    searchParams = new URLSearchParams("consultation=c1");
    answer({ data: { data: [row()], meta: { limit: 20, page: 1, total: 1, totalPages: 1 } } });
    mockedDetail.mockReturnValue({ data: detail, error: null, isError: false, isLoading: false, refetch: jest.fn() });

    const html = render();
    expect(html).toContain(fr("consultations.actions.prescribe"));
    expect(html).toContain(fr("consultations.actions.writeReport"));
  });

  it("uses the space of the establishment for its links", () => {
    searchParams = new URLSearchParams("consultation=c1");
    answer({ data: { data: [row()], meta: { limit: 20, page: 1, total: 1, totalPages: 1 } } });
    mockedDetail.mockReturnValue({ data: detail, error: null, isError: false, isLoading: false, refetch: jest.fn() });

    expect(render("ESTABLISHMENT")).toContain('href="/establishment/prescriptions?prescription=rx1"');
  });
});
