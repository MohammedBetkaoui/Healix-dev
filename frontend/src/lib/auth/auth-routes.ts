import { type LoginUser } from "@/features/auth/types/login.types";

export type AuthenticatedRole = LoginUser["role"];

export const authCookieNames = ["access_token", "refresh_token"] as const;

export const authPagePaths = ["/login", "/register"] as const;

export const protectedRouteRules = [
  {
    prefix: "/establishment",
    roles: ["ESTABLISHMENT_ADMIN"],
  },
  {
    prefix: "/doctor",
    roles: ["INDEPENDENT_DOCTOR"],
  },
] as const satisfies ReadonlyArray<{
  prefix: string;
  roles: ReadonlyArray<AuthenticatedRole>;
}>;

function normalizePathname(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export function isAuthPagePath(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);
  return authPagePaths.some((path) => normalizedPathname === path);
}

export function getRequiredRolesForPath(
  pathname: string,
): ReadonlyArray<AuthenticatedRole> | null {
  const normalizedPathname = normalizePathname(pathname);
  const matchedRule = protectedRouteRules.find(
    (rule) =>
      normalizedPathname === rule.prefix ||
      normalizedPathname.startsWith(`${rule.prefix}/`),
  );

  return matchedRule?.roles ?? null;
}

export function isAllowedRole(
  role: string | undefined,
  allowedRoles: ReadonlyArray<AuthenticatedRole>,
) {
  return Boolean(role && allowedRoles.includes(role as AuthenticatedRole));
}

export function getDefaultProtectedPathForRole(role: string | undefined) {
  if (role === "ESTABLISHMENT_ADMIN") {
    return "/establishment/dashboard";
  }

  if (role === "INDEPENDENT_DOCTOR") {
    return "/doctor/dashboard";
  }

  return "/login";
}

export function buildLoginPath(nextPath?: string) {
  if (!nextPath) {
    return "/login";
  }

  return `/login?next=${encodeURIComponent(nextPath)}`;
}
