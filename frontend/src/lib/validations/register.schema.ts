import { z } from "zod";

import {
  normalizeEmail,
  sanitizePhone,
  sanitizeTextInput,
} from "@/lib/security";
import {
  ALGERIAN_WILAYAS,
  ESTABLISHMENT_TYPES,
  type EstablishmentRegisterFormValues,
  type EstablishmentRegisterInput,
  type EstablishmentType,
  type IndependentDoctorRegisterFormValues,
  type IndependentDoctorRegisterInput,
  type Wilaya,
} from "@/types/auth";

const PHONE_REGEX = /^\+?[0-9\s().-]{8,20}$/;

export type RegisterValidationMessages = {
  required: string;
  emailInvalid: string;
  phoneRequired: string;
  phoneInvalid: string;
  passwordTooShort: string;
  passwordMismatch: string;
  acceptTerms: string;
  maxLength: (max: number) => string;
};

const requiredText = (
  maxLength: number,
  messages: RegisterValidationMessages,
) =>
  z
    .string()
    .transform(sanitizeTextInput)
    .pipe(
      z
        .string()
        .min(1, messages.required)
        .max(maxLength, messages.maxLength(maxLength)),
    );

const requiredEmail = (messages: RegisterValidationMessages) =>
  z
    .string()
    .transform(normalizeEmail)
    .pipe(
      z
        .string()
        .min(1, messages.required)
        .email(messages.emailInvalid)
        .max(160, messages.maxLength(160)),
    );

const requiredPhone = (messages: RegisterValidationMessages) =>
  z
    .string()
    .transform(sanitizePhone)
    .pipe(
      z
        .string()
        .min(1, messages.phoneRequired)
        .regex(PHONE_REGEX, messages.phoneInvalid)
        .max(24, messages.maxLength(24)),
    );

const wilayaSchema = (messages: RegisterValidationMessages) =>
  requiredText(80, messages).refine(
    (value): value is Wilaya => ALGERIAN_WILAYAS.includes(value as Wilaya),
    { message: messages.required },
  );

const establishmentTypeSchema = (messages: RegisterValidationMessages) =>
  requiredText(80, messages).refine(
    (value): value is EstablishmentType =>
      ESTABLISHMENT_TYPES.includes(value as EstablishmentType),
    { message: messages.required },
  );

const passwordSchema = (messages: RegisterValidationMessages) =>
  z
    .string()
    .min(1, messages.required)
    .min(8, messages.passwordTooShort)
    .max(128, messages.maxLength(128));

const requiredConsent = (message: string) =>
  z.boolean().refine((value) => value, { message });

export function createEstablishmentRegisterSchema(
  messages: RegisterValidationMessages,
): z.ZodType<EstablishmentRegisterInput, EstablishmentRegisterFormValues> {
  return z
    .object({
      accountType: z.literal("ESTABLISHMENT"),
      establishmentName: requiredText(120, messages),
      establishmentType: establishmentTypeSchema(messages),
      wilaya: wilayaSchema(messages),
      address: requiredText(180, messages),
      professionalEmail: requiredEmail(messages),
      phone: requiredPhone(messages),
      managerFullName: requiredText(120, messages),
      password: passwordSchema(messages),
      confirmPassword: passwordSchema(messages),
      acceptTerms: requiredConsent(messages.acceptTerms),
      acceptVerification: requiredConsent(messages.required),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: messages.passwordMismatch,
      path: ["confirmPassword"],
    });
}

export function createIndependentDoctorRegisterSchema(
  messages: RegisterValidationMessages,
): z.ZodType<
  IndependentDoctorRegisterInput,
  IndependentDoctorRegisterFormValues
> {
  return z
    .object({
      accountType: z.literal("INDEPENDENT_DOCTOR"),
      fullName: requiredText(120, messages),
      speciality: requiredText(100, messages),
      wilaya: wilayaSchema(messages),
      professionalAddress: requiredText(180, messages),
      email: requiredEmail(messages),
      phone: requiredPhone(messages),
      password: passwordSchema(messages),
      confirmPassword: passwordSchema(messages),
      acceptTerms: requiredConsent(messages.acceptTerms),
      acceptVerification: requiredConsent(messages.required),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: messages.passwordMismatch,
      path: ["confirmPassword"],
    });
}
