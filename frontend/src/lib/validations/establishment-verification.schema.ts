import { z } from "zod";

import { normalizeEmail, sanitizePhone, sanitizeTextInput } from "@/lib/security";
import { ALGERIAN_WILAYAS, ESTABLISHMENT_TYPES } from "@/types/auth";
import {
  type EstablishmentVerificationFormInput,
  type VerificationValidationMessages,
} from "@/features/verification/types/verification.types";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ["pdf", "jpg", "jpeg", "png"] as const;

function getFileExtension(fileName: string) {
  const segments = fileName.toLowerCase().split(".");
  return segments.length > 1 ? segments.at(-1) ?? "" : "";
}

export function isAcceptedDocumentFile(file: File | null | undefined) {
  if (!file) {
    return false;
  }

  return ACCEPTED_EXTENSIONS.includes(
    getFileExtension(file.name) as (typeof ACCEPTED_EXTENSIONS)[number],
  );
}

export function isDocumentSizeValid(file: File | null | undefined) {
  if (!file) {
    return false;
  }

  return file.size <= MAX_FILE_SIZE;
}

const documentField = (messages: VerificationValidationMessages) =>
  z
    .custom<File | null>((value) => value instanceof File || value === null, {
      message: messages.required,
    })
    .superRefine((file, context) => {
      if (!file) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.required,
        });
        return;
      }

      if (!isAcceptedDocumentFile(file)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.formatNotAccepted,
        });
      }

      if (!isDocumentSizeValid(file)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: messages.fileTooLarge,
        });
      }
    });

const requiredText = (messages: VerificationValidationMessages, max = 255) =>
  z
    .string()
    .transform(sanitizeTextInput)
    .pipe(z.string().min(1, messages.required).max(max, messages.required));

export function createEstablishmentVerificationSchema(
  messages: VerificationValidationMessages,
) {
  return z.object({
    address: requiredText(messages, 255),
    addressProofDocument: documentField(messages),
    commercialRegisterDocument: documentField(messages),
    commercialRegisterNumber: requiredText(messages, 120),
    establishmentName: requiredText(messages, 150),
    establishmentType: requiredText(messages, 80).refine(
      (value) => ESTABLISHMENT_TYPES.includes(value as (typeof ESTABLISHMENT_TYPES)[number]),
      { message: messages.required },
    ),
    healthAuthorizationDocument: documentField(messages),
    healthAuthorizationNumber: requiredText(messages, 120),
    managerFullName: requiredText(messages, 120),
    managerIdDocument: documentField(messages),
    nif: requiredText(messages, 120),
    nifDocument: documentField(messages),
    phone: z
      .string()
      .transform(sanitizePhone)
      .pipe(z.string().min(1, messages.required).max(24, messages.required)),
    professionalEmail: z
      .string()
      .transform(normalizeEmail)
      .pipe(z.string().min(1, messages.required).email(messages.emailInvalid)),
    wilaya: requiredText(messages, 80).refine(
      (value) => ALGERIAN_WILAYAS.includes(value as (typeof ALGERIAN_WILAYAS)[number]),
      { message: messages.required },
    ),
  }) satisfies z.ZodType<EstablishmentVerificationFormInput>;
}

export { ACCEPTED_EXTENSIONS, MAX_FILE_SIZE };
