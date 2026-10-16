// A 429 seen by the HTTP client (outside React), shown by RateLimitToast.

type RateLimitListener = (seconds: number) => void;

const listeners = new Set<RateLimitListener>();

// The backend's window is one minute: without Retry-After, a full one.
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

export function onRateLimited(listener: RateLimitListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyRateLimited(seconds: number): void {
  listeners.forEach((listener) => listener(seconds));
}

// Retry-After, in seconds or as an HTTP date, as whole seconds (at least 1).
export function readRetryAfterSeconds(
  value: unknown,
  now = Date.now(),
): number {
  const text = typeof value === "number" ? String(value) : value;

  if (typeof text !== "string" || !text.trim()) {
    return DEFAULT_RETRY_AFTER_SECONDS;
  }

  const seconds = /^\d+$/.test(text.trim())
    ? Number(text.trim())
    : (Date.parse(text) - now) / 1_000;

  return Number.isNaN(seconds)
    ? DEFAULT_RETRY_AFTER_SECONDS
    : Math.max(1, Math.ceil(seconds));
}
