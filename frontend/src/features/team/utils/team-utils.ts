import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import {
  normalizeEmail,
  sanitizePhone,
  sanitizeTextInput,
} from "@/lib/security";

import { classifyTeamError } from "./team-errors";
import {
  type AcceptTeamInvitationPayload,
  type InvitationInspection,
  type TeamInvitationStatus,
} from "../types/team.types";

export const TEAM_INVITATION_TTL_HOURS = 72;

// The tabs of the page, in the order they render. `?tab=invitations` opens
// one: the address can be shared.
export const TEAM_TABS = ["members", "invitations", "roles"] as const;
export type TeamTab = (typeof TEAM_TABS)[number];

export function parseTeamTab(value: string | null | undefined): TeamTab {
  return TEAM_TABS.find((tab) => tab === value) ?? "members";
}

// --------------------------------------------------------------- formatting --
export function formatTeamDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-FR", {
    dateStyle: "long",
  }).format(new Date(iso));
}

export type TeamStatusTone = "neutral" | "success" | "warning" | "danger";

// The shared badge coloring of the page: statuses and roles.
export function invitationStatusTone(
  status: TeamInvitationStatus,
): TeamStatusTone {
  if (status === "PENDING") return "warning";
  if (status === "USED") return "success";
  if (status === "REVOKED" || status === "EXPIRED") return "danger";
  return "neutral";
}

export function memberStatusTone(status: string): TeamStatusTone {
  if (status === "ACTIVE") return "success";
  if (status === "SUSPENDED") return "danger";
  return "neutral";
}

export function verificationStatusTone(status: string): TeamStatusTone {
  if (status === "VERIFIED") return "success";
  if (status === "PENDING_VERIFICATION") return "warning";
  if (status === "REJECTED" || status === "SUSPENDED") return "danger";
  return "neutral";
}

export function memberRoleTone(role: string): TeamStatusTone {
  if (role === "OWNER") return "success";
  if (role === "ADMIN") return "warning";
  return "neutral";
}

// ------------------------------------------------------------ invite drawer --
export type InviteFormValues = { email: string; role: "ADMIN" | "DOCTOR" };

export type InviteFormErrors = Partial<Record<keyof InviteFormValues, string>>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateInvite(
  values: InviteFormValues,
  t: TranslationFunction,
): InviteFormErrors {
  const errors: InviteFormErrors = {};
  const email = normalizeEmail(values.email);

  if (!email) errors.email = t("team.errors.emailInvalid");
  else if (!EMAIL_REGEX.test(email))
    errors.email = t("team.errors.emailInvalid");

  return errors;
}

// What the backend accepts on its own. The role the actor cannot grant is
// never offered by the interface; the server would refuse it anyway.
export async function submitInvite(
  values: InviteFormValues,
  deps: {
    send: (payload: InviteFormValues) => Promise<unknown>;
    t: TranslationFunction;
  },
): Promise<
  | { status: "invalid"; errors: InviteFormErrors }
  | { status: "failed"; message: string | null }
  | { status: "success" }
> {
  const errors = validateInvite(values, deps.t);
  if (Object.keys(errors).length > 0) return { errors, status: "invalid" };

  try {
    await deps.send({ email: normalizeEmail(values.email), role: values.role });
    return { status: "success" };
  } catch (error) {
    const { key } = classifyTeamError(error);
    return { message: deps.t(`team.errors.${key}`), status: "failed" };
  }
}

// ---------------------------------------------------------- accept an invite --
export type AcceptFormValues = {
  confirmPassword: string;
  fullName: string;
  password: string;
  phone: string;
  professionalAddress: string;
  speciality: string;
  wilaya: string;
};

export type AcceptFormErrors = Partial<Record<keyof AcceptFormValues, string>>;

const PHONE_REGEX = /^\+?[0-9\s().-]{7,20}$/;

// The professional fields of a doctor are optional: an incomplete profile
// stays DRAFT and is completed through the professional verification.
export function validateAcceptForm(
  values: AcceptFormValues,
  role: InvitationInspection["role"],
  t: TranslationFunction,
): AcceptFormErrors {
  const errors: AcceptFormErrors = {};
  const fullName = sanitizeTextInput(values.fullName);
  const phone = sanitizePhone(values.phone);

  if (fullName.length < 2) errors.fullName = t("team.invite.errors.required");
  if (!phone) errors.phone = t("team.invite.errors.required");
  else if (!PHONE_REGEX.test(phone))
    errors.phone = t("team.invite.errors.phoneInvalid");

  if (values.password.length < 8)
    errors.password = t("team.invite.errors.passwordTooShort");
  if (values.confirmPassword !== values.password)
    errors.confirmPassword = t("team.invite.errors.passwordMismatch");
  void role;

  return errors;
}

// The payload exactly as the backend wants it: what a doctor leaves empty
// stays absent, and the token is never rebuilt client-side.
export function buildAcceptPayload(
  values: AcceptFormValues,
  token: string,
): AcceptTeamInvitationPayload {
  const payload: AcceptTeamInvitationPayload = {
    confirmPassword: values.confirmPassword.trim(),
    fullName: sanitizeTextInput(values.fullName),
    password: values.password.trim(),
    phone: sanitizePhone(values.phone),
    token,
  };

  if (values.speciality.trim() !== "")
    payload.speciality = sanitizeTextInput(values.speciality);
  if (values.wilaya.trim() !== "")
    payload.wilaya = sanitizeTextInput(values.wilaya);
  if (values.professionalAddress.trim() !== "")
    payload.professionalAddress = sanitizeTextInput(values.professionalAddress);

  return payload;
}
