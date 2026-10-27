import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_CHECK_HEADER,
  SessionCheckUnavailableError,
} from "./current-user";
import {
  type AuthenticatedRole,
  getDefaultProtectedPathForRole,
} from "./auth-routes";
import {
  getServerCurrentUser,
  redirectAuthenticatedUserFromAuthPage,
  requireAuthenticatedPage,
} from "./server-auth";

jest.mock("next/headers", () => ({ cookies: jest.fn(), headers: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

const user = {
  email: "amel@example.dz",
  fullName: "Amel Benaïssa",
  id: "user-a",
  role: "INDEPENDENT_DOCTOR",
};

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function answer(...statuses: number[]) {
  for (const status of statuses) {
    fetchMock.mockResolvedValueOnce(
      new Response(status === 200 ? JSON.stringify({ user }) : "{}", {
        // No wait before the second attempt.
        headers: status === 429 ? { "Retry-After": "0" } : {},
        status,
      }),
    );
  }
}

function signedIn(requestHeaders: Record<string, string> = {}) {
  jest.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === "access_token" ? { name, value: "token" } : undefined,
  } as unknown as Awaited<ReturnType<typeof cookies>>);
  jest
    .mocked(headers)
    .mockResolvedValue(
      new Headers(requestHeaders) as unknown as Awaited<
        ReturnType<typeof headers>
      >,
    );
}

beforeEach(() => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  signedIn();
});

describe("getServerCurrentUser", () => {
  it("never reads a 429 as signed out", async () => {
    answer(429, 429);

    await expect(getServerCurrentUser()).rejects.toBeInstanceOf(
      SessionCheckUnavailableError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the user when the second attempt gets through", async () => {
    answer(429, 200);

    await expect(getServerCurrentUser()).resolves.toEqual(user);
  });

  it("is null on 401, and without any session cookie", async () => {
    answer(401);
    await expect(getServerCurrentUser()).resolves.toBeNull();

    jest
      .mocked(cookies)
      .mockResolvedValue({ get: () => undefined } as unknown as Awaited<
        ReturnType<typeof cookies>
      >);
    await expect(getServerCurrentUser()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not trust a 401 when the proxy could not refresh the session", async () => {
    signedIn({ [SESSION_CHECK_HEADER]: "unavailable" });
    answer(401);

    await expect(getServerCurrentUser()).rejects.toBeInstanceOf(
      SessionCheckUnavailableError,
    );
  });
});

describe("requireAuthenticatedPage", () => {
  it("shows the error page, not the login page, on a 429 or a 5xx", async () => {
    for (const statuses of [
      [429, 429],
      [503, 502],
    ]) {
      answer(...statuses);

      await expect(
        requireAuthenticatedPage(["INDEPENDENT_DOCTOR"], "/doctor/dashboard"),
      ).rejects.toBeInstanceOf(SessionCheckUnavailableError);
    }
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a signed-out user to the login page", async () => {
    answer(401);

    await expect(
      requireAuthenticatedPage(["INDEPENDENT_DOCTOR"], "/doctor/dashboard"),
    ).rejects.toThrow("NEXT_REDIRECT /login?next=%2Fdoctor%2Fdashboard");
  });
});

describe("redirectAuthenticatedUserFromAuthPage", () => {
  it("leaves the login form usable when the session cannot be checked", async () => {
    answer(503, 503);

    await expect(
      redirectAuthenticatedUserFromAuthPage(),
    ).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a signed-in user to their home page", async () => {
    answer(200);

    await expect(redirectAuthenticatedUserFromAuthPage()).rejects.toThrow(
      "NEXT_REDIRECT /doctor/dashboard",
    );
  });
});

// The verification page is the one door of a doctor's professional
// verification, independent or affiliated (a doctor invited by an
// establishment joins exactly here, their profile still a draft). The
// establishment role never passes: it has verification windows of its own.
describe("requireAuthenticatedPage — /doctor/verification", () => {
  const verificationRoles = [
    "INDEPENDENT_DOCTOR",
    "AFFILIATED_DOCTOR",
  ] as const satisfies AuthenticatedRole[];

  function answerAs(role: AuthenticatedRole) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { ...user, role } }), {
        status: 200,
      }),
    );
  }

  it("opens the workflow to an affiliated doctor, the invitation invites exactly them", async () => {
    answerAs("AFFILIATED_DOCTOR");

    const session = await requireAuthenticatedPage(
      [...verificationRoles],
      "/doctor/verification",
    );

    expect(session.role).toBe("AFFILIATED_DOCTOR");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("keeps the independent doctor of course", async () => {
    answerAs("INDEPENDENT_DOCTOR");

    const session = await requireAuthenticatedPage(
      [...verificationRoles],
      "/doctor/verification",
    );

    expect(session.role).toBe("INDEPENDENT_DOCTOR");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refuses the establishment admin and returns them to their own workspace", async () => {
    answerAs("ESTABLISHMENT_ADMIN");

    await expect(
      requireAuthenticatedPage([...verificationRoles], "/doctor/verification"),
    ).rejects.toThrow("NEXT_REDIRECT /establishment/dashboard");
    expect(redirect).toHaveBeenCalledWith(
      getDefaultProtectedPathForRole("ESTABLISHMENT_ADMIN"),
    );
  });

  it("sends a signed-out visitor to the login page, not the verification", async () => {
    answer(401);

    await expect(
      requireAuthenticatedPage([...verificationRoles], "/doctor/verification"),
    ).rejects.toThrow("NEXT_REDIRECT /login?next=%2Fdoctor%2Fverification");
  });
});
