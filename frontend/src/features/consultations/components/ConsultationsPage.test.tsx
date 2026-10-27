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
// The subscription banner and its dialog, reached through the shell, are tested on their own.
jest.mock("@/features/subscriptions/hooks/use-entitlements", () => ({
  useEntitlements: () => ({ entitlements: null, isLoading: false, readOnly: false, refetch: jest.fn() }),
}));
jest.mock("@/components/subscription/SubscriptionLimitDialog", () => ({ SubscriptionLimitDialog: () => null }));

let searchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));

jest.mock("../hooks/use-consultations", () => ({
  useConsultationCapabilities: () => ({
    capabilities: {
      canAddAddendum: true,
      canCancelConsultation: true,
      canCompleteConsultation: true,
      canCreateConsultation: true,
      canEditConsultation: true,
      canStartConsultation: true,
      canViewConsultations: true,
    },
  }),
  useConsultationFilterOptions: () => ({
    data: { doctors: [{ fullName: "Samir Kaci", id: "d1", speciality: "Cardiologie" }], patients: [] },
  }),
  useConsultationStats: () => ({ data: { month: 8, prescriptionShare: 38, today: 1, week: 4, withPrescription: 3 }, isLoading: false }),
  useConsultations: jest.fn(),
}));
jest.mock("../hooks/use-consultation", () => ({
  useConsultation: jest.fn(),
  useConsultationClinicalContext: jest.fn(() => ({ data: undefined, isError: false, isLoading: false, refetch: jest.fn() })),
}));
// The mutations of the detail drawer and of the editor: not triggered while rendering.
jest.mock("../hooks/use-consultation-mutations", () => ({
  useConsultationMutations: () => ({ addendum: { isPending: false }, cancel: { isPending: false }, complete: { isPending: false }, create: { isPending: false }, start: { isPending: false }, update: { isPending: false } }),
}));
jest.mock("@/features/prescriptions/hooks/use-prescription-capabilities", () => ({
  usePrescriptionCapabilities: () => ({ capabilities: { canCreatePrescription: true } }),
}));
jest.mock("@/features/reports/hooks/use-report-capabilities", () => ({
  useReportCapabilities: () => ({ capabilities: { canCreateReports: true } }),
}));
jest.mock("@/features/subscriptions/hooks/use-read-only-action", () => ({
  useReadOnlyAction: () => ({ disabled: false, title: undefined }),
}));

const mockedList = useConsultations as jest.Mock;
const mockedDetail = useConsultation as jest.Mock;
const fr = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);

const patient = { birthDate: "1985-03-12", bloodGroup: "A+", firstName: "Amina", firstNameAr: "أمينة", gender: "FEMALE" as const, hospitalRecordNumber: "DOS-001", id: "p1", lastName: "Benali", lastNameAr: "بن علي" };

const row = (overrides: Partial<ConsultationListItem> = {}): ConsultationListItem => ({
  appointmentId: null,
  completedAt: "2026-10-20T10:20:00.000Z",
  chiefComplaint: "Douleur thoracique à l’effort",
  doctor: { fullName: "Samir Kaci", id: "d1", speciality: "Cardiologie" },
  id: "c1",
  occurredAt: "2026-10-20T09:00:00.000Z",
  patient,
  prescriptionCount: 2,
  primaryDiagnosis: "Angor stable",
  reportCount: 1,
  startedAt: "2026-10-20T09:00:00.000Z",
  status: "COMPLETED",
  ...overrides,
});

const detail: ConsultationDetail = {
  addenda: [],
  appointment: { durationMinutes: 30, id: "apt-1", reason: "Suivi", scheduledAt: "2026-10-20T08:30:00.000Z", status: "COMPLETED" },
  appointmentId: "apt-1",
  canceledAt: null,
  cancellationReason: null,
  carePlan: "Bêtabloquant",
  chiefComplaint: "Douleur thoracique à l’effort",
  clinicalExamination: null,
  completedAt: "2026-10-20T10:20:00.000Z",
  completedBy: { fullName: "Samir Kaci", id: "u1" },
  createdAt: "2026-10-20T09:30:00.000Z",
  diagnoses: [],
  doctor: { fullName: "Samir Kaci", id: "d1", speciality: "Cardiologie" },
  followUpPlan: null,
  historyPresentIllness: null,
  id: "c1",
  patient,
  prescriptions: [{ effectiveStatus: "VALIDATED", id: "rx1", itemCount: 2, number: "ORD-2026-000001", prescribedAt: "2026-10-20T10:00:00.000Z", status: "VALIDATED", type: "STANDARD" }],
  reports: [{ category: "CONSULTATION_NOTE", effectiveDate: "2026-10-20T11:00:00.000Z", finalizedAt: "2026-10-20T11:05:00.000Z", id: "r1", number: "CR-2026-000001", sourceType: "CONSULTATION", status: "FINAL", title: "Note de suivi", version: 1 }],
  assessment: "Angor stable",
  startedAt: "2026-10-20T09:00:00.000Z",
  status: "COMPLETED",
  updatedAt: "2026-10-20T10:20:00.000Z",
  vitalSigns: null,
  workspaceId: "w1",
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

  it("then lists the consultations of the API, with their status and the counters", () => {
    answer({ data: { data: [row(), row({ id: "c2", prescriptionCount: 0, chiefComplaint: "Fièvre", primaryDiagnosis: "Grippe", reportCount: 0, status: "IN_PROGRESS" })], meta: { limit: 20, page: 1, total: 2, totalPages: 1 } } });
    const html = render();
    expect(html).not.toContain(`aria-label="${fr("consultations.states.loading")}"`);
    expect(html).toContain("Amina Benali");
    expect(html).toContain("Douleur thoracique à l’effort");
    expect(html).toContain("Angor stable");
    expect(html).toContain("Fièvre");
    expect(html).toContain(fr("consultations.statuses.COMPLETED"));
    expect(html).toContain(fr("consultations.statuses.IN_PROGRESS"));
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

  it("opens the detail of a completed consultation: the record, the appointment, the linked prescription and report", () => {
    searchParams = new URLSearchParams("consultation=c1");
    answer({ data: { data: [row()], meta: { limit: 20, page: 1, total: 1, totalPages: 1 } } });
    mockedDetail.mockReturnValue({ data: detail, error: null, isError: false, isLoading: false, refetch: jest.fn() });

    const html = render();

    expect(mockedDetail).toHaveBeenCalledWith("c1");
    expect(html).toContain('aria-labelledby="consultation-detail-title"');
    expect(html).toContain("Bêtabloquant");
    expect(html).toContain(fr("consultations.detail.appointment"));
    // The linked items open their own detail.
    expect(html).toContain('href="/doctor/prescriptions?prescription=rx1"');
    expect(html).toContain("ORD-2026-000001");
    expect(html).toContain('href="/doctor/reports?report=r1"');
    expect(html).toContain("CR-2026-000001");
    expect(html).toContain('href="/doctor/patients/p1"');
    // A consultation is a piece of the record: nothing edits or deletes it here.
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

  it("offers to edit a draft, to prescribe and to write a report from the detail, each only with its right", () => {
    searchParams = new URLSearchParams("consultation=c1");
    answer({ data: { data: [row({ status: "DRAFT", completedAt: null })], meta: { limit: 20, page: 1, total: 1, totalPages: 1 } } });
    mockedDetail.mockReturnValue({ data: { ...detail, status: "DRAFT" as const }, error: null, isError: false, isLoading: false, refetch: jest.fn() });

    const html = render();
    expect(html).toContain(fr("consultations.actions.edit"));
    expect(html).toContain(fr("consultations.actions.prescribe"));
    expect(html).toContain(fr("consultations.actions.writeReport"));
  });

  it("withholds the edit of a completed consultation: only an addendum completes it", () => {
    searchParams = new URLSearchParams("consultation=c1");
    answer({ data: { data: [row()], meta: { limit: 20, page: 1, total: 1, totalPages: 1 } } });
    mockedDetail.mockReturnValue({ data: detail, error: null, isError: false, isLoading: false, refetch: jest.fn() });

    const html = render();
    expect(html).not.toContain(fr("consultations.actions.edit"));
    expect(html).toContain(fr("consultations.detail.addAddendum"));
  });

  it("uses the space of the establishment for its links", () => {
    searchParams = new URLSearchParams("consultation=c1");
    answer({ data: { data: [row()], meta: { limit: 20, page: 1, total: 1, totalPages: 1 } } });
    mockedDetail.mockReturnValue({ data: detail, error: null, isError: false, isLoading: false, refetch: jest.fn() });

    expect(render("ESTABLISHMENT")).toContain('href="/establishment/prescriptions?prescription=rx1"');
  });
});
