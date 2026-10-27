import { AxiosError, type AxiosResponse } from "axios";
import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import {
  useOrganization,
} from "../hooks/use-organization";
import { type OrganizationResponse } from "../types/organization.types";
import { OrganizationSettingsPage } from "./OrganizationSettingsPage";

// The page renders here without a session, a router or the API: the data
// hooks answer what each test says, the shell is reached through the same
// stand-ins as in AccountSettingsPage.test.tsx.
jest.mock("@/features/auth/hooks/use-logout", () => ({
  useLogout: () => ({ isLoading: false, logout: jest.fn() }),
}));
jest.mock("@/features/auth/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ data: undefined }),
}));
jest.mock(
  "@/features/verification/hooks/use-establishment-verification-prefill",
  () => ({
    useEstablishmentVerificationPrefill: () => ({ data: undefined }),
  }),
);
jest.mock("@/features/messaging/messaging.queries", () => ({
  useMessagingSettings: jest.fn(),
  useUnreadCount: () => ({ data: undefined }),
}));
jest.mock("@/features/messaging/messaging.mutations", () => ({
  useUpdateMessagingSettings: () => ({ isPending: false, mutate: jest.fn() }),
}));
jest.mock("@/features/notifications/hooks/useNotifications", () => ({
  useNotificationPreferences: () => ({
    data: undefined,
    isError: false,
    isLoading: false,
  }),
  useRecentNotifications: () => ({ data: undefined, isLoading: false }),
  useUnreadNotificationCount: () => ({ data: undefined }),
  useUpdateNotificationPreferences: () => ({
    isError: false,
    isPending: false,
    mutate: jest.fn(),
  }),
}));
jest.mock("@/lib/realtime/use-realtime-events", () => ({
  useRealtimeEvents: () => undefined,
}));
jest.mock("@/features/subscriptions/hooks/use-entitlements", () => ({
  useEntitlements: () => ({
    entitlements: null,
    isLoading: false,
    readOnly: false,
    refetch: jest.fn(),
  }),
}));
jest.mock("@/components/subscription/SubscriptionLimitDialog", () => ({
  SubscriptionLimitDialog: () => null,
}));

jest.mock("../hooks/use-organization", () => {
  const mutation = () => ({
    isPending: false,
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    variables: undefined,
  });
  return {
    useOrganization: jest.fn(),
    useUpdateOrganization: mutation,
    useUpdateOpeningHours: mutation,
  };
});

let mockLocale = "fr";
jest.mock("@/lib/i18n", () => ({
  ...jest.requireActual("@/lib/i18n"),
  useStoredLocale: () => ({ locale: mockLocale, setLocale: jest.fn() }),
}));

const mockedOrganization = useOrganization as jest.Mock;
const fr = (key: string, params?: Record<string, string | number>) =>
  translate(dictionaries.fr, key, params);

const clinic = (
  overrides: Partial<OrganizationResponse> = {},
): OrganizationResponse => ({
  capabilities: [
    "organization.read",
    "organization.readBasic",
    "organization.updateOperational",
    "team.read",
    "team.readBasic",
    "team.inviteDoctor",
    "team.revokeInvitation",
    "team.suspendMember",
    "team.reactivateMember",
    "team.sendPasswordReset",
  ],
  workspace: { id: "ws-1", type: "ESTABLISHMENT" },
  identity: {
    address: "5 avenue de l’ALN, Blida",
    establishmentId: "e1",
    name: "Clinique El Amel",
    source: "VERIFICATION_DATA",
    subscriptionStatus: "ACTIVE",
    type: "CLINIC",
    verificationStatus: "VERIFIED",
    wilaya: "Blida",
    commune: null,
  },
  legal: {
    authorizedActivityType: "Consultations externes",
    commercialRegisterIssuedAt: "2024-03-10T09:00:00.000Z",
    commercialRegisterNumber: "16/00-1234567 B 24",
    commercialRegisterWilaya: "Blida",
    healthAuthorizationAuthority: "Direction de la santé de Blida",
    healthAuthorizationIssuedAt: "2024-06-01T09:00:00.000Z",
    healthAuthorizationNumber: "DA-2024-00456",
    healthDirectionWilaya: "Blida",
    legalForm: "SARL",
    locked: true,
    nif: "000016123456789",
    nis: "099216001234567",
    representative: {
      fullName: "Nadia Hamidi",
      function: "Directrice générale",
    },
    taxCenter: "CPG Blida",
  },
  contacts: {
    phone: "0550 00 00 02",
    professionalEmail: "clinic@example.dz",
    website: "https://clinic.dz",
  },
  settings: {
    defaultAppointmentDuration: 30,
    dataProtectionOfficer: {
      email: "dpo@clinic.dz",
      name: "Nadia Hamidi",
      phone: null,
    },
    openingHours: {
      friday: { closed: true, periods: [] },
      monday: { closed: false, periods: [{ end: "12:00", start: "08:00" }] },
      saturday: { closed: true, periods: [] },
      sunday: { closed: true, periods: [] },
      thursday: { closed: true, periods: [] },
      tuesday: { closed: false, periods: [{ end: "16:00", start: "08:00" }] },
      wednesday: { closed: true, periods: [] },
    },
  },
  ...overrides,
});

const answer = (data: OrganizationResponse) =>
  mockedOrganization.mockReturnValue({
    data,
    error: null,
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  });
const answerLoading = () =>
  mockedOrganization.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isLoading: true,
    refetch: jest.fn(),
  });
const answerError = (status: number, body: object = {}) =>
  mockedOrganization.mockReturnValue({
    data: undefined,
    error: Object.assign(new AxiosError("x"), {
      response: { data: body, status } as AxiosResponse,
    }),
    isError: true,
    isLoading: false,
    refetch: jest.fn(),
  });

const render = () => renderToStaticMarkup(<OrganizationSettingsPage />);

// The opening tag of the control with this id.
const controlTag = (html: string, id: string) =>
  html.match(new RegExp(`<(?:input|select)[^>]*\\bid="${id}"[^>]*>`))?.[0] ??
  "";

const noHours: Partial<OrganizationResponse> = {
  settings: {
    defaultAppointmentDuration: 30,
    dataProtectionOfficer: null,
    openingHours: null,
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLocale = "fr";
  answer(clinic());
});

describe("OrganizationSettingsPage — identity", () => {
  it("shows the read-only identity of the establishment with its status and the ways to the other modules", () => {
    const html = render();

    expect(html).toContain("Clinique El Amel");
    expect(html).toContain("Blida");
    expect(html).toContain(fr("register.establishmentTypes.clinic"));
    // The identity is not an input anywhere: it cannot be edited here.
    expect(controlTag(html, "organization-name")).toBe("");
    expect(html).toContain(fr("account.profile.verificationStatuses.VERIFIED"));
    expect(html).toContain(fr("account.profile.subscriptionStatuses.ACTIVE"));
    expect(html).toContain('href="/establishment/verification"');
    expect(html).toContain('href="/establishment/subscription"');
    // Verified data: the padlock speaks.
    expect(html).toContain(fr("organization.identity.verifiedNote"));
    expect(html).not.toContain(fr("organization.identity.registrationNote"));
  });

  it("says the identity comes from the registration before any verification", () => {
    answer(
      clinic({
        identity: {
          ...clinic().identity,
          source: "REGISTRATION_DATA",
          verificationStatus: "DRAFT",
        },
      }),
    );

    const html = render();

    expect(html).toContain(fr("organization.identity.registrationNote"));
    expect(html).not.toContain(fr("organization.identity.verifiedNote"));
    expect(html).toContain(fr("account.profile.verificationStatuses.DRAFT"));
  });
});

describe("OrganizationSettingsPage — legal", () => {
  it("shows the verified legal paperwork next to a padlock, and never the representative national ID", () => {
    const html = render();

    expect(html).toContain(fr("organization.legal.lockedHelp"));
    expect(html).toContain("SARL");
    expect(html).toContain("16/00-1234567 B 24");
    expect(html).toContain("Nadia Hamidi");
    expect(html).toContain("Directrice générale");
    // 10/03/2024 in the French reading.
    expect(html).toContain("10/03/2024");
    // 14 informative rows of this dossier, and none of them editable.
    expect((html.match(/<dt /g) ?? []).length).toBeGreaterThanOrEqual(14);
    expect(controlTag(html, "organization-nif")).toBe("");
  });

  it("points to the verification when nothing legal is recorded yet", () => {
    answer(clinic({ legal: null }));

    const html = render();

    expect(html).toContain(fr("organization.legal.empty"));
    expect(html).not.toContain(fr("organization.legal.lockedHelp"));
  });
});

describe("OrganizationSettingsPage — the editable sections", () => {
  it("prefills the professional contacts, with the cleared-website note and the six durations", () => {
    const html = render();

    expect(controlTag(html, "organization-phone")).toContain(
      'value="0550 00 00 02"',
    );
    expect(controlTag(html, "organization-professionalEmail")).toContain(
      'value="clinic@example.dz"',
    );
    expect(controlTag(html, "organization-website")).toContain(
      'value="https://clinic.dz"',
    );
    expect(html).toContain(fr("organization.contacts.websiteHelp"));
    expect(html).toContain(">10 minutes</option>");
    expect(html).toContain(">60 minutes</option>");
  });

  it("starts every week day closed when no schedule exists", () => {
    answer(clinic(noHours));

    const html = render();

    for (const day of [
      "Dimanche",
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
    ]) {
      expect(html).toContain(day);
    }
    // Seven checkboxes, all checked = closed, and no time input at all.
    expect(html.match(/id="organization-hours-\w+-closed"/g)).toHaveLength(7);
    expect(html).not.toContain('type="time"');
  });

  it("shows the periods of the stored schedule with their times", () => {
    const html = render();

    expect(html).not.toContain(`>${fr("organization.hours.closed")}</p>`);
    expect(controlTag(html, "organization-hours-monday-start-0")).toContain(
      'value="08:00"',
    );
    expect(controlTag(html, "organization-hours-monday-end-0")).toContain(
      'value="12:00"',
    );
    expect(controlTag(html, "organization-hours-tuesday-start-0")).toContain(
      'value="08:00"',
    );
    // One add-period button per open day, none for a closed one.
    expect(html.split(fr("organization.hours.addPeriod")).length - 1).toBe(2);
    // The saved DPO phone is an empty value, not the raw null.
    expect(controlTag(html, "organization-dpo-phone")).toContain('value=""');
  });

  it("reads and edits the data protection officer, with its optional-set note", () => {
    const html = render();

    expect(controlTag(html, "organization-dpo-name")).toContain(
      'value="Nadia Hamidi"',
    );
    expect(controlTag(html, "organization-dpo-email")).toContain(
      'value="dpo@clinic.dz"',
    );
    expect(html).toContain(fr("organization.protection.help"));
  });

  it("keeps the three save actions out of reach until a change is made", () => {
    const html = render();

    // One primary save button per editable form section: contacts, opening
    // hours and the data protection officer.
    const saveButtons = html.match(/<button[^>]*type="submit"[^>]*>/g) ?? [];
    expect(saveButtons).toHaveLength(3);
    for (const button of saveButtons) expect(button).toContain("disabled");
    expect(
      (html.match(new RegExp(fr("organization.actions.save"), "g")) ?? [])
        .length,
    ).toBe(3);
  });
});

describe("OrganizationSettingsPage — states", () => {
  it("shows skeletons while it loads, and an error with a retry", () => {
    answerLoading();
    expect(render()).toContain(
      `aria-label="${fr("organization.states.loading")}"`,
    );

    answerError(403);
    const failed = render();
    expect(failed).toContain(fr("organization.states.errorTitle"));
    expect(failed).toContain(fr("organization.errors.forbidden"));
    expect(failed).not.toContain("Clinique El Amel");
  });

  it("answers the rate limit of the API with its own sentence", () => {
    answerError(429);

    expect(render()).toContain(fr("organization.errors.tooManyRequests"));
  });

  it("speaks Arabic when the interface does", () => {
    mockLocale = "ar";

    const html = render();

    expect(html).toContain("المنظمة");
    expect(html).toContain(
      translate(dictionaries.ar, "organization.hours.title"),
    );
    expect(html).not.toContain(fr("organization.hours.title"));
  });
});
