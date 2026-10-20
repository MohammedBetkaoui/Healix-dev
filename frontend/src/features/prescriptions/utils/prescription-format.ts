import { type Locale } from "@/i18n";

import {
  type Prescription,
  type PrescriptionPatient,
} from "../types/prescription.types";

export function getPatientDisplayName(patient: PrescriptionPatient, locale: Locale) {
  return `${patient.firstName[locale]} ${patient.lastName[locale]}`;
}

export function getPatientAge(birthDate: string, now = new Date("2026-10-19T12:00:00+01:00")) {
  const birth = new Date(`${birthDate}T00:00:00`);
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

export function getPrescriptionDuration(prescription: Prescription) {
  return prescription.items.reduce((longest, item) => Math.max(longest, item.durationDays), 0);
}

export function matchesPrescriptionSearch(prescription: Prescription, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;

  const searchable = [
    prescription.number,
    prescription.patient.firstName.fr,
    prescription.patient.lastName.fr,
    prescription.patient.firstName.ar,
    prescription.patient.lastName.ar,
    prescription.prescriber.firstName,
    prescription.prescriber.lastName,
    ...prescription.items.flatMap((item) => [item.medication.dci, item.medication.brandName ?? ""]),
  ].join(" ").toLocaleLowerCase();

  return searchable.includes(normalized);
}

