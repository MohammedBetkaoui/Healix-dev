import { type TranslationFunction } from "@/lib/i18n";
import {
  normalizeEmail,
  sanitizePhone,
  sanitizeTextInput,
} from "@/lib/security";

import { classifyOrganizationError } from "./organization-errors";
import {
  OPENING_HOURS_DAYS,
  type OpeningHoursDay,
  type OpeningHoursPeriod,
  type OrganizationResponse,
  type UpdateOpeningHoursPayload,
  type UpdateOrganizationPayload,
} from "../types/organization.types";

// The durations the backend accepts for the default appointment duration.
export const APPOINTMENT_DURATIONS = [10, 15, 20, 30, 45, 60] as const;

const PHONE_REGEX = /^\+?[0-9\s().-]{8,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE_REGEX = /^https?:\/\/\S+$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ---------------------------------------------------------------- contacts --
export type ContactsFormValues = {
  defaultAppointmentDuration: number;
  phone: string;
  professionalEmail: string;
  website: string;
};

export type ContactsFormErrors = Partial<
  Record<keyof ContactsFormValues, string>
>;

export function contactsFormValues(
  organization: OrganizationResponse,
): ContactsFormValues {
  return {
    defaultAppointmentDuration:
      organization.settings.defaultAppointmentDuration,
    phone: organization.contacts.phone,
    professionalEmail: organization.contacts.professionalEmail,
    website: organization.contacts.website ?? "",
  };
}

// What to send: the fields that changed. An emptied clearable field means
// "clear it" (an explicit null): an empty string is refused by the backend so
// the two intent cannot be confused.
export function buildContactsPatch(
  values: ContactsFormValues,
  organization: OrganizationResponse,
): UpdateOrganizationPayload {
  const patch: UpdateOrganizationPayload = {};

  const phone = sanitizePhone(values.phone);
  if (phone !== organization.contacts.phone) patch.phone = phone;

  const professionalEmail = normalizeEmail(values.professionalEmail);
  if (professionalEmail !== organization.contacts.professionalEmail)
    patch.professionalEmail = professionalEmail;

  const website = sanitizeTextInput(values.website);
  if (website === "") {
    if (organization.contacts.website !== null) patch.website = null;
  } else if (website !== organization.contacts.website) {
    patch.website = website;
  }

  if (
    values.defaultAppointmentDuration !==
    organization.settings.defaultAppointmentDuration
  ) {
    patch.defaultAppointmentDuration = values.defaultAppointmentDuration;
  }

  return patch;
}

export function validateContacts(
  values: ContactsFormValues,
  t: TranslationFunction,
): ContactsFormErrors {
  const errors: ContactsFormErrors = {};

  if (!values.phone)
    errors.phone = t("organization.contacts.errors.phoneRequired");
  else if (!PHONE_REGEX.test(values.phone))
    errors.phone = t("organization.contacts.errors.phoneInvalid");

  if (!values.professionalEmail)
    errors.professionalEmail = t("organization.contacts.errors.emailRequired");
  else if (!EMAIL_REGEX.test(values.professionalEmail))
    errors.professionalEmail = t("organization.contacts.errors.emailInvalid");

  if (values.website && !WEBSITE_REGEX.test(values.website.trim())) {
    errors.website = t("organization.contacts.errors.website");
  }

  return errors;
}

export type ContactsSubmitOutcome =
  | { status: "invalid"; errors: ContactsFormErrors }
  | { status: "unchanged" }
  | { status: "failed"; errors: ContactsFormErrors; message: string | null }
  | { status: "success"; organization: OrganizationResponse };

export async function submitContacts(
  values: ContactsFormValues,
  organization: OrganizationResponse,
  deps: {
    send: (patch: UpdateOrganizationPayload) => Promise<OrganizationResponse>;
    t: TranslationFunction;
  },
): Promise<ContactsSubmitOutcome> {
  const errors = validateContacts(values, deps.t);
  if (Object.keys(errors).length > 0) return { errors, status: "invalid" };

  const patch = buildContactsPatch(values, organization);
  if (Object.keys(patch).length === 0) return { status: "unchanged" };

  try {
    return { organization: await deps.send(patch), status: "success" };
  } catch (error) {
    const { field, key } = classifyOrganizationError(error);
    const message = deps.t(`organization.errors.${key}`);
    return field && field in values
      ? { errors: { [field]: message }, message: null, status: "failed" }
      : { errors: {}, message, status: "failed" };
  }
}

// --------------------------------------------------- data protection officer --
// All three are optional: a server refused an empty string, an explicit null
// clears what was saved.
export type DataProtectionFormValues = {
  email: string;
  name: string;
  phone: string;
};

export type DataProtectionFormErrors = Partial<
  Record<keyof DataProtectionFormValues, string>
>;

export function dataProtectionFormValues(
  organization: OrganizationResponse,
): DataProtectionFormValues {
  const officer = organization.settings.dataProtectionOfficer;
  return {
    email: officer?.email ?? "",
    name: officer?.name ?? "",
    phone: officer?.phone ?? "",
  };
}

export function buildDataProtectionPatch(
  values: DataProtectionFormValues,
  organization: OrganizationResponse,
): UpdateOrganizationPayload {
  const current = dataProtectionFormValues(organization);
  const patch: UpdateOrganizationPayload = {};

  const name = sanitizeTextInput(values.name);
  const email = normalizeEmail(values.email);
  const phone = sanitizePhone(values.phone);

  // Unset and cleared look alike ("" in the form): a clear is sent only when
  // something was actually saved. The backend stores null, never "".
  if (name === "") {
    if (current.name !== "") patch.dataProtectionOfficerName = null;
  } else if (name !== current.name) {
    patch.dataProtectionOfficerName = name;
  }

  if (email === "") {
    if (current.email !== "") patch.dataProtectionOfficerEmail = null;
  } else if (email !== current.email) {
    patch.dataProtectionOfficerEmail = email;
  }

  if (phone === "") {
    if (current.phone !== "") patch.dataProtectionOfficerPhone = null;
  } else if (phone !== current.phone) {
    patch.dataProtectionOfficerPhone = phone;
  }

  return patch;
}

export function validateDataProtection(
  values: DataProtectionFormValues,
  t: TranslationFunction,
): DataProtectionFormErrors {
  const errors: DataProtectionFormErrors = {};
  const { email, name, phone } = {
    email: normalizeEmail(values.email),
    name: sanitizeTextInput(values.name),
    phone: sanitizePhone(values.phone),
  };

  if (name && name.length < 2)
    errors.name = t("organization.protection.errors.nameTooShort");
  if (email && !EMAIL_REGEX.test(email))
    errors.email = t("organization.protection.errors.emailInvalid");
  if (phone && !PHONE_REGEX.test(phone))
    errors.phone = t("organization.protection.errors.phoneInvalid");
  // The backend transforms a phone first and refuses an emptied final value
  // ("nope" carries no digit): a junk-only input must be refused, not read as
  // "clear the saved number".
  else if (
    !phone &&
    typeof values.phone === "string" &&
    values.phone.replace(/[^\d]/g, "") === "" &&
    values.phone.trim() !== ""
  ) {
    errors.phone = t("organization.protection.errors.phoneInvalid");
  }
  return errors;
}

export type DataProtectionSubmitOutcome =
  | { status: "invalid"; errors: DataProtectionFormErrors }
  | { status: "unchanged" }
  | {
      status: "failed";
      errors: DataProtectionFormErrors;
      message: string | null;
    }
  | { status: "success"; organization: OrganizationResponse };

export async function submitDataProtection(
  values: DataProtectionFormValues,
  organization: OrganizationResponse,
  deps: {
    send: (patch: UpdateOrganizationPayload) => Promise<OrganizationResponse>;
    t: TranslationFunction;
  },
): Promise<DataProtectionSubmitOutcome> {
  const errors = validateDataProtection(values, deps.t);
  if (Object.keys(errors).length > 0) return { errors, status: "invalid" };

  const patch = buildDataProtectionPatch(values, organization);
  if (Object.keys(patch).length === 0) return { status: "unchanged" };

  try {
    return { organization: await deps.send(patch), status: "success" };
  } catch (error) {
    const { field, key } = classifyOrganizationError(error);
    const message = deps.t(`organization.errors.${key}`);
    return field && field in values
      ? { errors: { [field]: message }, message: null, status: "failed" }
      : { errors: {}, message, status: "failed" };
  }
}

// ------------------------------------------------------------ opening hours --
export type OpeningHoursFormValues = Record<
  OpeningHoursDay,
  { closed: boolean; periods: OpeningHoursPeriod[] }
>;

export type OpeningHoursFormErrors = Partial<Record<OpeningHoursDay, string>>;

export const MAX_PERIODS_PER_DAY = 3;

// A brand new day, never configured before.
export function defaultPeriod(): OpeningHoursPeriod {
  return { start: "08:00", end: "17:00" };
}

export function openingHoursValues(
  organization: OrganizationResponse,
): OpeningHoursFormValues {
  const stored = organization.settings.openingHours;
  const values = {} as OpeningHoursFormValues;

  for (const day of OPENING_HOURS_DAYS) {
    const dayValue = stored?.[day];
    values[day] = dayValue
      ? {
          closed: dayValue.closed,
          periods: dayValue.closed
            ? []
            : dayValue.periods.map((period) => ({ ...period })),
        }
      : { closed: true, periods: [] };
  }

  return values;
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function validateOpeningHours(
  values: OpeningHoursFormValues,
  t: TranslationFunction,
): OpeningHoursFormErrors {
  const errors: OpeningHoursFormErrors = {};

  for (const day of OPENING_HOURS_DAYS) {
    if (values[day].closed) continue;

    const periods = values[day].periods;
    if (periods.length === 0) {
      errors[day] = t("organization.hours.errors.noPeriod");
      continue;
    }

    let broken = false;
    for (const period of periods) {
      if (!TIME_PATTERN.test(period.start) || !TIME_PATTERN.test(period.end)) {
        errors[day] = t("organization.hours.errors.missingTime");
        broken = true;
        break;
      }
      if (minutesOf(period.start) >= minutesOf(period.end)) {
        errors[day] = t("organization.hours.errors.startBeforeEnd");
        broken = true;
        break;
      }
    }
    if (broken) continue;

    const sorted = [...periods].sort(
      (first, second) => minutesOf(first.start) - minutesOf(second.start),
    );
    for (let index = 1; index < sorted.length; index += 1) {
      if (minutesOf(sorted[index]!.start) < minutesOf(sorted[index - 1]!.end)) {
        errors[day] = t("organization.hours.errors.overlap");
        break;
      }
    }
  }

  return errors;
}

// Exactly what the backend rebuilds: closed days lose their periods, open
// days are sorted by start. Nothing else is ever sent.
export function buildOpeningHoursPayload(
  values: OpeningHoursFormValues,
): UpdateOpeningHoursPayload {
  const openingHours = {} as UpdateOpeningHoursPayload["openingHours"];

  for (const day of OPENING_HOURS_DAYS) {
    const dayValue = values[day];
    const periods = dayValue.closed
      ? []
      : [...dayValue.periods].sort(
          (first, second) => minutesOf(first.start) - minutesOf(second.start),
        );
    openingHours[day] = { closed: dayValue.closed, periods };
  }

  return { openingHours };
}

export type OpeningHoursSubmitOutcome =
  | { status: "invalid"; errors: OpeningHoursFormErrors }
  | { status: "unchanged" }
  | { status: "failed"; errors: OpeningHoursFormErrors; message: string | null }
  | { status: "success"; organization: OrganizationResponse };

export async function submitOpeningHours(
  values: OpeningHoursFormValues,
  deps: {
    send: (payload: UpdateOpeningHoursPayload) => Promise<OrganizationResponse>;
    t: TranslationFunction;
  },
): Promise<OpeningHoursSubmitOutcome> {
  const errors = validateOpeningHours(values, deps.t);
  if (Object.keys(errors).length > 0) return { errors, status: "invalid" };

  try {
    return {
      organization: await deps.send(buildOpeningHoursPayload(values)),
      status: "success",
    };
  } catch (error) {
    const { key } = classifyOrganizationError(error);
    return {
      errors: {},
      message: deps.t(`organization.errors.${key}`),
      status: "failed",
    };
  }
}
