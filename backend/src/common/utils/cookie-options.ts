import { type CookieOptions } from 'express';

type SameSiteMode = 'lax' | 'strict';

type CookieConfig = {
  maxAge: number;
  secure: boolean;
  sameSite: SameSiteMode;
};

function createBaseCookieOptions(config: CookieConfig): CookieOptions {
  return {
    httpOnly: true,
    maxAge: config.maxAge,
    path: '/',
    sameSite: config.sameSite,
    secure: config.secure,
  };
}

export function getAccessCookieOptions(
  secure: boolean,
  maxAge: number,
): CookieOptions {
  return createBaseCookieOptions({
    maxAge,
    sameSite: 'lax',
    secure,
  });
}

export function getRefreshCookieOptions(
  secure: boolean,
  maxAge: number,
): CookieOptions {
  return createBaseCookieOptions({
    maxAge,
    sameSite: 'lax',
    secure,
  });
}

export function getClearCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure,
  };
}

export function getAdminAccessCookieOptions(
  secure: boolean,
  maxAge: number,
): CookieOptions {
  return createBaseCookieOptions({
    maxAge,
    sameSite: secure ? 'strict' : 'lax',
    secure,
  });
}

export function getAdminRefreshCookieOptions(
  secure: boolean,
  maxAge: number,
): CookieOptions {
  return createBaseCookieOptions({
    maxAge,
    sameSite: secure ? 'strict' : 'lax',
    secure,
  });
}

export function getClearAdminCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: secure ? 'strict' : 'lax',
    secure,
  };
}
