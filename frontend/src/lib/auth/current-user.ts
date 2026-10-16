import { type LoginUser } from "@/features/auth/types/login.types";

// What the API says about a session: only 401 and 403 mean signed out. A 429
// (rate limit), a 5xx or no answer at all says nothing about the session, and
// must never send the user back to the login page.

type CurrentUserResponse = {
  user: LoginUser;
};

// Set by proxy.ts on the request when its own session check (GET /auth/me,
// then POST /auth/refresh) could not conclude: a 401 the page gets afterwards
// may only mean the refresh did not happen.
export const SESSION_CHECK_HEADER = "x-healix-session-check";
export const SESSION_CHECK_UNAVAILABLE = "unavailable";

export class SessionCheckUnavailableError extends Error {
  constructor(readonly status?: number) {
    super("Session check unavailable");
    this.name = "SessionCheckUnavailableError";
  }
}

export const MAX_RETRY_DELAY_MS = 1_000;

export function isSignedOutStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

// Retry-After, in seconds or as an HTTP date; at most 1 s, and 1 s without it.
export function retryDelayMs(retryAfter: string | null, now = Date.now()): number {
  const value = retryAfter?.trim();

  if (!value) {
    return MAX_RETRY_DELAY_MS;
  }

  const delay = /^\d+$/.test(value)
    ? Number(value) * 1_000
    : Date.parse(value) - now;

  return Number.isNaN(delay)
    ? MAX_RETRY_DELAY_MS
    : Math.min(Math.max(delay, 0), MAX_RETRY_DELAY_MS);
}

type FetchCurrentUserOptions = {
  fetch?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// GET /auth/me: the user, null when signed out (401, 403). A 429, a 5xx or a
// network error is tried once more, after Retry-After (at most 1 s); if it
// fails again, as for any other status, SessionCheckUnavailableError.
export async function fetchCurrentUser(
  url: string,
  cookieHeader: string,
  options: FetchCurrentUserOptions = {},
): Promise<LoginUser | null> {
  const request = options.fetch ?? fetch;
  const wait = options.wait ?? sleep;

  const attempt = async (): Promise<Response | null> => {
    try {
      return await request(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          Cookie: cookieHeader,
        },
      });
    } catch {
      return null;
    }
  };

  let response = await attempt();

  if (!response || isTransientStatus(response.status)) {
    await wait(retryDelayMs(response?.headers.get("retry-after") ?? null));
    response = await attempt();
  }

  if (!response) {
    throw new SessionCheckUnavailableError();
  }

  if (response.ok) {
    return ((await response.json()) as CurrentUserResponse).user;
  }

  if (isSignedOutStatus(response.status)) {
    return null;
  }

  throw new SessionCheckUnavailableError(response.status);
}
