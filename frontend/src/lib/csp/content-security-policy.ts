// Content-Security-Policy of the pages, sent by proxy.ts with a fresh nonce
// on every request. Next.js reads the nonce back from the request header and
// puts it on its own scripts. The other security headers (HSTS, nosniff,
// Referrer-Policy, Permissions-Policy) and the API's policy come from Caddy.

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

// Origin of an absolute URL, or null (relative or invalid).
export function originOf(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

type PolicyOptions = {
  // Where the browser calls the API (NEXT_PUBLIC_API_URL). Same origin behind
  // Caddy; another origin with next dev on :3000 and the API on :3001.
  apiOrigin: string | null;
  // next dev: React needs eval for its debugging aids, and the hot reload
  // talks over a WebSocket.
  development: boolean;
  nonce: string;
  // Served over HTTPS (X-Forwarded-Proto from Caddy).
  secure: boolean;
};

export function buildContentSecurityPolicy({
  apiOrigin,
  development,
  nonce,
  secure,
}: PolicyOptions): string {
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    // Scripts loaded by an allowed script (Next.js chunks) are allowed too.
    "'strict-dynamic'",
    ...(development ? ["'unsafe-eval'"] : []),
  ];
  const connectSources = [
    "'self'",
    ...(apiOrigin ? [apiOrigin] : []),
    ...(development ? ["ws:", "wss:"] : []),
  ];

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    // style="…" attributes rendered by React on the server cannot carry a
    // nonce: inline styles stay allowed (scripts do not).
    "style-src 'self' 'unsafe-inline'",
    // Image viewer and documents: blob: URLs built from authenticated
    // downloads; data: for small inline images.
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    // PDF documents shown in an iframe from a blob: URL (back office); the
    // blob document inherits this policy, and Chrome's PDF viewer counts as
    // a plugin, hence object-src blob:.
    "frame-src 'self' blob:",
    "object-src blob:",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(secure ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join("; ");
}
