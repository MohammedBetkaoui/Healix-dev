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
  setCookieHeaders: string[];
  user: ProxyUser | null;
};

const defaultApiUrl = "http://localhost:3001/api";

function getApiUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? defaultApiUrl;
}

function hasAuthCookie(request: NextRequest) {
  return authCookieNames.some((name) => request.cookies.has(name));
}

function hasRefreshCookie(request: NextRequest) {
  return request.cookies.has("refresh_token");
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

function splitSetCookieHeader(header: string) {
  return header
    .split(/,\s(?=[A-Za-z0-9_]+=)/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getSetCookieHeaders(response: Response) {
  const headersWithSetCookie = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookieHeaders = headersWithSetCookie.getSetCookie?.();

  if (setCookieHeaders?.length) {
    return setCookieHeaders;
  }

  const header = response.headers.get("set-cookie");
  return header ? splitSetCookieHeader(header) : [];
}

function appendSetCookieHeaders(
  response: NextResponse,
  setCookieHeaders: string[],
) {
  setCookieHeaders.forEach((cookieHeader) => {
    response.headers.append("set-cookie", cookieHeader);
  });
}

function mergeCookieHeader(
  currentCookieHeader: string,
  setCookieHeaders: string[],
) {
  const cookieMap = new Map<string, string>();

  currentCookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .forEach((cookie) => {
      const separatorIndex = cookie.indexOf("=");

      if (separatorIndex > 0) {
        cookieMap.set(cookie.slice(0, separatorIndex), cookie.slice(separatorIndex + 1));
      }
    });

  setCookieHeaders.forEach((cookieHeader) => {
    const firstSegment = cookieHeader.split(";")[0] ?? "";
    const separatorIndex = firstSegment.indexOf("=");

    if (separatorIndex > 0) {
      cookieMap.set(
        firstSegment.slice(0, separatorIndex),
        firstSegment.slice(separatorIndex + 1),
      );
    }
  });

  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function createNextResponse(request: NextRequest, session: SessionCheck) {
  const requestHeaders = new Headers(request.headers);

  if (session.setCookieHeaders.length > 0) {
    requestHeaders.set(
      "cookie",
      mergeCookieHeader(
        request.headers.get("cookie") ?? "",
        session.setCookieHeaders,
      ),
    );
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  appendSetCookieHeaders(response, session.setCookieHeaders);
  return response;
}

async function refreshSession(request: NextRequest): Promise<SessionCheck> {
  try {
    const response = await fetch(`${getApiUrl()}/auth/refresh`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Cookie: request.headers.get("cookie") ?? "",
      },
      method: "POST",
    });

    if (!response.ok) {
      return {
        shouldClearCookies: response.status === 401 || response.status === 403,
        setCookieHeaders: [],
        user: null,
      };
    }

    return {
      shouldClearCookies: false,
      setCookieHeaders: getSetCookieHeaders(response),
      user: extractProxyUser(await response.json()),
    };
  } catch {
    return { shouldClearCookies: false, setCookieHeaders: [], user: null };
  }
}

async function checkSession(request: NextRequest): Promise<SessionCheck> {
  if (!hasAuthCookie(request)) {
    return { shouldClearCookies: false, setCookieHeaders: [], user: null };
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
      if (response.status === 401 && hasRefreshCookie(request)) {
        return refreshSession(request);
      }

      return {
        shouldClearCookies: response.status === 401 || response.status === 403,
        setCookieHeaders: [],
        user: null,
      };
    }

    return {
      shouldClearCookies: false,
      setCookieHeaders: [],
      user: extractProxyUser(await response.json()),
    };
  } catch {
    return { shouldClearCookies: false, setCookieHeaders: [], user: null };
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
      const response = redirectToRoleHome(request, session.user.role);
      appendSetCookieHeaders(response, session.setCookieHeaders);
      return response;
    }

    return createNextResponse(request, session);
  }

  if (isAuthPage && session.user) {
    const response = redirectToRoleHome(request, session.user.role);
    appendSetCookieHeaders(response, session.setCookieHeaders);
    return response;
  }

  const response = createNextResponse(request, session);

  if (session.shouldClearCookies) {
    clearAuthCookies(response);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
