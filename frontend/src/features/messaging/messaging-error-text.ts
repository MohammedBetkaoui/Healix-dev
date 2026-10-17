import { isAxiosError } from "axios";

import { type MessagingCopy } from "./messaging.copy";

// The message of an API error, in the user's language: the backend's stable
// codes (those of the case discussions and attachments too), the network,
// else a generic one.
export function messagingErrorText(
  error: unknown,
  copy: MessagingCopy,
  caseCodes: Record<string, string> = {},
): string {
  if (!isAxiosError(error)) return copy.errors.generic;
  if (!error.response) return copy.errors.network;
  const code = (error.response.data as { code?: unknown } | undefined)?.code;
  if (typeof code === "string" && copy.errors.codes[code]) return copy.errors.codes[code];
  if (typeof code === "string" && caseCodes[code]) return caseCodes[code];
  if (error.response.status === 404) return copy.thread.notFound;
  return copy.errors.generic;
}
