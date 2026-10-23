import { z } from "zod";

import { type TranslationFunction } from "@/lib/i18n";
import { passwordSchema, type RegisterValidationMessages } from "@/lib/validations/register.schema";

import { type ChangePasswordPayload, type ChangePasswordResult } from "../types/account.types";
import { classifyAccountError } from "./account-errors";

export type PasswordFormValues = {
  confirmPassword: string;
  currentPassword: string;
  newPassword: string;
};

export type PasswordFormErrors = Partial<Record<keyof PasswordFormValues, string>>;

export const emptyPasswordForm: PasswordFormValues = { confirmPassword: "", currentPassword: "", newPassword: "" };

// The new password follows the rule of the registration and of the reset
// (`passwordSchema`); the confirmation only has to be the same.
export function createChangePasswordSchema(messages: RegisterValidationMessages, requiredMessage: string) {
  return z
    .object({
      confirmPassword: z.string(),
      currentPassword: z.string().min(1, requiredMessage),
      newPassword: passwordSchema(messages),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: messages.passwordMismatch,
      path: ["confirmPassword"],
    });
}

export type PasswordSubmitOutcome =
  | { status: "invalid"; errors: PasswordFormErrors }
  /** The server refused: its message sits next to the field it is about, else on top. */
  | { status: "failed"; errors: PasswordFormErrors; message: string | null }
  | { status: "success"; result: ChangePasswordResult };

// Everything the password form does when it is submitted, apart from drawing.
// Both passwords are trimmed like the backend does, so what is checked here is
// what is checked there.
export async function submitPasswordChange(
  values: PasswordFormValues,
  deps: {
    messages: RegisterValidationMessages;
    send: (payload: ChangePasswordPayload) => Promise<ChangePasswordResult>;
    t: TranslationFunction;
  },
): Promise<PasswordSubmitOutcome> {
  const trimmed: PasswordFormValues = {
    confirmPassword: values.confirmPassword.trim(),
    currentPassword: values.currentPassword.trim(),
    newPassword: values.newPassword.trim(),
  };
  const parsed = createChangePasswordSchema(deps.messages, deps.t("account.common.required")).safeParse(trimmed);

  if (!parsed.success) {
    const errors: PasswordFormErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof PasswordFormValues;
      errors[field] ??= issue.message;
    }
    return { errors, status: "invalid" };
  }

  try {
    // The confirmation stays in the form.
    const result = await deps.send({ currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword });
    return { result, status: "success" };
  } catch (error) {
    const { field, key } = classifyAccountError(error);
    const message = deps.t(`account.errors.${key}`);
    const target = field as keyof PasswordFormValues | undefined;
    return target && target in trimmed
      ? { errors: { [target]: message }, message: null, status: "failed" }
      : { errors: {}, message, status: "failed" };
  }
}
