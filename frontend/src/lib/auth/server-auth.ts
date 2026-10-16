import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { type LoginUser } from "@/features/auth/types/login.types";
import { getServerApiUrl } from "@/lib/api/server-api-url";

import {
  authCookieNames,
  buildLoginPath,
  getDefaultProtectedPathForRole,
  isAllowedRole,
  type AuthenticatedRole,
} from "./auth-routes";
import {
  fetchCurrentUser,
  SESSION_CHECK_HEADER,
  SESSION_CHECK_UNAVAILABLE,
  SessionCheckUnavailableError,
} from "./current-user";

async function getAuthCookieHeader() {
  const cookieStore = await cookies();

  return authCookieNames
    .map((name) => {
      const value = cookieStore.get(name)?.value;
      return value ? `${name}=${value}` : null;
    })
    .filter((value): value is string => Boolean(value))
    .join("; ");
}

// null only when the API says signed out (401, 403). When it cannot say (a
// 429, a 5xx, no answer), SessionCheckUnavailableError: the page shows
// app/error.tsx ("Service momentanément indisponible"), never the login page.
export async function getServerCurrentUser(): Promise<LoginUser | null> {
  const cookieHeader = await getAuthCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  const user = await fetchCurrentUser(
    `${getServerApiUrl()}/auth/me`,
    cookieHeader,
  );
  const proxyCheck = (await headers()).get(SESSION_CHECK_HEADER);

  if (!user && proxyCheck === SESSION_CHECK_UNAVAILABLE) {
    throw new SessionCheckUnavailableError();
  }

  return user;
}

export async function requireAuthenticatedPage(
  allowedRoles: ReadonlyArray<AuthenticatedRole>,
  nextPath: string,
) {
  const user = await getServerCurrentUser();

  if (!user) {
    redirect(buildLoginPath(nextPath));
  }

  if (!isAllowedRole(user.role, allowedRoles)) {
    redirect(getDefaultProtectedPathForRole(user.role));
  }

  return user;
}

// The login and sign-up forms stay usable when the session cannot be checked.
export async function redirectAuthenticatedUserFromAuthPage() {
  let user: LoginUser | null = null;

  try {
    user = await getServerCurrentUser();
  } catch (error) {
    if (!(error instanceof SessionCheckUnavailableError)) {
      throw error;
    }
  }

  if (user) {
    redirect(getDefaultProtectedPathForRole(user.role));
  }
}
