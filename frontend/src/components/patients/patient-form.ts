import { z } from "zod";

import {
  patientBloodGroupValues,
  patientGenderValues,
} from "@/features/patients/patients.constants";
import { type TranslationFunction } from "@/lib/i18n";
import {
  type Patient,
  type PatientBloodGroup,
  type PatientFormValues,
  type PatientGender,
} from "@/types/patient";

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createPatientFormSchema(t: TranslationFunction) {
  return z.object({
    address: z.string().max(240).optional().or(z.literal("")),
    allergies: z.string().max(500).optional().or(z.literal("")),
    birthDate: z.string().min(1, t("patients.modal.errors.birthDate")),
    bloodGroup: z
      .union([z.literal(""), z.enum(patientBloodGroupValues)])
      .optional(),
    chronicDiseases: z.string().max(500).optional().or(z.literal("")),
    email: z
      .string()
      .trim()
      .optional()
      .or(z.literal(""))
      .refine((value) => !value || z.email().safeParse(value).success, {
        message: t("patients.modal.errors.email"),
      }),
    emergencyContactName: z
      .string()
      .trim()
      .min(1, t("patients.modal.errors.emergencyContactName")),
    emergencyContactPhone: z
      .string()
      .trim()
      .min(1, t("patients.modal.errors.emergencyContactPhone")),
    firstName: z.string().trim().min(1, t("patients.modal.errors.firstName")),
    gender: z
      .union([z.literal(""), z.enum(patientGenderValues)])
      .refine((value): value is PatientGender => value !== "", {
        message: t("patients.modal.errors.gender"),
      }),
    history: z.string().max(500).optional().or(z.literal("")),
    lastName: z.string().trim().min(1, t("patients.modal.errors.lastName")),
    phone: z.string().trim().min(1, t("patients.modal.errors.phone")),
  });
}

export function getPatientFormValues(patient?: Patient): PatientFormValues {
  if (!patient) {
    return {
      address: "",
      allergies: "",
      birthDate: "",
      bloodGroup: "",
      chronicDiseases: "",
      email: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
      firstName: "",
      gender: "",
      history: "",
      lastName: "",
      phone: "",
    };
  }

  return {
    address: patient.address,
    allergies: patient.medicalSummary.allergies.join(", "),
    birthDate: patient.birthDate,
    bloodGroup: patient.bloodGroup,
    chronicDiseases: patient.medicalSummary.chronicDiseases.join(", "),
    email: patient.email,
    emergencyContactName: patient.emergencyContactName,
    emergencyContactPhone: patient.emergencyContactPhone,
    firstName: patient.firstName,
    gender: patient.gender,
    history: patient.medicalSummary.history.join(", "),
    lastName: patient.lastName,
    phone: patient.phone,
  };
}

export function createPatientFromForm(
  values: PatientFormValues,
  basePatient: Patient,
): Patient {
  return {
    ...basePatient,
    address: values.address,
    birthDate: values.birthDate,
    bloodGroup: (values.bloodGroup || "O+") as PatientBloodGroup,
    email: values.email,
    emergencyContactName: values.emergencyContactName,
    emergencyContactPhone: values.emergencyContactPhone,
    firstName: values.firstName,
    gender: values.gender as PatientGender,
    lastName: values.lastName,
    medicalSummary: {
      ...basePatient.medicalSummary,
      allergies: splitList(values.allergies),
      chronicDiseases: splitList(values.chronicDiseases),
      history: splitList(values.history),
    },
    phone: values.phone,
  };
}
