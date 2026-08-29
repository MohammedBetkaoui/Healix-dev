import { type Locale } from "@/i18n";
import { type Patient, type PatientFormValues } from "@/types/patient";

const transliterationAliases: Record<string, string> = {
  mohamed: "mohamed",
  mohammad: "mohamed",
  mohammed: "mohamed",
  muhammad: "mohamed",
  muhamed: "mohamed",
  abdallah: "abdellah",
  abdullah: "abdellah",
};

function removeArabicDiacritics(value: string) {
  return value.replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "");
}

export function normalizePatientSearch(value: string) {
  const cleaned = removeArabicDiacritics(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[’']/g, "")
    .replace(/[-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned
    .split(" ")
    .map((token) => transliterationAliases[token] ?? token)
    .join("");
}

export function patientMatchesSearch(patient: Patient, rawQuery: string) {
  const query = normalizePatientSearch(rawQuery);
  if (!query) return true;

  const searchableFields = [
    `${patient.firstName} ${patient.lastName}`,
    `${patient.lastName} ${patient.firstName}`,
    `${patient.firstNameAr} ${patient.lastNameAr}`,
    `${patient.lastNameAr} ${patient.firstNameAr}`,
    patient.id,
    patient.phone,
    patient.nationalId,
    patient.birthDate,
    patient.hospitalRecordNumber,
  ];

  return searchableFields.some((field) => normalizePatientSearch(field).includes(query));
}

export function formatPatientDate(value: string, locale: Locale, emptyLabel = "—") {
  if (!value) return emptyLabel;
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return emptyLabel;

  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatPatientDateTime(value: string, locale: Locale, emptyLabel = "—") {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;

  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function getPatientAge(birthDate: string) {
  const today = new Date();
  const birth = new Date(`${birthDate}T12:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function formatAlgerianPhone(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^213/, "0").slice(0, 10);
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
}

export type PotentialPatientDuplicate = {
  patient: Patient;
  reasons: Array<"IDENTITY" | "PHONE" | "NIN">;
};

export function findPotentialPatientDuplicate(
  values: PatientFormValues,
  patients: Patient[],
): PotentialPatientDuplicate | undefined {
  const normalizedName = normalizePatientSearch(`${values.firstName} ${values.lastName}`);
  const normalizedArabicName = normalizePatientSearch(`${values.firstNameAr} ${values.lastNameAr}`);
  const phone = values.phone.replace(/\D/g, "");
  const nationalId = values.nationalId.replace(/\D/g, "");

  return patients
    .map((patient) => {
      const reasons: PotentialPatientDuplicate["reasons"] = [];
      const sameLatinName = normalizedName.length > 2
        && normalizePatientSearch(`${patient.firstName} ${patient.lastName}`) === normalizedName;
      const sameArabicName = normalizedArabicName.length > 2
        && normalizePatientSearch(`${patient.firstNameAr} ${patient.lastNameAr}`) === normalizedArabicName;

      if ((sameLatinName || sameArabicName) && patient.birthDate === values.birthDate) {
        reasons.push("IDENTITY");
      }
      if (phone.length >= 9 && patient.phone.replace(/\D/g, "") === phone) reasons.push("PHONE");
      if (nationalId.length >= 10 && patient.nationalId.replace(/\D/g, "") === nationalId) reasons.push("NIN");

      return { patient, reasons };
    })
    .filter((match) => match.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length)[0];
}

export function maskPatientName(patient: Patient, locale: Locale) {
  const firstName = locale === "ar" ? patient.firstNameAr : patient.firstName;
  const lastName = locale === "ar" ? patient.lastNameAr : patient.lastName;
  const mask = (part: string) => `${part.slice(0, 1)}${"•".repeat(Math.max(2, part.length - 1))}`;
  return `${mask(firstName)} ${mask(lastName)}`;
}
