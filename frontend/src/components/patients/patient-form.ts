import { z } from "zod";

import {
  patientGenderValues,
  patientInsuranceValues,
  patientSectorValues,
} from "@/features/patients/patients.constants";
import { type TranslationFunction } from "@/lib/i18n";
import {
  type Patient,
  type PatientFormValues,
  type PatientGender,
  type PatientInsurance,
  type PatientSector,
} from "@/types/patient";

export function createPatientFormSchema(t: TranslationFunction) {
  return z.object({
    address: z.string().trim().min(5, t("patients.modal.errors.address")),
    birthDate: z.string().min(1, t("patients.modal.errors.birthDate")),
    commune: z.string().trim().min(1, t("patients.modal.errors.commune")),
    doctorRegistrationNumber: z.string().trim().min(1, t("patients.modal.errors.doctorRegistrationNumber")),
    email: z.string().trim().refine(
      (value) => !value || z.email().safeParse(value).success,
      { message: t("patients.modal.errors.email") },
    ),
    emergencyContactName: z.string().trim().min(2, t("patients.modal.errors.emergencyContactName")),
    emergencyContactPhone: z.string().trim().min(6, t("patients.modal.errors.emergencyContactPhone")),
    firstName: z.string().trim().min(1, t("patients.modal.errors.firstName")),
    firstNameAr: z.string().trim().min(1, t("patients.modal.errors.firstNameAr")),
    gender: z.string().refine(
      (value) => patientGenderValues.includes(value as PatientGender),
      { message: t("patients.modal.errors.gender") },
    ),
    healthDataConsent: z.boolean().refine((value) => value, {
      message: t("patients.modal.errors.consent"),
    }),
    hospitalRecordNumber: z.string().trim(),
    insurance: z.string().refine(
      (value) => patientInsuranceValues.includes(value as PatientInsurance),
      { message: t("patients.modal.errors.insurance") },
    ),
    insuredNumber: z.string().trim(),
    lastName: z.string().trim().min(1, t("patients.modal.errors.lastName")),
    lastNameAr: z.string().trim().min(1, t("patients.modal.errors.lastNameAr")),
    nationalId: z.string().trim().refine(
      (value) => !value || /^\d{18}$/.test(value.replace(/\s/g, "")),
      { message: t("patients.modal.errors.nationalId") },
    ),
    phone: z.string().trim().refine(
      (value) => /^0[5-7]\d{8}$/.test(value.replace(/\D/g, "")),
      { message: t("patients.modal.errors.phone") },
    ),
    referringDoctor: z.string().trim().min(1, t("patients.modal.errors.referringDoctor")),
    sector: z.string().refine(
      (value) => patientSectorValues.includes(value as PatientSector),
      { message: t("patients.modal.errors.sector") },
    ),
    smsEnabled: z.boolean(),
    wilaya: z.string().trim().min(1, t("patients.modal.errors.wilaya")),
  });
}

export function getPatientFormValues(patient?: Patient): PatientFormValues {
  return {
    address: patient?.address ?? "",
    birthDate: patient?.birthDate ?? "",
    commune: patient?.commune ?? "",
    doctorRegistrationNumber: patient?.doctorRegistrationNumber ?? "",
    email: patient?.email ?? "",
    emergencyContactName: patient?.emergencyContactName ?? "",
    emergencyContactPhone: patient?.emergencyContactPhone ?? "",
    firstName: patient?.firstName ?? "",
    firstNameAr: patient?.firstNameAr ?? "",
    gender: patient?.gender ?? "",
    healthDataConsent: patient?.consents.some(
      (consent) => consent.type === "HEALTH_DATA" && consent.status === "SIGNED",
    ) ?? false,
    hospitalRecordNumber: patient?.hospitalRecordNumber ?? "",
    insurance: patient?.insurance ?? "",
    insuredNumber: patient?.insuredNumber ?? "",
    lastName: patient?.lastName ?? "",
    lastNameAr: patient?.lastNameAr ?? "",
    nationalId: patient?.nationalId ?? "",
    phone: patient?.phone ?? "",
    referringDoctor: patient?.assignedDoctor ?? "",
    sector: patient?.sector ?? "",
    smsEnabled: patient?.smsEnabled ?? true,
    wilaya: patient ? `${patient.wilayaCode}|${patient.wilaya}` : "",
  };
}
