"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { useLogin } from "@/features/auth/hooks/use-login";
import { type LoginPayload } from "@/features/auth/types/login.types";
import { type ApiErrorMessages } from "@/lib/api/api-error";
import {
  getLoginValidationMessages,
  type Direction,
  type TranslationFunction,
} from "@/lib/i18n";
import { normalizeEmail } from "@/lib/security";
import { cn } from "@/lib/utils";
import { createLoginSchema } from "@/lib/validations/login.schema";

import { AccountTypeLoginSelector } from "./AccountTypeLoginSelector";
import styles from "./LoginPage.module.css";

type LoginFormProps = {
  direction: Direction;
  t: TranslationFunction;
};

const defaultValues = {
  accountType: "ESTABLISHMENT" as const,
  email: "",
  password: "",
  rememberMe: false,
};

export function LoginForm({ direction, t }: LoginFormProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const loginValidationMessages = getLoginValidationMessages(t);
  const apiErrorMessages = useMemo<ApiErrorMessages>(
    () => ({
      accountBlocked: t("login.feedback.apiErrors.accountBlocked"),
      addressRequired: t("login.feedback.apiErrors.validation"),
      alertTitle: t("login.feedback.apiErrors.alertTitle"),
      conditionsRequired: t("login.feedback.apiErrors.validation"),
      database: t("login.feedback.apiErrors.generic"),
      emailConflict: t("login.feedback.apiErrors.invalidCredentials"),
      emailInvalid: t("login.feedback.apiErrors.validation"),
      fullNameRequired: t("login.feedback.apiErrors.validation"),
      generic: t("login.feedback.apiErrors.generic"),
      invalidCredentials: t("login.feedback.apiErrors.invalidCredentials"),
      network: t("login.feedback.apiErrors.network"),
      notFound: t("login.feedback.apiErrors.network"),
      passwordMismatch: t("login.feedback.apiErrors.validation"),
      passwordTooShort: t("login.feedback.apiErrors.validation"),
      phoneConflict: t("login.feedback.apiErrors.validation"),
      phoneRequired: t("login.feedback.apiErrors.validation"),
      server: t("login.feedback.apiErrors.generic"),
      specialityRequired: t("login.feedback.apiErrors.validation"),
      validation: t("login.feedback.apiErrors.validation"),
      verificationRequired: t("login.feedback.apiErrors.validation"),
      wilayaRequired: t("login.feedback.apiErrors.validation"),
    }),
    [t],
  );
  const schema = createLoginSchema(loginValidationMessages);
  type LoginSchemaInput = z.input<typeof schema>;
  type LoginSchemaOutput = z.output<typeof schema>;
  const {
    errorDetails,
    errorMessage,
    errorTitle,
    isLoading,
    login,
    reset: resetLoginState,
    successMessage,
  } = useLogin(apiErrorMessages);

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<LoginSchemaInput, unknown, LoginSchemaOutput>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues,
  });

  const isBusy = isLoading || isSubmitting;
  const selectedType = useWatch({ control, name: "accountType" });

  useEffect(() => {
    resetLoginState();
  }, [resetLoginState, selectedType]);

  const onSubmit = async (data: LoginSchemaOutput) => {
    if (isBusy) {
      return;
    }

    try {
      // Frontend validation improves UX, backend validation remains mandatory.
      // Tokens are stored only in secure httpOnly cookies by the backend.
      const payload: LoginPayload = {
        accountType: data.accountType,
        email: normalizeEmail(data.email),
        password: data.password,
      };

      await login(payload);
      reset(defaultValues);
    } catch {
      // normalizeApiError maps backend/network details to safe UI messages.
    }
  };

  return (
    <>
      {successMessage ? (
        <div
          role="status"
          aria-live="polite"
          className={styles.successToast}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
            <path d="m8 12 2.6 2.6L16.5 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p>{successMessage}</p>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        {errorMessage ? (
          <div className={styles.alert} role="alert">
            <span className={styles.alertIcon} aria-hidden="true">!</span>
            <div>
              {errorTitle ? <p className={styles.alertTitle}>{errorTitle}</p> : null}
              <p className={errorTitle ? styles.alertMessageWithTitle : undefined}>
                {errorMessage}
              </p>
              {errorDetails.length > 0 ? (
                <ul className={styles.alertDetails}>
                  {errorDetails.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              ) : null}
            </div>
          </div>
        ) : null}

        <header className={styles.formHeader}>
          <div>
            <p className={styles.eyebrow}>{t("login.form.eyebrow")}</p>
            <h2 className={styles.formTitle}>
            {t("login.page.title")}
            </h2>
            <p className={styles.formDescription}>{t("login.page.subtitle")}</p>
          </div>
          <span className={styles.shieldMark} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 2.5 5 5.3v5.4c0 4.6 2.9 8 7 10.5 4.1-2.5 7-5.9 7-10.5V5.3L12 2.5Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
              <path d="m9.3 11.5 1.8 1.8 3.8-4" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </header>

        <AccountTypeLoginSelector
          error={errors.accountType?.message}
          onSelect={(accountType) =>
            setValue("accountType", accountType, {
              shouldDirty: true,
              shouldTouch: true,
              shouldValidate: true,
            })
          }
          selectedType={selectedType}
          t={t}
        />

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="loginEmail">
            {t("login.form.emailLabel")} <span className={styles.requiredMark}>*</span>
          </label>
          <div className={styles.fieldShell}>
            <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              id="loginEmail"
              type="email"
              dir={direction}
              autoComplete="email"
              className={styles.fieldInput}
              placeholder={t("login.form.emailPlaceholder")}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "loginEmail-error" : undefined}
              {...register("email")}
            />
          </div>
          {errors.email?.message ? (
            <p id="loginEmail-error" className={styles.fieldError}>
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="loginPassword">
            {t("login.form.passwordLabel")} <span className={styles.requiredMark}>*</span>
          </label>
          <div className={styles.fieldShell}>
            <svg className={styles.fieldIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              id="loginPassword"
              type={isPasswordVisible ? "text" : "password"}
              dir={direction}
              autoComplete="current-password"
              className={cn(styles.fieldInput, styles.passwordInput)}
              placeholder={t("login.form.passwordPlaceholder")}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "loginPassword-error" : undefined}
              maxLength={128}
              {...register("password")}
            />
            <button
              type="button"
              className={styles.fieldAction}
              onClick={() => setIsPasswordVisible((visible) => !visible)}
              aria-label={
                isPasswordVisible
                  ? t("register.password.hide")
                  : t("register.password.show")
              }
            >
              {isPasswordVisible ? (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 3l18 18M10.7 5.2c.4-.1.8-.2 1.3-.2 7 0 10 7 10 7a17 17 0 0 1-2.2 3.2M6.2 6.2C3.5 8.1 2 12 2 12s3 7 10 7c1.3 0 2.5-.2 3.5-.7M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              )}
            </button>
          </div>
          {errors.password?.message ? (
            <p id="loginPassword-error" className={styles.fieldError}>
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <div className={styles.formMeta}>
          <label className={styles.remember}>
            <input type="checkbox" {...register("rememberMe")} />
            <span>{t("login.form.rememberMe")}</span>
          </label>
          <button
            type="button"
            className={styles.forgotButton}
          >
            {t("login.form.forgotPassword")}
          </button>
        </div>

        <button
          type="submit"
          className={styles.submitButton}
          disabled={isBusy}
        >
          {isBusy ? (
            <span className={styles.spinner} aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {isBusy ? t("login.form.loading") : t("login.form.submit")}
        </button>

        <div className={styles.ssoDivider}>
          <span>{t("login.form.ssoComingSoon")}</span>
        </div>

        <p className={styles.signupPrompt}>
          <span>{t("login.form.signUpPrompt")}</span>{" "}
          <Link
            href="/register"
            className={styles.signupLink}
          >
            {t("login.form.signUpLink")}
          </Link>
        </p>
      </form>
    </>
  );
}
