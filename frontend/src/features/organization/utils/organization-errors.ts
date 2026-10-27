import { isAxiosError } from "axios";

// What to say about a failed organization call, and next to which field. The
// keys are those of `organization.errors.*`.
export type OrganizationErrorKey =
  | "unknown"
  | "network"
  | "tooManyRequests"
  | "forbidden"
  | "invalid"
  | "invalidOpeningHours";

export type OrganizationError = {
  key: OrganizationErrorKey;
  /** The form field the message belongs to. */
  field?: string;
};

// The backend answers the DTO validation with sentences, not codes: the words
// that name the field decide. The "du délégué" variants come first so they do
// not match their professional twins.
const SENTENCES: readonly {
  field?: string;
  match: string[];
  key: OrganizationErrorKey;
}[] = [
  {
    field: "dataProtectionOfficerPhone",
    key: "invalid",
    match: ["téléphone du délégué"],
  },
  {
    field: "dataProtectionOfficerEmail",
    key: "invalid",
    match: ["e-mail du délégué"],
  },
  {
    field: "dataProtectionOfficerName",
    key: "invalid",
    match: ["nom du délégué"],
  },
  { field: "phone", key: "invalid", match: ["téléphone professionnel"] },
  {
    field: "professionalEmail",
    key: "invalid",
    match: ["e-mail professionnel"],
  },
  { field: "website", key: "invalid", match: ["site web"] },
  { field: "defaultAppointmentDuration", key: "invalid", match: ["durée"] },
  { key: "invalidOpeningHours", match: ["horaires", "périodes"] },
];

function backendMessages(data: unknown): string[] {
  const message = (data as { message?: unknown } | undefined)?.message;
  if (Array.isArray(message))
    return message.filter((item): item is string => typeof item === "string");
  return typeof message === "string" ? [message] : [];
}

export function classifyOrganizationError(error: unknown): OrganizationError {
  if (!isAxiosError(error)) return { key: "unknown" };
  if (!error.response) return { key: "network" };

  const { data, status } = error.response as { data: unknown; status: number };
  if (status === 429) return { key: "tooManyRequests" };
  if (status === 403) return { key: "forbidden" };

  if (status === 400) {
    const messages = backendMessages(data).join(" ").toLowerCase();
    const named = SENTENCES.find((entry) =>
      entry.match.some((word) => messages.includes(word)),
    );
    return named ? { key: named.key, field: named.field } : { key: "invalid" };
  }

  return { key: "unknown" };
}
