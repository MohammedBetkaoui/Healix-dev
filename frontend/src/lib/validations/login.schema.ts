import { z } from "zod";

import { normalizeEmail } from "@/lib/security";

export type LoginValidationMessages = {
  accountTypeRequired: string;
  emailInvalid: string;
  emailRequired: string;
  passwordMinLength: string;
  passwordRequired: string;
};

export function createLoginSchema(messages: LoginValidationMessages) {
  return z.object({
    accountType: z
      .union([
        z.literal(""),
        z.literal("ESTABLISHMENT"),
        z.literal("INDEPENDENT_DOCTOR"),
      ])
      .refine(
        (
          value,
        ): value is "ESTABLISHMENT" | "INDEPENDENT_DOCTOR" => value !== "",
        {
          message: messages.accountTypeRequired,
        },
      ),
    email: z
      .string()
      .transform(normalizeEmail)
      .pipe(
        z
          .string()
          .min(1, messages.emailRequired)
          .email(messages.emailInvalid)
          .max(160, messages.emailInvalid),
      ),
    password: z
      .string()
      .min(1, messages.passwordRequired)
      .min(8, messages.passwordMinLength)
      .max(128, messages.passwordMinLength),
    rememberMe: z.boolean(),
  });
}
