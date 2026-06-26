import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { type LoginUser } from "@/features/auth/types/login.types";

import {
  authCookieNames,
  buildLoginPath,
  getDefaultProtectedPathForRole,
  isAllowedRole,
  type AuthenticatedRole,
} from "./auth-routes";

type CurrentUserResponse = {
  user: LoginUser;
};

const defaultApiUrl = "http://localhost:3001/api";

function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? defaultApiUrl;
}

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

export async function getServerCurrentUser(): Promise<LoginUser | null> {
  const cookieHeader = await getAuthCookieHeader();

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(`${getApiUrl()}/auth/me`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as CurrentUserResponse;
    return data.user;
  } catch {
    return null;
  }
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

export async function redirectAuthenticatedUserFromAuthPage() {
  const user = await getServerCurrentUser();

  if (user) {
    redirect(getDefaultProtectedPathForRole(user.role));
  }
}
