import { renderToStaticMarkup } from "react-dom/server";

import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useAccountProfile } from "@/features/account/hooks/use-account";
import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import { useTeam } from "../hooks/use-team";
import { type TeamMember, type TeamOverview } from "../types/team.types";
import { TeamPage } from "./TeamPage";

// The page renders here without a session, a router or the API: the data
// hooks answer what each test says, the shell is reached through the same
// stand-ins as in AccountSettingsPage.test.tsx.
jest.mock("@/features/auth/hooks/use-logout", () => ({
  useLogout: () => ({ isLoading: false, logout: jest.fn() }),
}));
jest.mock("@/features/auth/hooks/use-current-user", () => ({
  useCurrentUser: jest.fn(),
}));
// The account profile names the workspace (heading and shell subtitle); the
// shell reads the workspace access to gate the owner-only menu entries.
jest.mock("@/features/account/hooks/use-account", () => ({
  useAccountProfile: jest.fn(() => ({ data: undefined })),
}));
jest.mock("@/features/messaging/messaging.queries", () => ({
  useMessagingSettings: jest.fn(),
  useUnreadCount: () => ({ data: undefined }),
}));
jest.mock("@/features/messaging/messaging.mutations", () => ({
  useUpdateMessagingSettings: () => ({ isPending: false, mutate: jest.fn() }),
}));
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
  useUpdateNotificationPreferences: () => ({
    isError: false,
    isPending: false,
    mutate: jest.fn(),
  }),
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

let searchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));

let mockLocale = "fr";
jest.mock("@/lib/i18n", () => ({
  ...jest.requireActual("@/lib/i18n"),
  useStoredLocale: () => ({ locale: mockLocale, setLocale: jest.fn() }),
}));

jest.mock("../hooks/use-team", () => {
  const mutation = () => ({
    isPending: false,
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    variables: undefined,
  });
  return {
    useTeam: jest.fn(),
    useTeamMutations: () => ({
      createInvitation: mutation(),
      reactivateMember: mutation(),
      resendInvitation: mutation(),
      revokeInvitation: mutation(),
      sendPasswordReset: mutation(),
      suspendMember: mutation(),
    }),
  };
});

const mockedTeam = useTeam as jest.Mock;
const mockedCurrentUser = useCurrentUser as jest.Mock;
const mockedAccount = useAccountProfile as jest.Mock;
const fr = (key: string, params?: Record<string, string | number>) =>
  translate(dictionaries.fr, key, params);

const fullCapabilities = [
  "organization.read",
  "team.read",
  "team.inviteDoctor",
  "team.inviteAdmin",
  "team.revokeInvitation",
  "team.suspendMember",
  "team.reactivateMember",
  "team.sendPasswordReset",
  "subscription.manage",
  "verification.manage",
];

const member = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  accountStatus: "ACTIVE",
  doctor: null,
  email: "yacine@example.dz",
  fullName: "Yacine Mezoued",
  isEmailVerified: true,
  joinedAt: "2026-10-01T09:00:00.000Z",
  membershipId: "m2",
  role: "ADMIN",
  userId: "u2",
  ...overrides,
});

const overview = (
  overrides: Partial<TeamOverview> = {},
  members: TeamMember[] = [],
): TeamOverview => ({
  capabilities: fullCapabilities,
  invitations: null,
  members,
  scope: "FULL",
  usage: { activeDoctors: 1, maxDoctors: 5 },
  ...overrides,
});

const answer = (hook: jest.Mock, query: object) =>
  hook.mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    isLoading: false,
    ...query,
  });
const render = () => renderToStaticMarkup(<TeamPage />);

const countOf = (needle: string, html: string) => html.split(needle).length - 1;

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = new URLSearchParams();
  mockLocale = "fr";
  answer(mockedCurrentUser, {
    data: { id: "u-owner", fullName: "Nadia Hamidi" },
  });
  answer(mockedAccount, {
    data: { establishment: { name: "Clinique El Amel" } },
  });
});

describe("TeamPage — members tab", () => {
  it("gives the owner their tools on the admins and doctors of the workspace, and counts what the plan still allows", () => {
    answer(mockedTeam, {
      data: overview({
        members: [
          member({
            email: "nadia@example.dz",
            fullName: "Nadia Hamidi",
            membershipId: "m1",
            role: "OWNER",
            userId: "u-owner",
          }),
          member({
            email: "yacine@example.dz",
            fullName: "Yacine Mezoued",
            membershipId: "m2",
            role: "ADMIN",
            userId: "u2",
          }),
          member({
            email: "karim@example.dz",
            fullName: "Karim Belhadj",
            isEmailVerified: true,
            membershipId: "m3",
            role: "DOCTOR",
            userId: "u3",
            accountStatus: "SUSPENDED",
            doctor: {
              id: "d1",
              speciality: "Cardiologie",
              verificationStatus: "VERIFIED",
              wilaya: "Alger",
            },
          }),
          member({
            email: "leila@example.dz",
            fullName: "Leila Ait Said",
            isEmailVerified: false,
            membershipId: "m4",
            role: "DOCTOR",
            userId: "u4",
          }),
        ],
      }),
    });

    const html = render();

    // The suspended doctor only asks to come back, the active admins and the
    // unverified doctor carry a suspension, the verified admin the reset.
    expect(countOf(fr("team.members.actions.suspendNote"), html)).toBe(2);
    expect(countOf(fr("team.members.actions.reactivate"), html)).toBe(1);
    expect(countOf(fr("team.members.actions.resetLinkNote"), html)).toBe(1);
    expect(html).toContain(fr("team.members.roles.OWNER"));
    expect(html).toContain(fr("team.members.roles.DOCTOR"));
    expect(html).toContain("1 actif(s) sur 5 autorisé(s) par votre abonnement");
    expect(html).toContain(fr("account.profile.verificationStatuses.VERIFIED"));
  });

  it("hides from an administrator their own row, the owner and another administrator: only the doctors are theirs", () => {
    answer(mockedCurrentUser, {
      data: { id: "u-admin", fullName: "Yacine Mezoued" },
    });
    answer(mockedTeam, {
      data: overview({}, [
        member({
          email: "nadia@example.dz",
          fullName: "Nadia Hamidi",
          membershipId: "m1",
          role: "OWNER",
          userId: "u-owner",
        }),
        member({
          email: "yacine@example.dz",
          fullName: "Yacine Mezoued",
          membershipId: "m2",
          role: "ADMIN",
          userId: "u-admin",
        }),
        member({
          email: "karim@example.dz",
          fullName: "Karim Belhadj",
          membershipId: "m3",
          role: "DOCTOR",
          userId: "u3",
          accountStatus: "SUSPENDED",
        }),
        member({
          email: "amir@example.dz",
          fullName: "Amir Zitouni",
          membershipId: "m4",
          role: "DOCTOR",
          userId: "u4",
        }),
      ]),
    });

    const html = render();

    // One suspension (the active doctor), one reset, one reactivation: the
    // owner row and the own row show nothing.
    expect(countOf(fr("team.members.actions.suspendNote"), html)).toBe(1);
    expect(countOf(fr("team.members.actions.reactivate"), html)).toBe(1);
    expect(countOf(fr("team.members.actions.resetLinkNote"), html)).toBe(1);
  });

  it("leaves the directory of a doctor untouched: no management tools and no contact details in a BASIC scope", () => {
    answer(mockedCurrentUser, {
      data: { id: "u-doc", fullName: "Karim Belhadj" },
    });
    answer(mockedTeam, {
      data: overview(
        { capabilities: ["team.readBasic"], scope: "BASIC", usage: null },
        [
          member({
            email: "karim@example.dz",
            fullName: "Karim Belhadj",
            membershipId: "m3",
            role: "DOCTOR",
            userId: "u-doc",
          }),
        ],
      ),
    });

    const html = render();

    expect(countOf(fr("team.members.actions.suspendNote"), html)).toBe(0);
    expect(countOf(fr("team.members.actions.resetLinkNote"), html)).toBe(0);
    expect(html).not.toContain("karim@example.dz");
    expect(html).toContain(fr("team.members.emailHidden"));
  });

  it("answers a failed read with the reason and a retry", () => {
    answer(mockedTeam, { error: new Error("boom"), isError: true });

    expect(render()).toContain(fr("team.errors.unknown"));
    expect(render()).toContain(fr("team.states.retry"));
  });

  it("announces the loading of the team", () => {
    answer(mockedTeam, { isLoading: true });

    expect(render()).toContain(fr("team.states.loading"));
  });
});

describe("TeamPage — invitations tab", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams("?tab=invitations");
  });

  it("resends every invitation still alive and revokes only the pending ones", () => {
    answer(mockedTeam, {
      data: overview({
        invitations: [
          {
            createdAt: "2026-10-20T09:00:00.000Z",
            email: "souhb@example.dz",
            expiresAt: "2026-10-27T09:00:00.000Z",
            id: "i1",
            invitedByFullName: "Nadia Hamidi",
            role: "DOCTOR",
            status: "PENDING",
          },
          {
            createdAt: "2026-09-20T09:00:00.000Z",
            email: "amir@example.dz",
            expiresAt: "2026-09-27T09:00:00.000Z",
            id: "i2",
            invitedByFullName: "Nadia Hamidi",
            role: "DOCTOR",
            status: "EXPIRED",
          },
          {
            createdAt: "2026-08-20T09:00:00.000Z",
            email: "redoine@example.dz",
            expiresAt: "2026-08-27T09:00:00.000Z",
            id: "i3",
            invitedByFullName: "Nadia Hamidi",
            role: "RECEPTIONIST",
            status: "USED",
          },
        ],
      }),
    });

    const html = render();

    expect(countOf(fr("team.invitations.actions.resendNote"), html)).toBe(2);
    expect(countOf(fr("team.invitations.actions.revokeNote"), html)).toBe(1);
    expect(html).toContain("souhb@example.dz");
    expect(html).toContain(fr("team.members.invite"));
  });

  it("opens the inviter to an administrator, never to a doctor", () => {
    answer(mockedTeam, {
      data: overview({ capabilities: ["team.read", "team.readBasic"] }, []),
    });

    expect(render()).not.toContain(fr("team.members.invite"));
  });
});

describe("TeamPage — roles tab", () => {
  it("explains the three roles from the dictionary, with the owner rule", () => {
    answer(mockedTeam, { data: overview({}, []) });
    searchParams = new URLSearchParams("?tab=roles");

    const html = render();

    expect(html).toContain(fr("team.roles.card.OWNER.title"));
    expect(html).toContain(fr("team.roles.card.ADMIN.title"));
    expect(html).toContain(fr("team.roles.card.DOCTOR.title"));
    expect(html).toContain(fr("team.roles.card.ADMIN.points.1"));
    expect(html).toContain(fr("team.roles.note"));
  });
});
