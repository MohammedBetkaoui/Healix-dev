import {
  fetchCurrentUser,
  MAX_RETRY_DELAY_MS,
  retryDelayMs,
  SessionCheckUnavailableError,
} from "./current-user";

const user = { email: "amel@example.dz", fullName: "Amel Benaïssa", id: "user-a", role: "INDEPENDENT_DOCTOR" };

type Reply = Response | Error;

function reply(status: number, headers: Record<string, string> = {}): Response {
  return new Response(status === 200 ? JSON.stringify({ user }) : "{}", { headers, status });
}

function scripted(...replies: Reply[]) {
  const fetch = jest.fn(async () => {
    const next = replies.shift();
    if (!next) throw new Error("no reply scripted");
    if (next instanceof Error) throw next;
    return next;
  });
  const wait = jest.fn(async () => undefined);
  const run = () =>
    fetchCurrentUser("http://backend:3001/api/auth/me", "access_token=a", {
      fetch: fetch as unknown as typeof globalThis.fetch,
      wait,
    });
  return { fetch, run, wait };
}

describe("fetchCurrentUser", () => {
  it("returns the user, and sends the cookies", async () => {
    const { fetch, run, wait } = scripted(reply(200));

    await expect(run()).resolves.toEqual(user);
    expect(fetch).toHaveBeenCalledWith("http://backend:3001/api/auth/me", {
      cache: "no-store",
      headers: { Accept: "application/json", Cookie: "access_token=a" },
    });
    expect(wait).not.toHaveBeenCalled();
  });

  it.each([401, 403])("is null on %i only, without trying again", async (status) => {
    const { fetch, run } = scripted(reply(status));

    await expect(run()).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("tries a 429 again after Retry-After, at most 1 s", async () => {
    const { fetch, run, wait } = scripted(reply(429, { "Retry-After": "42" }), reply(200));

    await expect(run()).resolves.toEqual(user);
    expect(wait).toHaveBeenCalledWith(MAX_RETRY_DELAY_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["a 429", reply(429, { "Retry-After": "0" }), reply(429, { "Retry-After": "0" })],
    ["a 5xx", reply(502), reply(503)],
    ["a network error", new TypeError("fetch failed"), new TypeError("fetch failed")],
  ])("throws, never null, when %s comes twice", async (_case, first, second) => {
    const { fetch, run } = scripted(first, second);

    await expect(run()).rejects.toBeInstanceOf(SessionCheckUnavailableError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reads the answer of the second attempt", async () => {
    await expect(scripted(new TypeError("fetch failed"), reply(401)).run()).resolves.toBeNull();
    await expect(scripted(reply(500), reply(200)).run()).resolves.toEqual(user);
  });

  it("throws at once on any other status", async () => {
    const { fetch, run } = scripted(reply(404));

    await expect(run()).rejects.toEqual(expect.objectContaining({ status: 404 }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("retryDelayMs", () => {
  const now = Date.parse("2026-10-16T08:00:00Z");

  it("reads seconds and HTTP dates, capped at 1 s", () => {
    expect(retryDelayMs("0", now)).toBe(0);
    expect(retryDelayMs("3", now)).toBe(1_000);
    expect(retryDelayMs("Fri, 16 Oct 2026 08:00:00 GMT", now)).toBe(0);
    expect(retryDelayMs("Fri, 16 Oct 2026 08:00:30 GMT", now)).toBe(1_000);
  });

  it("waits 1 s without a usable header", () => {
    expect(retryDelayMs(null, now)).toBe(1_000);
    expect(retryDelayMs("soon", now)).toBe(1_000);
  });
});
