import { type Locale } from "@/i18n";

import {
  type Prescription,
  type PrescriptionPatient,
} from "../types/prescription.types";

type NamedPatient = Pick<PrescriptionPatient, "firstName" | "firstNameAr" | "lastName" | "lastNameAr">;

/** "First Last" in the language of the page, falling back to the other script. */
export function getPatientDisplayName(patient: NamedPatient, locale: Locale) {
  const first = (locale === "ar" ? patient.firstNameAr || patient.firstName : patient.firstName || patient.firstNameAr) ?? "";
  const last = (locale === "ar" ? patient.lastNameAr || patient.lastName : patient.lastName || patient.lastNameAr) ?? "";
  return `${first} ${last}`.trim();
}

/** "Dr. Name", unless the stored name already carries its title. */
export function formatDoctorName(fullName: string | null | undefined) {
  const name = fullName?.trim();
  if (!name) return "";
  return /^(dr|pr)\b\.?/i.test(name) ? name : `Dr. ${name}`;
}

export function getPatientAge(birthDate: string, now = new Date()) {
  const birth = new Date(birthDate);
  let age = now.getFullYear() - birth.getFullYear();
  const month = now.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function formatPrescriptionDate(value: string, locale: Locale, withTime = false) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "2-digit",
    month: withTime ? "short" : "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", hourCycle: "h23" as const, minute: "2-digit" } : {}),
  }).format(new Date(value));
}

/** Longest treatment of the prescription, in days (0 when none is set). */
export function getPrescriptionDuration(prescription: Pick<Prescription, "items">) {
  return prescription.items.reduce((longest, item) => Math.max(longest, item.durationDays ?? 0), 0);
}

/** Start of the period "the last `days` days", as an ISO date for the `from` filter. */
export function periodStart(days: number, now = new Date()) {
  const since = new Date(now);
  since.setDate(since.getDate() - days);
  return since.toISOString();
}
