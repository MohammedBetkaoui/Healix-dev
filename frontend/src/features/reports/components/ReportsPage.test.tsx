import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { useReports } from "../hooks/use-reports";
import { type ReportListItem } from "../types/report.types";
import { ReportsPage } from "./ReportsPage";

// The page renders here without a session, a router or the API: the data
// hooks answer what each test says, the shell is reached through the same
// stand-ins as in config/demo-modules.test.tsx.
jest.mock("@/features/auth/hooks/use-logout", () => ({ useLogout: () => ({ isLoading: false, logout: jest.fn() }) }));
jest.mock("@/features/auth/hooks/use-current-user", () => ({ useCurrentUser: () => ({ data: undefined }) }));
// The account profile names the workspace (subtitle); the shell reads the
// workspace access to gate the owner-only menu entries.
jest.mock("@/features/account/hooks/use-account", () => ({
  useAccountProfile: jest.fn(() => ({ data: undefined })),
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
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("@/features/ai-analyses/hooks/use-ai-runs-overview", () => ({
  useAiRunsOverview: () => ({ data: { items: [] }, isError: false, isLoading: false }),
}));

jest.mock("../hooks/use-reports", () => ({
  useReportFilterOptions: () => ({ data: { authors: [], patients: [] } }),
  useReportStats: () => ({ data: { aiValidated: 3, amended: 1, final: 8, month: 14, toFinalize: 2 }, isLoading: false }),
  useReports: jest.fn(),
}));
jest.mock("../hooks/use-report-capabilities", () => ({
  useReportCapabilities: () => ({
    capabilities: {
      canAmendReports: true,
      canCancelReports: true,
      canCreateReports: true,
      canDownloadReports: true,
      canFinalizeReports: true,
      canPrintReports: true,
      canShareReports: false,
      canViewReports: true,
    },
  }),
}));

const mockedList = useReports as jest.Mock;
const fr = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);

const row = (overrides: Partial<ReportListItem>): ReportListItem => ({
  ai: null,
  author: { fullName: "Samir Kaci", id: "u1" },
  canceledAt: null,
  category: "CONSULTATION_NOTE",
  createdAt: "2026-10-19T10:00:00.000Z",
  documentAvailable: true,
  effectiveDate: "2026-10-19T10:00:00.000Z",
  finalizedAt: "2026-10-19T10:05:00.000Z",
  id: "r1",
  isAmendment: false,
  isCurrent: true,
  number: "CR-2026-000001",
  patient: { birthDate: "1985-03-12", firstName: "Amina", firstNameAr: "أمينة", gender: "FEMALE", hospitalRecordNumber: "DOS-001", id: "p1", lastName: "Benali", lastNameAr: "بن علي" },
  sourceType: "CONSULTATION",
  status: "FINAL",
  supersededAt: null,
  title: "Note de suivi cardiologique",
  validator: { fullName: "Samir Kaci", id: "u1" },
  version: 1,
  ...overrides,
});

const render = () => renderToStaticMarkup(<ReportsPage accountType="DOCTOR" />);
const answer = (query: object) => mockedList.mockReturnValue({ data: undefined, error: null, isError: false, isLoading: false, refetch: jest.fn(), ...query });

beforeEach(() => jest.clearAllMocks());

describe("ReportsPage", () => {
  it("shows skeletons while the first page loads", () => {
    answer({ isLoading: true });
    const html = render();
    expect(html).toContain(`aria-label="${fr("reports.states.loading")}"`);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain(fr("reports.table.empty"));
    expect(html).not.toContain("CR-2026-000001");
  });

  it("then lists the reports of the API, AI reports included", () => {
    answer({
      data: {
        data: [
          row({}),
          row({ category: "AI_BRAIN", id: "r2", number: "CR-IA-2026-000007", sourceType: "AI_ANALYSIS", title: "Compte rendu IA — Brain", ai: { patientId: "p1", pipeline: "brain", runId: "run-1" } }),
          row({ id: "r3", isAmendment: true, number: "CR-2026-000009", status: "AMENDED", version: 2 }),
          row({ documentAvailable: false, id: "r4", number: null, status: "DRAFT" }),
        ],
        meta: { limit: 20, page: 1, total: 4, totalPages: 1 },
      },
    });
    const html = render();
    expect(html).not.toContain(`aria-label="${fr("reports.states.loading")}"`);
    for (const number of ["CR-2026-000001", "CR-IA-2026-000007", "CR-2026-000009"]) expect(html).toContain(number);
    expect(html).toContain("Amina Benali");
    expect(html).toContain(fr("reports.categories.AI_BRAIN"));
    for (const status of ["FINAL", "AMENDED", "DRAFT"]) expect(html).toContain(fr(`reports.statuses.${status}`));
    expect(html).toContain(fr("reports.common.pendingReference"));
    expect(html).toContain("v2");
    // The counters come from GET /reports/stats.
    expect(html).toContain(">14<");
    // The doctor space: links to the patient record of the doctor.
    expect(html).toContain("/doctor/patients/p1?tab=reports");
  });

  it("shows the empty state when the API returns nothing", () => {
    answer({ data: { data: [], meta: { limit: 20, page: 1, total: 0, totalPages: 0 } } });
    expect(render()).toContain(fr("reports.table.empty"));
  });

  it("shows the error with a retry button, and the translated reason", () => {
    answer({ error: Object.assign(new Error("x"), { isAxiosError: true, response: { data: { code: "REPORT_PERMISSION_DENIED" }, status: 403 } }), isError: true });
    const html = render();
    expect(html).toContain(fr("reports.states.errorTitle"));
    expect(html).toContain(fr("reports.actions.retry"));
    expect(html).toContain(fr("reports.errors.REPORT_PERMISSION_DENIED"));
  });

  it("offers to create and import, since the API granted it", () => {
    answer({ data: { data: [], meta: { limit: 20, page: 1, total: 0, totalPages: 0 } } });
    const html = render();
    expect(html).toContain(fr("reports.actions.new"));
    expect(html).toContain(fr("reports.actions.import"));
  });

  it("paginates when there is more than a page", () => {
    answer({ data: { data: [row({})], meta: { limit: 20, page: 1, total: 45, totalPages: 3 } } });
    expect(render()).toContain(fr("reports.pagination.page", { page: 1, total: 3 }));
  });
});
