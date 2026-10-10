// Base URL of the API for the calls made by the Next.js server itself
// (proxy.ts, server-auth.ts), never by the browser.
//
// Behind the reverse proxy the browser calls https://<domain>/api, an address
// the frontend container may not reach; API_INTERNAL_URL (e.g.
// http://backend:3001/api) is then the direct route. Without it, the server
// uses the browser's address, as before.

export const DEFAULT_API_URL = "http://localhost:3001/api";

export function selectServerApiUrl(
  internalUrl: string | undefined,
  publicUrl: string | undefined,
): string {
  const internal = internalUrl?.trim();

  if (internal) {
    return internal.replace(/\/+$/, "");
  }

  return publicUrl?.trim() || DEFAULT_API_URL;
}

// API_INTERNAL_URL is read when the server runs (it is not NEXT_PUBLIC_);
// NEXT_PUBLIC_API_URL is written into the build, so it must stay spelled out
// as process.env.NEXT_PUBLIC_API_URL here.
export function getServerApiUrl(): string {
  return selectServerApiUrl(
    process.env.API_INTERNAL_URL,
    process.env.NEXT_PUBLIC_API_URL,
  );
}
