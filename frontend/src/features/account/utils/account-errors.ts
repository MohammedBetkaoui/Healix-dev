import { isAxiosError } from "axios";

// What to say about a failed account call, and next to which field. The keys
// are those of `account.errors.*`.
export type AccountErrorKey =
  | "unknown"
  | "network"
  | "tooManyRequests"
  | "forbidden"
  | "invalid"
  | "currentPasswordInvalid"
  | "newPasswordSame"
  | "passwordTooShort"
  | "phoneInvalid"
  | "phoneAlreadyUsed"
  | "fieldLocked"
  | "sessionNotFound"
  | "currentSession"
  | "currentSessionUnknown"
  | "verificationRequired";

export type AccountError = {
  key: AccountErrorKey;
  /** The form field the message belongs to. */
  field?: string;
  /** For a refusal that names several (locked fields). */
  fields?: string[];
};

// The `code` the backend gives to its own refusals (backend/src/account).
const CODES: Record<string, AccountError> = {
  CURRENT_PASSWORD_INVALID: { field: "currentPassword", key: "currentPasswordInvalid" },
  CURRENT_SESSION: { key: "currentSession" },
  CURRENT_SESSION_UNKNOWN: { key: "currentSessionUnknown" },
  NEW_PASSWORD_SAME_AS_CURRENT: { field: "newPassword", key: "newPasswordSame" },
  PHONE_ALREADY_USED: { field: "phone", key: "phoneAlreadyUsed" },
  PROFILE_FIELD_LOCKED: { key: "fieldLocked" },
  SESSION_NOT_FOUND: { key: "sessionNotFound" },
  VERIFICATION_REQUIRED: { key: "verificationRequired" },
};

function backendMessages(data: unknown): string[] {
  const message = (data as { message?: unknown } | undefined)?.message;
  if (Array.isArray(message)) return message.filter((item): item is string => typeof item === "string");
  return typeof message === "string" ? [message] : [];
}

export function classifyAccountError(error: unknown): AccountError {
  if (!isAxiosError(error)) return { key: "unknown" };
  if (!error.response) return { key: "network" };

  const { data, status } = error.response as { data: unknown; status: number };
  if (status === 429) return { key: "tooManyRequests" };

  const body = data as { code?: unknown; fields?: unknown } | undefined;
  const known = typeof body?.code === "string" ? CODES[body.code] : undefined;
  if (known) {
    const fields = Array.isArray(body?.fields) ? body.fields.filter((field): field is string => typeof field === "string") : undefined;
    return fields ? { ...known, fields } : known;
  }

  if (status === 400) {
    // The validation of the DTOs answers with sentences, not codes.
    const messages = backendMessages(data).join(" ").toLowerCase();
    if (messages.includes("8 caract")) return { field: "newPassword", key: "passwordTooShort" };
    if (messages.includes("téléphone")) return { field: "phone", key: "phoneInvalid" };
    return { key: "invalid" };
  }

  return { key: status === 403 ? "forbidden" : "unknown" };
}
