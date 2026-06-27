import { z } from "zod";

import {
  normalizeEmail,
  sanitizePhone,
  sanitizeTextInput,
} from "@/lib/security";
import {
  type DoctorVerificationFormInput,
  type DoctorVerificationValidationMessages,
} from "@/features/verification/types/doctor-verification.types";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;

function getFileExtension(fileName: string) {
  const segments = fileName.toLowerCase().split(".");
  return segments.length > 1 ? segments.at(-1) ?? "" : "";
}

function isFileLike(value: unknown): value is File {
  return (
    typeof File !== "undefined" &&
    value instanceof File
  );
}

export function isAcceptedDoctorDocumentFile(file: File | null | undefined) {
  if (!file) {
    return false;
  }

  return ACCEPTED_EXTENSIONS.includes(
    getFileExtension(file.name) as (typeof ACCEPTED_EXTENSIONS)[number],
  );
}

export function isDoctorDocumentSizeValid(file: File | null | undefined) {
  if (!file) {
    return false;
  }

  return file.size <= MAX_FILE_SIZE;
}

function requiredText(
  messages: DoctorVerificationValidationMessages,
  max = 180,
) {
  return z
    .string()
    .transform(sanitizeTextInput)
    .pipe(z.string().min(1, messages.required).max(max, messages.required));
}

function optionalText(max = 180) {
  return z
    .string()
    .transform(sanitizeTextInput)
    .pipe(z.string().max(max));
}

function requiredEmail(messages: DoctorVerificationValidationMessages) {
  return z
    .string()
    .transform(normalizeEmail)
    .pipe(
      z
        .string()
        .min(1, messages.required)
        .email(messages.emailInvalid)
        .max(160, messages.emailInvalid),
    );
}

function optionalEmail(messages: DoctorVerificationValidationMessages) {
  return z
    .string()
    .transform(normalizeEmail)
    .pipe(
      z
        .string()
        .max(160, messages.emailInvalid)
        .refine((value) => !value || z.string().email().safeParse(value).success, {
          message: messages.emailInvalid,
        }),
    );
}

function requiredPhone(messages: DoctorVerificationValidationMessages) {
  return z
    .string()
    .transform(sanitizePhone)
    .pipe(z.string().min(1, messages.required).max(24, messages.required));
}

function optionalPhone() {
  return z
    .string()
    .transform(sanitizePhone)
    .pipe(z.string().max(24));
}

function documentField(messages: DoctorVerificationValidationMessages) {
  return z
    .custom<File | null>(
      (value) => isFileLike(value) || value === null || value === undefined,
      { message: messages.required },
    )
    .transform((value) => value ?? null)
    .superRefine((file, context) => {
      if (!file) {
        return;
      }

      if (!isAcceptedDoctorDocumentFile(file)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.formatNotAccepted,
        });
      }

      if (!isDoctorDocumentSizeValid(file)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.fileTooLarge,
        });
      }
    });
}

export function doctorIdentitySchema(
  messages: DoctorVerificationValidationMessages,
) {
  return z.object({
    fullName: requiredText(messages, 120),
    birthDate: requiredText(messages, 40),
    birthPlace: optionalText(120),
    nationality: optionalText(80),
    identityNumber: requiredText(messages, 80),
    identityDocumentType: requiredText(messages, 80),
    phone: requiredPhone(messages),
    professionalEmail: requiredEmail(messages),
    wilaya: requiredText(messages, 80),
    commune: requiredText(messages, 100),
    personalOrProfessionalAddress: optionalText(220),
  });
}

export function doctorQualificationSchema(
  messages: DoctorVerificationValidationMessages,
) {
  return z.object({
    doctorType: requiredText(messages, 80),
    speciality: requiredText(messages, 100),
    primaryDegree: requiredText(messages, 120),
    university: requiredText(messages, 140),
    graduationYear: requiredText(messages, 10),
    specialityDegree: optionalText(140),
    specialityGraduationYear: optionalText(10),
  });
}

export function doctorProfessionalRegistrationSchema(
  messages: DoctorVerificationValidationMessages,
) {
  return z.object({
    ordreRegistrationNumber: requiredText(messages, 120),
    regionalCouncil: optionalText(140),
    registrationWilaya: requiredText(messages, 80),
    registrationDate: requiredText(messages, 40),
    professionalStatus: requiredText(messages, 120),
    practiceAuthorizationNumber: optionalText(120),
    issuingAuthority: optionalText(140),
  });
}

export function doctorPracticeLocationSchema(
  messages: DoctorVerificationValidationMessages,
) {
  return z.object({
    cabinetName: optionalText(140),
    cabinetType: requiredText(messages, 100),
    cabinetAddress: requiredText(messages, 220),
    cabinetWilaya: requiredText(messages, 80),
    cabinetCommune: requiredText(messages, 100),
    cabinetPhone: optionalPhone(),
    cabinetEmail: optionalEmail(messages),
    healthDirectorate: requiredText(messages, 160),
    cabinetOpeningAuthorizationNumber: optionalText(120),
  });
}

export function doctorFiscalSocialSchema(
  messages: DoctorVerificationValidationMessages,
) {
  return z.object({
    nif: requiredText(messages, 120),
    taxCenter: requiredText(messages, 160),
    casnosNumber: optionalText(120),
    fiscalActivityType: requiredText(messages, 120),
    professionalRib: optionalText(80),
  });
}

export function doctorDocumentsSubmissionSchema(
  messages: DoctorVerificationValidationMessages,
) {
  return z.object({
    identityDocument: documentField(messages),
    medicalDegreeDocument: documentField(messages),
    specialityDegreeDocument: documentField(messages),
    ordreRegistrationDocument: documentField(messages),
    practiceAuthorizationDocument: documentField(messages),
    cabinetAddressProofDocument: documentField(messages),
    nifDocument: documentField(messages),
    casnosCertificateDocument: documentField(messages),
    cabinetOpeningAuthorizationDocument: documentField(messages),
    professionalPhotoDocument: documentField(messages),
    stampSignatureDocument: documentField(messages),
    cabinetOwnershipOrRentalDocument: documentField(messages),
    goodStandingCertificateDocument: documentField(messages),
    confirmAuthenticity: z.boolean().refine(Boolean, {
      message: messages.confirmAuthenticity,
    }),
  });
}

export function createDoctorVerificationSchema(
  messages: DoctorVerificationValidationMessages,
) {
  return doctorIdentitySchema(messages)
    .merge(doctorQualificationSchema(messages))
    .merge(doctorProfessionalRegistrationSchema(messages))
    .merge(doctorPracticeLocationSchema(messages))
    .merge(doctorFiscalSocialSchema(messages))
    .merge(doctorDocumentsSubmissionSchema(messages)) satisfies z.ZodType<DoctorVerificationFormInput>;
}

export { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE };
