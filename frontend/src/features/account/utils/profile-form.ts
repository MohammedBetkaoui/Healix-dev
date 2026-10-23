import { type TranslationFunction } from "@/lib/i18n";
import { sanitizePhone, sanitizeTextInput } from "@/lib/security";
import { ALGERIAN_WILAYAS, ESTABLISHMENT_TYPES } from "@/types/auth";

import {
  type AccountKind,
  type AccountProfile,
  type ProfileField,
  type UpdateProfilePayload,
} from "../types/account.types";
import { classifyAccountError } from "./account-errors";

export type ProfileFormValues = Record<ProfileField, string>;
export type ProfileFormErrors = Partial<Record<ProfileField, string>>;

// Same as backend/src/account: what each kind of account has.
const FIELDS_OF_KIND: Record<AccountKind, readonly ProfileField[]> = {
  DOCTOR: ["fullName", "speciality", "wilaya", "phone", "address"],
  ESTABLISHMENT: ["fullName", "establishmentName", "establishmentType", "wilaya", "phone", "address"],
};

const PHONE_REGEX = /^\+?[0-9\s().-]{8,20}$/;

// [min, max] lengths of the text fields, as the backend checks them.
const LENGTHS: Partial<Record<ProfileField, readonly [number, number]>> = {
  address: [5, 255],
  establishmentName: [2, 150],
  fullName: [2, 120],
  speciality: [2, 100],
};

export function profileFieldsOf(kind: AccountKind): readonly ProfileField[] {
  return FIELDS_OF_KIND[kind];
}

export function profileFormValues(profile: AccountProfile): ProfileFormValues {
  return {
    address: profile.doctor?.address ?? profile.establishment?.address ?? "",
    establishmentName: profile.establishment?.name ?? "",
    establishmentType: profile.establishment?.type ?? "",
    fullName: profile.fullName,
    phone: profile.phone,
    speciality: profile.doctor?.speciality ?? "",
    wilaya: profile.doctor?.wilaya ?? profile.establishment?.wilaya ?? "",
  };
}

export function isFieldLocked(profile: AccountProfile, field: ProfileField): boolean {
  return profile.lockedFields.includes(field);
}

const clean = (field: ProfileField, value: string) => (field === "phone" ? sanitizePhone(value) : sanitizeTextInput(value));

// What to send: the fields that changed, and never a locked one, whatever the
// form holds (the server refuses it anyway).
export function buildProfilePatch(values: ProfileFormValues, profile: AccountProfile): UpdateProfilePayload {
  const current = profileFormValues(profile);
  const patch: UpdateProfilePayload = {};

  for (const field of profileFieldsOf(profile.kind)) {
    if (isFieldLocked(profile, field)) continue;
    const next = clean(field, values[field]);
    if (next !== current[field]) patch[field] = next;
  }

  return patch;
}

// The editable fields only: a locked one is not the user's to correct.
export function validateProfile(values: ProfileFormValues, profile: AccountProfile, t: TranslationFunction): ProfileFormErrors {
  const errors: ProfileFormErrors = {};

  for (const field of profileFieldsOf(profile.kind)) {
    if (isFieldLocked(profile, field)) continue;
    const value = clean(field, values[field]);
    const lengths = LENGTHS[field];

    if (lengths) {
      if (value.length < lengths[0]) errors[field] = t("account.common.required");
      else if (value.length > lengths[1]) errors[field] = t("register.errors.maxLength", { max: lengths[1] });
    } else if (field === "phone") {
      if (!value) errors[field] = t("register.errors.phoneRequired");
      else if (!PHONE_REGEX.test(value)) errors[field] = t("register.errors.phoneInvalid");
    } else if (field === "wilaya") {
      if (!ALGERIAN_WILAYAS.includes(value as (typeof ALGERIAN_WILAYAS)[number])) errors[field] = t("account.common.required");
    } else if (field === "establishmentType") {
      if (!ESTABLISHMENT_TYPES.includes(value as (typeof ESTABLISHMENT_TYPES)[number])) errors[field] = t("account.common.required");
    }
  }

  return errors;
}

export type ProfileSubmitOutcome =
  | { status: "invalid"; errors: ProfileFormErrors }
  | { status: "unchanged" }
  | { status: "failed"; errors: ProfileFormErrors; message: string | null }
  | { status: "success"; profile: AccountProfile };

export async function submitProfile(
  values: ProfileFormValues,
  profile: AccountProfile,
  deps: { send: (patch: UpdateProfilePayload) => Promise<AccountProfile>; t: TranslationFunction },
): Promise<ProfileSubmitOutcome> {
  const errors = validateProfile(values, profile, deps.t);
  if (Object.keys(errors).length > 0) return { errors, status: "invalid" };

  const patch = buildProfilePatch(values, profile);
  if (Object.keys(patch).length === 0) return { status: "unchanged" };

  try {
    return { profile: await deps.send(patch), status: "success" };
  } catch (error) {
    const { field, fields, key } = classifyAccountError(error);
    const message = deps.t(`account.errors.${key}`);
    const named = (fields ?? (field ? [field] : [])).filter((name): name is ProfileField => name in values);

    return named.length > 0
      ? { errors: Object.fromEntries(named.map((name) => [name, message])), message: null, status: "failed" }
      : { errors: {}, message, status: "failed" };
  }
}
