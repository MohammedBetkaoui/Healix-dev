import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { usePrescriptions } from "../hooks/use-prescriptions";
import { type PrescriptionListItem } from "../types/prescription.types";
import { PrescriptionsPage } from "./PrescriptionsPage";

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

jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("../hooks/use-prescriptions", () => ({
  usePrescriptionFilterOptions: () => ({ data: { patients: [], prescribers: [] } }),
  usePrescriptions: jest.fn(),
  usePrescriptionStats: () => ({ data: { alerts: 2, canceled: 1, drafts: 3, month: 12, renewSoon: 4 }, isLoading: false }),
}));
jest.mock("../hooks/use-medication-search", () => ({ useMedicationOptions: () => ({ data: [] }) }));
jest.mock("../hooks/use-prescription-mutations", () => ({ useRenewPrescription: () => ({ mutate: jest.fn() }) }));
jest.mock("../hooks/use-prescription-capabilities", () => ({
  usePrescriptionCapabilities: () => ({
    capabilities: {
      canCancelPrescription: true,
      canCreatePrescription: true,
      canEditPrescription: true,
      canPrintPrescription: true,
      canSignPrescription: true,
      canViewPrescriptions: true,
    },
  }),
}));

const mockedList = usePrescriptions as jest.Mock;
const fr = (key: string) => translate(dictionaries.fr, key);

const row = (overrides: Partial<PrescriptionListItem>): PrescriptionListItem => ({
  canceledAt: null,
  documentAvailable: true,
  effectiveStatus: "VALIDATED",
  id: "rx-1",
  itemCount: 1,
  medications: [{ brandName: "Doliprane", dci: "Paracétamol" }],
  number: "ORD-2026-000001",
  patient: { firstName: "Amina", firstNameAr: "أمينة", hospitalRecordNumber: "DOS-001", id: "p1", lastName: "Benali", lastNameAr: "بن علي" },
  prescribedAt: "2026-10-19T10:00:00.000Z",
  prescriber: { fullName: "Samir Kaci", id: "d1" },
  printCount: 0,
  printedAt: null,
  status: "VALIDATED",
  type: "STANDARD",
  validUntil: null,
  validatedAt: "2026-10-19T10:05:00.000Z",
  ...overrides,
});

const render = () => renderToStaticMarkup(<PrescriptionsPage accountType="DOCTOR" />);
const answer = (query: object) => mockedList.mockReturnValue({ data: undefined, error: null, isError: false, isLoading: false, refetch: jest.fn(), ...query });

beforeEach(() => jest.clearAllMocks());

describe("PrescriptionsPage", () => {
  it("shows skeletons while the first page loads", () => {
    answer({ isLoading: true });
    const html = render();
    expect(html).toContain(`aria-label="${fr("prescriptions.states.loading")}"`);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain(fr("prescriptions.empty.title"));
    expect(html).not.toContain("ORD-2026-000001");
  });

  it("then lists the prescriptions of the API with their status", () => {
    answer({
      data: {
        data: [
          row({}),
          row({ id: "rx-2", number: "ORD-2026-000002", printedAt: "2026-10-20T08:00:00.000Z" }),
          row({ effectiveStatus: "EXPIRED", id: "rx-3", number: "ORD-2026-000003" }),
          row({ documentAvailable: false, effectiveStatus: "DRAFT", id: "rx-4", number: null, status: "DRAFT" }),
        ],
        meta: { limit: 20, page: 1, total: 4, totalPages: 1 },
      },
    });
    const html = render();
    expect(html).not.toContain(`aria-label="${fr("prescriptions.states.loading")}"`);
    for (const number of ["ORD-2026-000001", "ORD-2026-000002", "ORD-2026-000003"]) expect(html).toContain(number);
    expect(html).toContain("Amina Benali");
    expect(html).toContain("Dr. Samir Kaci");
    expect(html).toContain("Paracétamol");
    // VALIDATED, PRINTED (from printedAt), EXPIRED (from the API) and DRAFT.
    for (const status of ["validated", "printed", "expired", "draft"]) expect(html).toContain(fr(`prescriptions.statuses.${status}`));
    expect(html).toContain(fr("prescriptions.common.draftNumber"));
    // The counters come from GET /prescriptions/stats.
    expect(html).toContain(">12<");
  });

  it("shows the empty state when the API returns nothing", () => {
    answer({ data: { data: [], meta: { limit: 20, page: 1, total: 0, totalPages: 0 } } });
    expect(render()).toContain(fr("prescriptions.empty.title"));
  });

  it("shows the error with a retry button, and the translated reason", () => {
    answer({ error: Object.assign(new Error("x"), { isAxiosError: true, response: { data: { code: "PRESCRIPTION_PERMISSION_DENIED" }, status: 403 } }), isError: true });
    const html = render();
    expect(html).toContain(fr("prescriptions.states.errorTitle"));
    expect(html).toContain(fr("prescriptions.actions.retry"));
    expect(html).toContain(fr("prescriptions.errors.PRESCRIPTION_PERMISSION_DENIED"));
  });

  it("reads no mock: nothing is listed when the API has nothing", () => {
    answer({ data: { data: [], meta: { limit: 20, page: 1, total: 0, totalPages: 0 } } });
    expect(render()).not.toMatch(/ORD-2026-00\d{4}/);
  });
});
