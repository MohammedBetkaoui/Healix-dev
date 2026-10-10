"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { type z } from "zod";

import { requestPasswordReset } from "@/features/auth/api/password-reset.api";
import {
  classifyPasswordResetError,
  type PasswordResetErrorKind,
} from "@/features/auth/password-reset";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { createForgotPasswordSchema } from "@/lib/validations/password-reset.schema";

import loginStyles from "../login/LoginPage.module.css";
import styles from "./PasswordRecovery.module.css";
import {
  RecoveryErrorAlert,
  recoveryErrorMessage,
  RecoveryNotice,
} from "./RecoveryNotices";

type ForgotPasswordFormProps = {
  direction: Direction;
  t: TranslationFunction;
};

export function ForgotPasswordForm({ direction, t }: ForgotPasswordFormProps) {
  const [isSent, setIsSent] = useState(false);
  const [errorKind, setErrorKind] = useState<PasswordResetErrorKind | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const schema = useMemo(
    () =>
      createForgotPasswordSchema({
        emailInvalid: t("login.errors.emailInvalid"),
        emailRequired: t("login.errors.emailRequired"),
      }),
    [t],
  );
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    defaultValues: { email: "" },
    mode: "onBlur",
    resolver: zodResolver(schema),
  });
  const mutation = useMutation({ mutationFn: requestPasswordReset });
  const isBusy = isSubmitting || mutation.isPending;

  // The focus follows the message that replaces or tops the form.
  useEffect(() => {
    if (isSent) noticeRef.current?.focus();
  }, [isSent]);

  useEffect(() => {
    if (errorKind) alertRef.current?.focus();
  }, [errorKind]);

  const onSubmit = async ({ email }: z.output<typeof schema>) => {
    if (isBusy) return;
    setErrorKind(null);

    try {
      await mutation.mutateAsync(email);
      // Whatever the address, the same confirmation.
      setIsSent(true);
    } catch (error) {
      setErrorKind(classifyPasswordResetError(error));
    }
  };

  const header = (
    <header className={loginStyles.formHeader}>
      <div>
        <p className={loginStyles.eyebrow}>{t("passwordReset.forgot.eyebrow")}</p>
        <h2 className={loginStyles.formTitle}>{t("passwordReset.forgot.title")}</h2>
        {isSent ? null : (
          <p className={loginStyles.formDescription}>{t("passwordReset.forgot.subtitle")}</p>
        )}
      </div>
    </header>
  );

  const backToLogin = (
    <p className={loginStyles.signupPrompt}>
      <Link href="/login" className={loginStyles.signupLink}>
        {t("passwordReset.forgot.backToLogin")}
      </Link>
    </p>
  );

  if (isSent) {
    return (
      <div className={loginStyles.form}>
        {header}
        <RecoveryNotice ref={noticeRef} title={t("passwordReset.forgot.sentTitle")}>
          <p>{t("passwordReset.forgot.sent")}</p>
          <p className={styles.noticeHint}>{t("passwordReset.forgot.sentHint")}</p>
        </RecoveryNotice>
        {backToLogin}
      </div>
    );
  }

  return (
    <form className={loginStyles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      {header}

      {errorKind ? (
        <RecoveryErrorAlert
          ref={alertRef}
          message={recoveryErrorMessage(errorKind, t)}
          title={t("passwordReset.errors.alertTitle")}
        />
      ) : null}

      <div className={loginStyles.fieldGroup}>
        <label className={loginStyles.fieldLabel} htmlFor="forgotEmail">
          {t("passwordReset.forgot.emailLabel")}{" "}
          <span className={loginStyles.requiredMark} aria-hidden="true">*</span>
        </label>
        <div className={loginStyles.fieldShell}>
          <svg className={loginStyles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <input
            id="forgotEmail"
            type="email"
            dir={direction}
            autoComplete="email"
            required
            maxLength={191}
            className={loginStyles.fieldInput}
            placeholder={t("passwordReset.forgot.emailPlaceholder")}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "forgotEmail-error" : undefined}
            {...register("email")}
          />
        </div>
        {errors.email?.message ? (
          <p id="forgotEmail-error" className={loginStyles.fieldError}>
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <button type="submit" className={loginStyles.submitButton} disabled={isBusy}>
        {isBusy ? (
          <span className={loginStyles.spinner} aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {isBusy ? t("passwordReset.forgot.loading") : t("passwordReset.forgot.submit")}
      </button>

      {backToLogin}
    </form>
  );
}
