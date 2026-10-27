import { renderToStaticMarkup } from "react-dom/server";

import { dictionaries } from "@/i18n";
import { translate } from "@/lib/i18n";

import {
  useAcceptTeamInvitation,
  useInvitationInspection,
} from "../hooks/use-team";
import { type InvitationInspection } from "../types/team.types";
import { InviteAcceptPage } from "./InviteAcceptPage";

// The page renders here without a router or the API: the inspection hook
// answers what each test says, and the auth shell is reached through a
// passthrough so only the panel of the invitation is under test.
jest.mock("../hooks/use-team", () => ({
  useAcceptTeamInvitation: jest.fn(),
  useInvitationInspection: jest.fn(),
}));

let searchParams = new URLSearchParams();
jest.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));

let mockLocale: import("@/i18n").Locale = "fr";
jest.mock("@/lib/i18n", () => ({
  ...jest.requireActual("@/lib/i18n"),
  useStoredLocale: () => ({ locale: mockLocale, setLocale: jest.fn() }),
}));
jest.mock("@/components/auth/login/AuthPageShell", () => ({
  AuthPageShell: ({
    children,
  }: {
    children: (i18n: {
      direction: string;
      locale: string;
      t: (key: string, params?: Record<string, string | number>) => string;
    }) => React.ReactNode;
  }) =>
    children({
      direction: "ltr",
      locale: mockLocale,
      t: (key: string, params?: Record<string, string | number>) =>
        (
          jest.requireActual("@/lib/i18n") as typeof import("@/lib/i18n")
        ).translate(
          (jest.requireActual("@/i18n") as unknown as typeof import("@/i18n"))
            .dictionaries[mockLocale],
          key,
          params,
        ),
    }),
}));

const mockedInspection = useInvitationInspection as jest.Mock;
const mockedAcceptance = useAcceptTeamInvitation as jest.Mock;
const fr = (key: string, params?: Record<string, string | number>) =>
  translate(dictionaries.fr, key, params);

const inspection = (
  overrides: Partial<InvitationInspection> = {},
): InvitationInspection => ({
  email: "souhb.benali@example.dz",
  establishmentName: "Clinique El Amel",
  expiresAt: "2026-11-01T12:00:00.000Z",
  role: "DOCTOR",
  status: "PENDING",
  usable: true,
  workspaceName: "Espace de travail de la Clinique El Amel",
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
const render = () => renderToStaticMarkup(<InviteAcceptPage />);

// The opening tag of the control with this id.
const controlTag = (html: string, id: string) =>
  html.match(new RegExp(`<(?:input|select)[^>]*\\bid="${id}"[^>]*>`))?.[0] ??
  "";

beforeEach(() => {
  jest.clearAllMocks();
  searchParams = new URLSearchParams("?token=abc");
  mockLocale = "fr";
  answer(mockedInspection, { data: inspection() });
  answer(mockedAcceptance, {
    isError: false,
    isPending: false,
    isSuccess: false,
    mutateAsync: jest.fn(async () => ({ email: "", message: "" })),
  });
});

describe("InviteAcceptPage — the link", () => {
  it("asks its token to the shared address, and only there", () => {
    render();

    expect(searchParams.get("token")).toBe("abc");
    expect(mockedInspection.mock.calls[0][0]).toBe("abc");
  });

  it("answers invalid when the address carries no token", () => {
    searchParams = new URLSearchParams();

    const html = render();

    // Reading an empty token is still the input of the inspection: the real
    // hook stays disabled without token.
    expect(mockedInspection.mock.calls[0][0]).toBe("");
    expect(html).toContain(fr("team.invite.states.invalidTitle"));
    expect(html).toContain(fr("team.invite.states.backToLogin"));
  });

  it("announces the inspection while it reads", () => {
    answer(mockedInspection, { isLoading: true });

    expect(render()).toContain(fr("team.invite.checking"));
  });

  it("freezes on the screen the invitation says: expired, revoked, used", () => {
    answer(mockedInspection, {
      data: inspection({ status: "EXPIRED", usable: false }),
    });
    expect(render()).toContain(fr("team.invite.states.expiredTitle"));
    expect(render()).toContain(fr("team.invite.states.expired"));

    answer(mockedInspection, {
      data: inspection({ status: "REVOKED", usable: false }),
    });
    expect(render()).toContain(fr("team.invite.states.revokedTitle"));

    answer(mockedInspection, {
      data: inspection({ status: "USED", usable: false }),
    });
    expect(render()).toContain(fr("team.invite.states.usedTitle"));
  });
});

describe("InviteAcceptPage — the form", () => {
  it("shows what the invitation carries and asks what a password needs, twice", () => {
    const html = render();

    expect(html).toContain("souhb.benali@example.dz");
    expect(html).toContain(fr("team.invite.inspection.card"));
    expect(html).toContain("Clinique El Amel");
    expect(html).toContain(fr("team.invite.inspection.status.PENDING"));
    expect(html).toContain(fr("team.invite.form.fullName"));
    expect(html).toContain(fr("team.invite.form.phone"));
    expect(html).toContain(fr("team.invite.form.password"));
    expect(html).toContain(fr("team.invite.form.confirmPassword"));
    expect(html).toContain(fr("team.invite.form.professionalTitle"));
    expect(controlTag(html, "invite-accept-password")).not.toBe("");
    expect(controlTag(html, "invite-accept-confirmPassword")).not.toBe("");
    expect(controlTag(html, "invite-accept-wilaya")).not.toBe("");
  });

  it("fits an administrator: the same identifiers, no professional part", () => {
    answer(mockedInspection, { data: inspection({ role: "ADMIN" }) });

    const html = render();

    expect(html).toContain(fr("team.invite.form.fullName"));
    expect(html).not.toContain(fr("team.invite.form.speciality"));
    expect(html).not.toContain(fr("team.invite.form.professionalAddress"));
  });

  it("names the expiry in words of the language", () => {
    const html = render();

    expect(html).toContain("novembre 2026");
  });

  it("welcomes the created account, and offers the way in", () => {
    answer(mockedAcceptance, { isSuccess: true });

    const html = render();

    expect(html).toContain(fr("team.invite.states.successTitle"));
    expect(html).toContain(fr("team.invite.states.goLogin"));
    expect(html).not.toContain(fr("team.invite.form.submit"));
  });
});
