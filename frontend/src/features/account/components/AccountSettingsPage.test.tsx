import { AxiosError, type AxiosResponse } from "axios";
import { renderToStaticMarkup } from "react-dom/server";

import { useMessagingSettings } from "@/features/messaging/messaging.queries";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { useAccountProfile, useAccountSessions } from "../hooks/use-account";
import { type AccountProfile, type AccountSession } from "../types/account.types";
import { AccountSettingsPage } from "./AccountSettingsPage";

// The page renders here without a session, a router or the API: the data
// hooks answer what each test says, the shell is reached through the same
// stand-ins as in ConsultationsPage.test.tsx.
jest.mock("@/features/auth/hooks/use-logout", () => ({ useLogout: () => ({ isLoading: false, logout: jest.fn() }) }));
jest.mock("@/features/auth/hooks/use-current-user", () => ({ useCurrentUser: () => ({ data: undefined }) }));
jest.mock("@/features/verification/hooks/use-establishment-verification-prefill", () => ({
  useEstablishmentVerificationPrefill: () => ({ data: undefined }),
}));
jest.mock("@/features/messaging/messaging.queries", () => ({ useMessagingSettings: jest.fn(), useUnreadCount: () => ({ data: undefined }) }));
jest.mock("@/features/messaging/messaging.mutations", () => ({ useUpdateMessagingSettings: () => ({ isPending: false, mutate: jest.fn() }) }));
jest.mock("@/features/notifications/hooks/useNotifications", () => ({
  useNotificationPreferences: () => ({
    data: [
      { category: "APPOINTMENT", inAppEnabled: true, mandatory: false },
      { category: "SECURITY", inAppEnabled: true, mandatory: true },
    ],
    isError: false,
    isLoading: false,
  }),
  useRecentNotifications: () => ({ data: undefined, isLoading: false }),
  useUnreadNotificationCount: () => ({ data: undefined }),
  useUpdateNotificationPreferences: () => ({ isError: false, isPending: false, mutate: jest.fn() }),
}));
jest.mock("@/lib/realtime/use-realtime-events", () => ({ useRealtimeEvents: () => undefined }));
// The subscription banner and its dialog, reached through the shell, are tested on their own.
jest.mock("@/features/subscriptions/hooks/use-entitlements", () => ({
  useEntitlements: () => ({ entitlements: null, isLoading: false, readOnly: false, refetch: jest.fn() }),
}));
jest.mock("@/components/subscription/SubscriptionLimitDialog", () => ({ SubscriptionLimitDialog: () => null }));

let searchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));

let mockLocale = "fr";
jest.mock("@/lib/i18n", () => ({
  ...jest.requireActual("@/lib/i18n"),
  useStoredLocale: () => ({ locale: mockLocale, setLocale: jest.fn() }),
}));

jest.mock("../hooks/use-account", () => {
  const mutation = () => ({ isPending: false, mutate: jest.fn(), mutateAsync: jest.fn(), variables: undefined });
  return {
    useAccountProfile: jest.fn(),
    useAccountSessions: jest.fn(),
    useChangeAccountPassword: mutation,
    useRevokeAccountSession: mutation,
    useRevokeOtherAccountSessions: mutation,
    useUpdateAccountProfile: mutation,
  };
});

const mockedProfile = useAccountProfile as jest.Mock;
const mockedSessions = useAccountSessions as jest.Mock;
const mockedMessaging = useMessagingSettings as jest.Mock;
const fr = (key: string, params?: Record<string, string | number>) => translate(dictionaries.fr, key, params);

const doctor = (overrides: Partial<AccountProfile> = {}): AccountProfile => ({
  accountStatus: "ACTIVE",
  createdAt: "2026-01-10T09:00:00.000Z",
  doctor: { address: "12 rue Didouche Mourad, Alger", establishmentName: null, isIndependent: true, speciality: "Cardiologie", wilaya: "Alger" },
  email: "doctor@example.dz",
  establishment: null,
  fullName: "Samir Kaci",
  id: "u1",
  isEmailVerified: false,
  isPhoneVerified: true,
  kind: "DOCTOR",
  lockedFields: ["fullName", "speciality", "wilaya"],
  phone: "0550000001",
  role: "INDEPENDENT_DOCTOR",
  subscriptionStatus: "NO_PLAN",
  verificationStatus: "VERIFIED",
  ...overrides,
});

const clinic = (overrides: Partial<AccountProfile> = {}): AccountProfile =>
  doctor({
    doctor: null,
    email: "clinic@example.dz",
    establishment: { address: "5 avenue de l’ALN, Blida", managerFullName: "Nadia Hamidi", name: "Clinique El Amel", phone: "0550000002", professionalEmail: "clinic@example.dz", type: "CLINIC", wilaya: "Blida" },
    fullName: "Nadia Hamidi",
    kind: "ESTABLISHMENT",
    lockedFields: [],
    role: "ESTABLISHMENT_ADMIN",
    ...overrides,
  });

const answer = (hook: jest.Mock, query: object) => hook.mockReturnValue({ data: undefined, error: null, isError: false, isLoading: false, refetch: jest.fn(), ...query });
const render = (accountType: "DOCTOR" | "ESTABLISHMENT" = "DOCTOR") => renderToStaticMarkup(<AccountSettingsPage accountType={accountType} />);

// The opening tag of the control with this id.
const controlTag = (html: string, id: string) => html.match(new RegExp(`<(?:input|select)[^>]*\\bid="${id}"[^>]*>`))?.[0] ?? "";
const isDisabled = (html: string, id: string) => /\bdisabled(=""|\s|>)/.test(controlTag(html, id));

const session = (overrides: Partial<AccountSession> = {}): AccountSession => ({
  browser: "Chrome",
  createdAt: "2026-10-23T09:00:00.000Z",
  current: false,
  expiresAt: "2026-10-30T09:00:00.000Z",
  id: "s1",
  ipAddress: "41.200.x.x",
  os: "Windows",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = new URLSearchParams();
  mockLocale = "fr";
  answer(mockedProfile, { data: doctor() });
  answer(mockedSessions, { data: [] });
  answer(mockedMessaging, { data: { discoverableByPeers: true, shareReadReceipts: true } });
});

describe("AccountSettingsPage — profile", () => {
  it("locks the identity of a verified doctor, with a padlock and why, and leaves the phone and the address free", () => {
    const html = render();

    for (const id of ["account-fullName", "account-speciality", "account-wilaya"]) {
      expect(isDisabled(html, id)).toBe(true);
    }
    for (const id of ["account-phone", "account-address"]) {
      expect(isDisabled(html, id)).toBe(false);
    }
    // One padlock and one explanation per locked field.
    expect(html.split(fr("account.profile.locked")).length - 1).toBe(3);
    expect(html.split(fr("account.profile.lockedHelp")).length - 1).toBe(3);
    // The login is shown, and not editable here.
    expect(controlTag(html, "account-email")).toContain("readOnly");
    expect(html).toContain(fr("account.profile.emailHelp"));
  });

  it("does not lock anything before the verification is approved", () => {
    answer(mockedProfile, { data: doctor({ lockedFields: [], verificationStatus: "PENDING_VERIFICATION" }) });

    const html = render();

    for (const id of ["account-fullName", "account-speciality", "account-wilaya", "account-phone", "account-address"]) {
      expect(isDisabled(html, id)).toBe(false);
    }
    expect(html).not.toContain(fr("account.profile.lockedHelp"));
    expect(html).toContain(fr("account.profile.verificationStatuses.PENDING_VERIFICATION"));
  });

  it("keeps only the personal data of an establishment account and points to the organization module", () => {
    answer(mockedProfile, { data: clinic() });

    const html = render("ESTABLISHMENT");

    // Personal identity and personal phone only: the establishment row is
    // never a side effect of the account settings.
    expect(isDisabled(html, "account-fullName")).toBe(false);
    expect(isDisabled(html, "account-phone")).toBe(false);
    for (const id of ["account-establishmentName", "account-establishmentType", "account-wilaya", "account-address", "account-speciality"]) {
      expect(controlTag(html, id)).toBe("");
    }
    expect(html).toContain(fr("account.profile.organizationNote.message"));
    expect(html).toContain('href="/establishment/organization"');
    expect(html).toContain(fr("account.profile.verificationStatuses.VERIFIED"));
    expect(html).toContain('href="/establishment/verification"');
    expect(html).toContain('href="/establishment/subscription"');
  });

  it("names the tab in the address, so that a section can be shared", () => {
    const html = render();

    expect(html).toContain('href="/doctor/settings?tab=security"');
    expect(html).toContain('href="/doctor/settings?tab=language"');
    expect(html).toContain('aria-current="page"');
  });

  it("shows skeletons while it loads, and an error with a retry", () => {
    answer(mockedProfile, { data: undefined, isLoading: true });
    expect(render()).toContain(`aria-label="${fr("account.states.loading")}"`);

    answer(mockedProfile, { data: undefined, error: Object.assign(new AxiosError("x"), { response: { data: {}, status: 403 } as AxiosResponse }), isError: true });
    const failed = render();
    expect(failed).toContain(fr("account.states.errorTitle"));
    expect(failed).toContain(fr("account.states.retry"));
    expect(failed).toContain(fr("account.errors.forbidden"));
  });
});

describe("AccountSettingsPage — security", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams("tab=security");
  });

  it("offers the password change, with the strength of the registration", () => {
    const html = render();

    expect(html).toContain(fr("account.security.password.currentLabel"));
    expect(html).toContain(fr("account.security.password.newLabel"));
    expect(html).toContain(fr("account.security.password.confirmLabel"));
    expect(html).toContain(fr("register.password.hint"));
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('autoComplete="new-password"');
  });

  it("lists the sessions, marks this device and lets the others be closed", () => {
    answer(mockedSessions, { data: [session({ browser: "Safari", id: "s2", os: "iOS" }), session({ current: true, id: "s1" })] });

    const html = render();

    expect(html).toContain("Chrome sur Windows");
    expect(html).toContain("Safari sur iOS");
    expect(html).toContain(fr("account.security.sessions.current"));
    expect(html).toContain("41.200.x.x");
    // One "Déconnecter" for the other device, none for this one.
    expect(html.split(`${fr("account.security.sessions.revoke")}</button>`).length - 1).toBe(1);
    const revokeOthers = html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${fr("account.security.sessions.revokeOthers")}`))?.[0] ?? "";
    expect(revokeOthers).not.toContain("disabled");
  });

  it("has nothing to close when this device is the only one", () => {
    answer(mockedSessions, { data: [session({ current: true })] });

    const html = render();

    expect(html).not.toContain(`${fr("account.security.sessions.revoke")}</button>`);
    const revokeOthers = html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${fr("account.security.sessions.revokeOthers")}`))?.[0] ?? "";
    expect(revokeOthers).toContain("disabled");
  });
});

describe("AccountSettingsPage — the other sections", () => {
  it("lists the categories of notifications of the drawer", () => {
    searchParams = new URLSearchParams("tab=notifications");

    const html = render();

    expect(html).toContain(fr("notifications.categories.APPOINTMENT"));
    expect(html).toContain(fr("notifications.preferences.mandatoryNotice"));
    expect(html).toContain(fr("account.notifications.save"));
  });

  it("shows the two privacy switches of the messaging", () => {
    searchParams = new URLSearchParams("tab=messaging");

    const html = render();

    expect(html.match(/role="switch"/g)).toHaveLength(2);
    expect(html).toContain("Accusés de lecture");
  });

  it("explains that the messaging waits for the verification of the account", () => {
    searchParams = new URLSearchParams("tab=messaging");
    answer(mockedMessaging, { data: undefined, error: Object.assign(new AxiosError("x"), { response: { data: { code: "VERIFICATION_REQUIRED" }, status: 403 } as AxiosResponse }), isError: true });

    const html = render();

    expect(html).toContain(fr("account.messaging.unverified"));
    expect(html).toContain('href="/doctor/verification"');
    expect(html).not.toContain('role="switch"');
  });

  it("offers French and Arabic, the current one checked", () => {
    searchParams = new URLSearchParams("tab=language");

    const html = render();

    const radios = html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(2);
    expect(radios.find((tag) => tag.includes('lang="fr"'))).toContain('aria-checked="true"');
    expect(radios.find((tag) => tag.includes('lang="ar"'))).toContain('aria-checked="false"');
    expect(html).toContain("العربية");
  });

  it("speaks Arabic when the interface does", () => {
    mockLocale = "ar";

    const html = render();

    expect(html).toContain("إعدادات الحساب");
    expect(html).toContain(translate(dictionaries.ar, "account.profile.lockedHelp"));
    expect(html).not.toContain(fr("account.profile.lockedHelp"));
  });
});
