import { type Locale } from "@/i18n";

import {
  type LocalizedText,
  type PrescriptionStatus,
  type PrescriptionType,
} from "./types/prescription.types";

export function localize(value: LocalizedText, locale: Locale) {
  return value[locale];
}

export const prescriptionStatusTranslationKeys: Record<
  PrescriptionStatus,
  string
> = {
  CANCELED: "prescriptions.statuses.canceled",
  DRAFT: "prescriptions.statuses.draft",
  EXPIRED: "prescriptions.statuses.expired",
  PENDING_VALIDATION: "prescriptions.statuses.pendingValidation",
  PRINTED: "prescriptions.statuses.printed",
  VALIDATED: "prescriptions.statuses.validated",
};

export const prescriptionTypeTranslationKeys: Record<PrescriptionType, string> = {
  NARCOTIC: "prescriptions.types.narcotic",
  PSYCHOTROPIC: "prescriptions.types.psychotropic",
  REGULATED: "prescriptions.types.regulated",
  STANDARD: "prescriptions.types.standard",
};

