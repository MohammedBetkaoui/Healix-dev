import { z } from "zod";

export type AdminLoginValidationMessages = {
  emailInvalid: string;
  emailRequired: string;
  passwordMinLength: string;
  passwordRequired: string;
};

export function createAdminLoginSchema(
  messages: AdminLoginValidationMessages,
) {
  return z.object({
    email: z
      .string()
      .trim()
      .min(1, messages.emailRequired)
      .email(messages.emailInvalid)
      .max(160, messages.emailInvalid),
    password: z
      .string()
      .min(1, messages.passwordRequired)
      .min(8, messages.passwordMinLength)
      .max(128, messages.passwordMinLength),
  });
}
