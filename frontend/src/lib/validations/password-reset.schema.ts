import { z } from "zod";

import { normalizeEmail } from "@/lib/security";

import {
  passwordSchema,
  type RegisterValidationMessages,
} from "./register.schema";

export type ForgotPasswordValidationMessages = {
  emailInvalid: string;
  emailRequired: string;
};

export function createForgotPasswordSchema(
  messages: ForgotPasswordValidationMessages,
) {
  return z.object({
    email: z
      .string()
      .transform(normalizeEmail)
      .pipe(
        z
          .string()
          .min(1, messages.emailRequired)
          .email(messages.emailInvalid)
          .max(191, messages.emailInvalid),
      ),
  });
}

// The registration rule, and the registration messages, for the new
// password.
export function createResetPasswordSchema(
  messages: RegisterValidationMessages,
) {
  return z
    .object({
      password: passwordSchema(messages),
      confirmPassword: passwordSchema(messages),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: messages.passwordMismatch,
      path: ["confirmPassword"],
    });
}
