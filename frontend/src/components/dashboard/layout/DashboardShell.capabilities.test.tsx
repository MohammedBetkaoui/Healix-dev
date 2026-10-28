import { renderToStaticMarkup } from "react-dom/server";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { useAccountProfile } from "@/features/account/hooks/use-account";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

// The pages render here without a session, a router or the API: only what
// reaches the shell is replaced. The workspace access decides which
// management entries the menu shows (§13-15, §35).
jest.mock("@/features/auth/hooks/use-logout", () => ({
  useLogout: () => ({ isLoading: false, logout: jest.fn() }),
}));
jest.mock("@/features/auth/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ data: undefined }),
}));
jest.mock("@/features/account/hooks/use-account", () => ({
  useAccountProfile: jest.fn(),
}));
// The shell's unread badge and real-time connection (Messages).
jest.mock("@/features/messaging/messaging.queries", () => ({
  useUnreadCount: () => ({ data: undefined }),
}));
jest.mock("@/features/notifications/hooks/useNotifications", () => ({
  useRecentNotifications: () => ({ data: undefined, isLoading: false }),
  useUnreadNotificationCount: () => ({ data: undefined }),
}));
jest.mock("@/lib/realtime/use-realtime-events", () => ({
  useRealtimeEvents: () => undefined,
}));
// The subscription banner and its dialog, reached through the shell, are tested on their own.
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

const mockedAccount = useAccountProfile as jest.Mock;

// The OWNER access the backend answers (account.spec asserts the exact
// list); the ADMIN one without its owner-only capabilities.
const OWNER_ACCESS = {
  capabilities: [
    "organization.read",
    "organization.readBasic",
    "organization.update",
    "organization.updateOperational",
    "team.read",
    "team.readBasic",
    "team.inviteDoctor",
    "team.inviteAdmin",
    "team.revokeInvitation",
    "team.suspendMember",
    "team.reactivateMember",
    "team.sendPasswordReset",
    "subscription.manage",
    "verification.manage",
  ],
  role: "OWNER",
};
const ADMIN_ACCESS = {
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
  role: "ADMIN",
};

function renderShell() {
  return renderToStaticMarkup(
    <DashboardShell
      accountType="ESTABLISHMENT"
      activeKey="dashboard"
      navSections={establishmentNavSections}
      titleKey="dashboard.clinical.nav.overview"
      user={{
        accountType: "ESTABLISHMENT",
        footerSubtitle: "Administration",
        initials: "HD",
        name: "Administration",
        roleKey: "dashboard.common.roles.establishment",
        workspaceSubtitle: translate(
          dictionaries.fr,
          "dashboard.clinical.workspace",
        ),
      }}
    >
      <p>contenu</p>
    </DashboardShell>,
  );
}

describe("the establishment menu of the shell", () => {
  afterEach(() => jest.resetAllMocks());

  it("shows every management entry to the owner", () => {
    mockedAccount.mockReturnValue({ data: { workspaceAccess: OWNER_ACCESS } });
    const html = renderShell();

    expect(html).toContain('href="/establishment/verification"');
    expect(html).toContain('href="/establishment/subscription"');
    expect(html).toContain('href="/establishment/organization"');
    expect(html).toContain('href="/establishment/team"');
  });

  it("keeps the operational entries of an invited administrator, and hides the owner-only ones", () => {
    mockedAccount.mockReturnValue({ data: { workspaceAccess: ADMIN_ACCESS } });
    const html = renderShell();

    expect(html).toContain('href="/establishment/organization"');
    expect(html).toContain('href="/establishment/team"');
    expect(html).not.toContain('href="/establishment/verification"');
    expect(html).not.toContain('href="/establishment/subscription"');
  });

  it("hides the gated entries while the access is unknown", () => {
    mockedAccount.mockReturnValue({ data: undefined });
    const html = renderShell();

    expect(html).toContain('href="/establishment/dashboard"');
    expect(html).not.toContain('href="/establishment/verification"');
    expect(html).not.toContain('href="/establishment/subscription"');
  });

  it("words the entries in French", () => {
    mockedAccount.mockReturnValue({ data: { workspaceAccess: OWNER_ACCESS } });

    expect(renderShell()).toContain(
      translate(dictionaries.fr, "dashboard.sidebar.establishment.team"),
    );
  });
});
