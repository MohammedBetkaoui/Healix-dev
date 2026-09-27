import { isAxiosError } from "axios";

// Surfaces the backend's own message verbatim (e.g. a 409 conflict) instead
// of always showing a generic fallback string. Deliberately does not reuse
// normalizeApiError (api-error.ts): that helper's fallback strings are
// French-only, which would leak into bilingual FR/AR components.
export function getServerErrorMessage(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  const message = (error.response?.data as { message?: unknown } | undefined)?.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) {
    return message.find((entry): entry is string => typeof entry === "string");
  }
  return undefined;
}
