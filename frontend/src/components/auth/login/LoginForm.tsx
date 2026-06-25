"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { RegisterErrorAlert } from "@/components/auth/register/RegisterErrorAlert";
import { useLogin } from "@/features/auth/hooks/use-login";
import { type LoginPayload } from "@/features/auth/types/login.types";
import { type ApiErrorMessages } from "@/lib/api/api-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getLoginValidationMessages,
  type Direction,
  type TranslationFunction,
} from "@/lib/i18n";
import { normalizeEmail } from "@/lib/security";
import { cn } from "@/lib/utils";
import { createLoginSchema } from "@/lib/validations/login.schema";

import { AccountTypeLoginSelector } from "./AccountTypeLoginSelector";
import { PasswordInput } from "../register/PasswordInput";

type LoginFormProps = {
  direction: Direction;
  t: TranslationFunction;
};

const defaultValues = {
  accountType: "" as const,
  email: "",
  password: "",
  rememberMe: false,
};

export function LoginForm({ direction, t }: LoginFormProps) {
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
  const passwordLabels = {
    hidePasswordLabel: t("register.password.hide"),
    hint: t("register.password.hint"),
    showPasswordLabel: t("register.password.show"),
    strengthLabel: t("register.password.strength"),
    strengthLabels: {
      weak: t("register.password.levels.weak"),
      medium: t("register.password.levels.medium"),
      strong: t("register.password.levels.strong"),
    },
  };

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
          className={cn(
            "fixed top-5 z-50 flex max-w-md items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-900 shadow-2xl shadow-sky-950/10",
            direction === "rtl" ? "left-5" : "right-5",
          )}
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{successMessage}</p>
        </div>
      ) : null}

      <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
        {errorMessage ? (
          <RegisterErrorAlert
            details={errorDetails}
            message={errorMessage}
            title={errorTitle}
          />
        ) : null}

        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
            {t("common.brand")}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {t("login.page.title")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("login.page.subtitle")}
          </p>
        </div>

        <AccountTypeLoginSelector
          direction={direction}
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

        <div>
          <Label htmlFor="loginEmail">{t("login.form.emailLabel")}</Label>
          <Input
            id="loginEmail"
            type="email"
            dir={direction}
            autoComplete="email"
            className="mt-2 rounded-xl border-slate-200 bg-white/90 text-start"
            placeholder={t("login.form.emailPlaceholder")}
            aria-invalid={Boolean(errors.email)}
            aria-describedby="loginEmail-error"
            {...register("email")}
          />
          {errors.email?.message ? (
            <p id="loginEmail-error" className="mt-2 text-sm text-red-600">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <PasswordInput
          id="loginPassword"
          label={t("login.form.passwordLabel")}
          direction={direction}
          showStrength={false}
          strengthValue=""
          error={errors.password?.message}
          placeholder={t("login.form.passwordPlaceholder")}
          autoComplete="current-password"
          {...passwordLabels}
          {...register("password")}
        />

        <div className="flex items-center justify-between gap-4 text-sm">
          <label className="flex items-center gap-3 text-slate-700">
            <Checkbox {...register("rememberMe")} />
            <span>{t("login.form.rememberMe")}</span>
          </label>
          <button
            type="button"
            className="font-medium text-cyan-700 transition hover:text-cyan-800"
          >
            {t("login.form.forgotPassword")}
          </button>
        </div>

        <Button
          type="submit"
          size="lg"
          className="h-12 w-full rounded-xl bg-[#0b3b5f] text-white hover:bg-[#092f4d]"
          disabled={isBusy}
        >
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          {isBusy ? t("login.form.loading") : t("login.form.submit")}
        </Button>

        <p className="text-center text-sm text-slate-600">
          <span>{t("login.form.signUpPrompt")}</span>{" "}
          <Link
            href="/register"
            className="font-semibold text-cyan-700 underline-offset-4 hover:underline"
          >
            {t("login.form.signUpLink")}
          </Link>
        </p>
      </form>
    </>
  );
}
