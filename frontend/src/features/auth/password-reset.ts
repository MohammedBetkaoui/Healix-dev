import { isAxiosError } from "axios";

// 32 random bytes in base64url, without padding: the only shape the backend
// issues. Anything else is not worth a request.
const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// The reset token of a URL query (`?token=...`), or null when it is missing,
// repeated or malformed.
export function readResetToken(search: string): string | null {
  const tokens = new URLSearchParams(search).getAll("token");

  if (tokens.length !== 1) {
    return null;
  }

  return RESET_TOKEN_PATTERN.test(tokens[0]) ? tokens[0] : null;
}

// The same address without the token, to replace the current history entry
// once the token is read: it then stays neither in the address bar, nor in
// the history, nor in a Referer.
export function urlWithoutToken(pathname: string, search: string, hash = ""): string {
  const params = new URLSearchParams(search);
  params.delete("token");
  const query = params.toString();

  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

export type PasswordResetErrorKind =
  | "generic"
  | "invalidToken"
  | "network"
  | "passwordMismatch"
  | "passwordTooShort"
  | "tooManyRequests";

function backendMessages(data: unknown): string[] {
  const message = (data as { message?: unknown } | undefined)?.message;

  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === "string");
  }

  return typeof message === "string" ? [message] : [];
}

// Which message to show for a failed forgot-password or reset-password call.
export function classifyPasswordResetError(error: unknown): PasswordResetErrorKind {
  if (!isAxiosError(error)) {
    return "generic";
  }

  if (!error.response) {
    return "network";
  }

  const { data, status } = error.response;

  if (status === 429) {
    return "tooManyRequests";
  }

  if (status !== 400) {
    return "generic";
  }

  if ((data as { code?: unknown } | undefined)?.code === "RESET_TOKEN_INVALID") {
    return "invalidToken";
  }

  const messages = backendMessages(data).join(" ").toLowerCase();

  if (messages.includes("correspondent pas")) {
    return "passwordMismatch";
  }

  if (messages.includes("8 caract")) {
    return "passwordTooShort";
  }

  return "generic";
}
