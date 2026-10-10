"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { type z } from "zod";

import { PasswordInput } from "@/components/auth/register/PasswordInput";
import { resetPassword } from "@/features/auth/api/password-reset.api";
import {
  classifyPasswordResetError,
  type PasswordResetErrorKind,
  readResetToken,
  urlWithoutToken,
} from "@/features/auth/password-reset";
import {
  type Direction,
  getRegisterValidationMessages,
  type TranslationFunction,
} from "@/lib/i18n";
import { createResetPasswordSchema } from "@/lib/validations/password-reset.schema";

import loginStyles from "../login/LoginPage.module.css";
import styles from "./PasswordRecovery.module.css";
import {
  RecoveryErrorAlert,
  recoveryErrorMessage,
  RecoveryNotice,
} from "./RecoveryNotices";

type ResetPasswordFormProps = {
  direction: Direction;
  t: TranslationFunction;
};

type Stage = "form" | "invalid" | "success";

const REDIRECT_AFTER_SUCCESS_MS = 3_000;

export function ResetPasswordForm({ direction, t }: ResetPasswordFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read once, then kept in memory only: the address is cleaned right after,
  // and useSearchParams follows that change.
  const [token, setToken] = useState(() => readResetToken(searchParams.toString()));
  const [stage, setStage] = useState<Stage>(() => (token ? "form" : "invalid"));
  const [errorKind, setErrorKind] = useState<PasswordResetErrorKind | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const validationMessages = useMemo(() => getRegisterValidationMessages(t), [t]);
  const schema = useMemo(
    () => createResetPasswordSchema(validationMessages),
    [validationMessages],
  );
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    defaultValues: { confirmPassword: "", password: "" },
    mode: "onBlur",
    resolver: zodResolver(schema),
  });
  const passwordValue = useWatch({ control, name: "password" }) ?? "";
  const mutation = useMutation({ mutationFn: resetPassword });
  const isBusy = isSubmitting || mutation.isPending;

  // The token leaves the address bar and the history as soon as it is read.
  useEffect(() => {
    const { hash, pathname, search } = window.location;

    if (new URLSearchParams(search).has("token")) {
      window.history.replaceState(null, "", urlWithoutToken(pathname, search, hash));
    }
  }, []);

  // The focus follows the message that replaces or tops the form.
  useEffect(() => {
    if (stage !== "form") noticeRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (errorKind) alertRef.current?.focus();
  }, [errorKind]);

  useEffect(() => {
    if (stage !== "success") return;
    const timeoutId = window.setTimeout(() => router.replace("/login"), REDIRECT_AFTER_SUCCESS_MS);
    return () => window.clearTimeout(timeoutId);
  }, [router, stage]);

  const onSubmit = async (data: z.output<typeof schema>) => {
    if (isBusy || !token) return;
    setErrorKind(null);

    try {
      // Trimmed like at registration.
      await mutation.mutateAsync({
        confirmPassword: data.confirmPassword.trim(),
        password: data.password.trim(),
        token,
      });
      setToken(null);
      reset();
      setStage("success");
    } catch (error) {
      const kind = classifyPasswordResetError(error);

      if (kind === "invalidToken") {
        setToken(null);
        setStage("invalid");
        return;
      }

      setErrorKind(kind);
    }
  };

  const passwordLabels = {
    hidePasswordLabel: t("register.password.hide"),
    hint: t("register.password.hint"),
    showPasswordLabel: t("register.password.show"),
    strengthLabel: t("register.password.strength"),
    strengthLabels: {
      medium: t("register.password.levels.medium"),
      strong: t("register.password.levels.strong"),
      weak: t("register.password.levels.weak"),
    },
  };

  const header = (
    <header className={loginStyles.formHeader}>
      <div>
        <p className={loginStyles.eyebrow}>{t("passwordReset.reset.eyebrow")}</p>
        <h2 className={loginStyles.formTitle}>{t("passwordReset.reset.title")}</h2>
        {stage === "form" ? (
          <p className={loginStyles.formDescription}>{t("passwordReset.reset.subtitle")}</p>
        ) : null}
      </div>
    </header>
  );

  if (stage === "invalid") {
    return (
      <div className={loginStyles.form}>
        {header}
        <RecoveryNotice ref={noticeRef} title={t("passwordReset.reset.invalidTitle")} tone="warning">
          <p>{t("passwordReset.reset.invalid")}</p>
        </RecoveryNotice>
        <div className={styles.actions}>
          <Link href="/forgot-password" className={loginStyles.submitButton}>
            {t("passwordReset.reset.requestNew")}
          </Link>
        </div>
        <p className={loginStyles.signupPrompt}>
          <Link href="/login" className={loginStyles.signupLink}>
            {t("passwordReset.forgot.backToLogin")}
          </Link>
        </p>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div className={loginStyles.form}>
        {header}
        <RecoveryNotice ref={noticeRef} title={t("passwordReset.reset.successTitle")}>
          <p>{t("passwordReset.reset.success")}</p>
        </RecoveryNotice>
        <div className={styles.actions}>
          <Link href="/login" replace className={loginStyles.submitButton}>
            {t("passwordReset.reset.goToLogin")}
          </Link>
        </div>
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

      <div className={styles.registerTokens}>
        <PasswordInput
          id="resetPassword"
          label={t("passwordReset.reset.passwordLabel")}
          direction={direction}
          strengthValue={passwordValue}
          error={errors.password?.message}
          aria-invalid={Boolean(errors.password)}
          required
          {...passwordLabels}
          {...register("password")}
        />

        <PasswordInput
          id="resetConfirmPassword"
          label={t("passwordReset.reset.confirmLabel")}
          direction={direction}
          showStrength={false}
          error={errors.confirmPassword?.message}
          aria-invalid={Boolean(errors.confirmPassword)}
          required
          {...passwordLabels}
          {...register("confirmPassword")}
        />
      </div>

      <button type="submit" className={loginStyles.submitButton} disabled={isBusy}>
        {isBusy ? (
          <span className={loginStyles.spinner} aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {isBusy ? t("passwordReset.reset.loading") : t("passwordReset.reset.submit")}
      </button>

      <p className={loginStyles.signupPrompt}>
        <Link href="/login" className={loginStyles.signupLink}>
          {t("passwordReset.forgot.backToLogin")}
        </Link>
      </p>
    </form>
  );
}
