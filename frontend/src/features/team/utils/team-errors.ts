import { isAxiosError } from "axios";

// What to say about a failed team/invitation call, and next to which field.
// The keys are those of `team.errors.*` and `team.invite.errors.*`.
export type TeamErrorKey =
  | "unknown"
  | "network"
  | "tooManyRequests"
  | "forbidden"
  | "invalid"
  | "emailInvalid"
  | "emailAlreadyPending"
  | "accountExists"
  | "phoneUsed"
  | "quotaReached"
  | "subscriptionInactive";

export type TeamError = {
  key: TeamErrorKey;
  /** The form field the message belongs to. */
  field?: string;
};

// The `code` the backend gives to its own refusals (backend/src/team and the
// subscription errors): an object body carries the code plus the sentence.
const CODES: Record<string, TeamError> = {
  ACCOUNT_ALREADY_EXISTS: { field: "email", key: "accountExists" },
  PHONE_ALREADY_USED: { field: "phone", key: "phoneUsed" },
  QUOTA_EXCEEDED: { key: "quotaReached" },
  SUBSCRIPTION_INACTIVE: { key: "subscriptionInactive" },
  TEAM_INVITATION_ALREADY_PENDING: {
    field: "email",
    key: "emailAlreadyPending",
  },
  TEAM_INVITATION_ROLE_NOT_ALLOWED: { key: "forbidden" },
};

function backendMessages(data: unknown): string[] {
  const message = (data as { message?: unknown } | undefined)?.message;
  if (Array.isArray(message))
    return message.filter((item): item is string => typeof item === "string");
  return typeof message === "string" ? [message] : [];
}

export function classifyTeamError(error: unknown): TeamError {
  if (!isAxiosError(error)) return { key: "unknown" };
  if (!error.response) return { key: "network" };

  const { data, status } = error.response as { data: unknown; status: number };
  if (status === 429) return { key: "tooManyRequests" };

  const body = data as { code?: unknown } | undefined;
  const known = typeof body?.code === "string" ? CODES[body.code] : undefined;
  if (known) return known;

  if (status === 400) {
    // The validation of the DTOs answers with sentences, not codes.
    const messages = backendMessages(data).join(" ").toLowerCase();
    if (messages.includes("email")) return { key: "emailInvalid" };
    return { key: "invalid" };
  }

  return { key: status === 403 ? "forbidden" : "unknown" };
}

// What the public link tells about itself when the inspect or accept call
// refuses: the service codes name the page state to fall back to, not an
// error message (each state has its own screen). null = not an invitation
// state at all (network, rate limit, unknown).
export type InvitationState = "expired" | "invalid" | "revoked" | "used";

export function invitationStateOf(error: unknown): InvitationState | null {
  if (!isAxiosError(error) || !error.response) return null;

  const code = (error.response.data as { code?: unknown } | undefined)?.code;
  if (typeof code !== "string") return null;

  if (code === "INVITATION_INVALID") return "invalid";
  if (code === "INVITATION_EXPIRED") return "expired";
  if (code === "INVITATION_REVOKED") return "revoked";
  if (code === "INVITATION_ALREADY_USED") return "used";

  return null;
}
