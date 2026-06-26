import { NextResponse, type NextRequest } from "next/server";

import {
  authCookieNames,
  getDefaultProtectedPathForRole,
  getRequiredRolesForPath,
  isAllowedRole,
  isAuthPagePath,
} from "@/lib/auth/auth-routes";

type ProxyUser = {
  role: string;
};

type SessionCheck = {
  shouldClearCookies: boolean;
  user: ProxyUser | null;
};

const defaultApiUrl = "http://localhost:3001/api";

function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? defaultApiUrl;
}

function hasAuthCookie(request: NextRequest) {
  return authCookieNames.some((name) => request.cookies.has(name));
}

function extractProxyUser(data: unknown): ProxyUser | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const user = (data as { user?: unknown }).user;

  if (!user || typeof user !== "object") {
    return null;
  }

  const role = (user as { role?: unknown }).role;

  return typeof role === "string" ? { role } : null;
}

function clearAuthCookies(response: NextResponse) {
  authCookieNames.forEach((name) => {
    response.cookies.set(name, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  });
}

async function checkSession(request: NextRequest): Promise<SessionCheck> {
  if (!hasAuthCookie(request)) {
    return { shouldClearCookies: false, user: null };
  }

  try {
    const response = await fetch(`${getApiUrl()}/auth/me`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Cookie: request.headers.get("cookie") ?? "",
      },
    });

    if (!response.ok) {
      return {
        shouldClearCookies: response.status === 401 || response.status === 403,
        user: null,
      };
    }

    return {
      shouldClearCookies: false,
      user: extractProxyUser(await response.json()),
    };
  } catch {
    return { shouldClearCookies: false, user: null };
  }
}

function redirectToLogin(request: NextRequest, shouldClearCookies: boolean) {
  const loginUrl = request.nextUrl.clone();
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", nextPath);

  const response = NextResponse.redirect(loginUrl);

  if (shouldClearCookies) {
    clearAuthCookies(response);
  }

  return response;
}

function redirectToRoleHome(request: NextRequest, role: string) {
  return NextResponse.redirect(
    new URL(getDefaultProtectedPathForRole(role), request.url),
  );
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requiredRoles = getRequiredRolesForPath(pathname);
  const isAuthPage = isAuthPagePath(pathname);

  if (!requiredRoles && !isAuthPage) {
    return NextResponse.next();
  }

  const session = await checkSession(request);

  if (requiredRoles) {
    if (!session.user) {
      return redirectToLogin(request, session.shouldClearCookies);
    }

    if (!isAllowedRole(session.user.role, requiredRoles)) {
      return redirectToRoleHome(request, session.user.role);
    }

    return NextResponse.next();
  }

  if (isAuthPage && session.user) {
    return redirectToRoleHome(request, session.user.role);
  }

  const response = NextResponse.next();

  if (session.shouldClearCookies) {
    clearAuthCookies(response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
