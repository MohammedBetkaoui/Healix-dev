"use client";

import { type ReactNode, type Ref } from "react";

import { type PasswordResetErrorKind } from "@/features/auth/password-reset";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import loginStyles from "../login/LoginPage.module.css";
import styles from "./PasswordRecovery.module.css";

export function recoveryErrorMessage(
  kind: PasswordResetErrorKind,
  t: TranslationFunction,
): string {
  switch (kind) {
    case "tooManyRequests":
      return t("passwordReset.errors.tooManyRequests");
    case "network":
      return t("passwordReset.errors.network");
    case "passwordTooShort":
      return t("register.errors.passwordTooShort");
    case "passwordMismatch":
      return t("register.errors.passwordMismatch");
    default:
      return t("passwordReset.errors.generic");
  }
}

// Focusable (tabIndex -1) so that the form can move the focus to it.
export function RecoveryErrorAlert({
  message,
  ref,
  title,
}: {
  message: string;
  ref?: Ref<HTMLDivElement>;
  title: string;
}) {
  return (
    <div ref={ref} tabIndex={-1} role="alert" className={cn(loginStyles.alert, styles.focusTarget)}>
      <span className={loginStyles.alertIcon} aria-hidden="true">!</span>
      <div>
        <p className={loginStyles.alertTitle}>{title}</p>
        <p className={loginStyles.alertMessageWithTitle}>{message}</p>
      </div>
    </div>
  );
}

export function RecoveryNotice({
  children,
  ref,
  title,
  tone = "info",
}: {
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
  title: string;
  tone?: "info" | "warning";
}) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className={cn(
        styles.notice,
        styles.focusTarget,
        tone === "warning" && styles.noticeWarning,
      )}
    >
      <p className={styles.noticeTitle}>{title}</p>
      {children}
    </div>
  );
}
