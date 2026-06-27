"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { RegisterErrorAlert } from "@/components/auth/register/RegisterErrorAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminLogin } from "@/features/admin-auth/hooks/use-admin-login";
import { type ApiErrorMessages } from "@/lib/api/api-error";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { normalizeEmail } from "@/lib/security";
import { cn } from "@/lib/utils";
import { createAdminLoginSchema } from "@/lib/validations/admin-login.schema";

type AdminLoginFormProps = {
  direction: Direction;
  t: TranslationFunction;
};

const defaultValues = {
  email: "",
  password: "",
};

export function AdminLoginForm({ direction, t }: AdminLoginFormProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const schema = createAdminLoginSchema({
    emailInvalid: t("adminAuth.errors.emailInvalid"),
    emailRequired: t("adminAuth.errors.emailRequired"),
    passwordMinLength: t("adminAuth.errors.passwordMinLength"),
    passwordRequired: t("adminAuth.errors.passwordRequired"),
  });
  type AdminLoginSchemaInput = z.input<typeof schema>;
  type AdminLoginSchemaOutput = z.output<typeof schema>;

  const apiErrorMessages = useMemo<ApiErrorMessages>(
    () => ({
      accountBlocked: t("adminAuth.errors.invalidCredentials"),
      addressRequired: t("adminAuth.errors.generic"),
      alertTitle: t("adminAuth.notice.title"),
      conditionsRequired: t("adminAuth.errors.generic"),
      database: t("adminAuth.errors.generic"),
      emailConflict: t("adminAuth.errors.invalidCredentials"),
      emailInvalid: t("adminAuth.errors.emailInvalid"),
      fullNameRequired: t("adminAuth.errors.generic"),
      generic: t("adminAuth.errors.generic"),
      invalidCredentials: t("adminAuth.errors.invalidCredentials"),
      network: t("adminAuth.errors.network"),
      notFound: t("adminAuth.errors.network"),
      passwordMismatch: t("adminAuth.errors.generic"),
      passwordTooShort: t("adminAuth.errors.passwordMinLength"),
      phoneConflict: t("adminAuth.errors.generic"),
      phoneRequired: t("adminAuth.errors.generic"),
      server: t("adminAuth.errors.generic"),
      specialityRequired: t("adminAuth.errors.generic"),
      validation: t("adminAuth.errors.generic"),
      verificationRequired: t("adminAuth.errors.generic"),
      wilayaRequired: t("adminAuth.errors.generic"),
    }),
    [t],
  );
  const {
    errorDetails,
    errorMessage,
    errorTitle,
    isLoading,
    login,
    successMessage,
  } = useAdminLogin(apiErrorMessages, t("adminAuth.success"));
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<AdminLoginSchemaInput, unknown, AdminLoginSchemaOutput>({
    defaultValues,
    mode: "onBlur",
    resolver: zodResolver(schema),
  });
  const isBusy = isLoading || isSubmitting;

  const onSubmit = async (data: AdminLoginSchemaOutput) => {
    if (isBusy) {
      return;
    }

    try {
      // Backend validation remains mandatory.
      // Authentication tokens are stored only in secure httpOnly cookies.
      await login({
        email: normalizeEmail(data.email),
        password: data.password,
      });
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
            HealixDZ
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            {t("adminAuth.hero.title")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t("adminAuth.hero.subtitle")}
          </p>
        </div>

        <div>
          <Label htmlFor="adminEmail">{t("adminAuth.form.emailLabel")}</Label>
          <Input
            id="adminEmail"
            type="email"
            dir={direction}
            autoComplete="email"
            className="mt-2 rounded-xl border-slate-200 bg-white/90 text-start"
            placeholder={t("adminAuth.form.emailPlaceholder")}
            aria-invalid={Boolean(errors.email)}
            aria-describedby="adminEmail-error"
            {...register("email")}
          />
          {errors.email?.message ? (
            <p id="adminEmail-error" className="mt-2 text-sm text-red-600">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="adminPassword">
            {t("adminAuth.form.passwordLabel")}
          </Label>
          <div className="relative mt-2">
            <Input
              id="adminPassword"
              type={passwordVisible ? "text" : "password"}
              dir={direction}
              autoComplete="current-password"
              className="rounded-xl border-slate-200 bg-white/90 pe-12 text-start"
              placeholder={t("adminAuth.form.passwordPlaceholder")}
              aria-invalid={Boolean(errors.password)}
              aria-describedby="adminPassword-error"
              maxLength={128}
              {...register("password")}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={
                passwordVisible
                  ? t("adminAuth.form.hidePassword")
                  : t("adminAuth.form.showPassword")
              }
              className="absolute end-1 top-1/2 h-9 w-9 -translate-y-1/2 text-slate-500 hover:bg-slate-100"
              onClick={() => setPasswordVisible((current) => !current)}
            >
              {passwordVisible ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          {errors.password?.message ? (
            <p id="adminPassword-error" className="mt-2 text-sm text-red-600">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          size="lg"
          className="h-12 w-full rounded-xl bg-[#061f35] text-white hover:bg-[#092f4d]"
          disabled={isBusy}
        >
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          {isBusy ? t("adminAuth.form.loading") : t("adminAuth.form.submit")}
        </Button>
      </form>
    </>
  );
}
