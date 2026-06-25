"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { type FocusEvent, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRegisterEstablishment } from "@/features/auth/hooks/use-register-establishment";
import { type EstablishmentRegisterPayload } from "@/features/auth/types/register.types";
import { type ApiErrorMessages } from "@/lib/api/api-error";
import { getRegisterValidationMessages } from "@/lib/i18n";
import { sanitizeTextInput } from "@/lib/security";
import { cn } from "@/lib/utils";
import { createEstablishmentRegisterSchema } from "@/lib/validations/register.schema";
import {
  ALGERIAN_WILAYAS,
  ESTABLISHMENT_TYPE_OPTIONS,
  type EstablishmentRegisterFormValues,
  type EstablishmentRegisterInput,
} from "@/types/auth";

import { FormErrorMessage } from "./FormErrorMessage";
import { PasswordInput } from "./PasswordInput";
import { RegisterErrorAlert } from "./RegisterErrorAlert";
import { type RegisterI18nProps } from "./RegisterPage";
import { RegisterSuccessCard } from "./RegisterSuccessCard";

const defaultValues: EstablishmentRegisterFormValues = {
  accountType: "ESTABLISHMENT",
  establishmentName: "",
  establishmentType: "",
  wilaya: "",
  address: "",
  professionalEmail: "",
  phone: "",
  managerFullName: "",
  password: "",
  confirmPassword: "",
  acceptTerms: false,
  acceptVerification: false,
};

function toEstablishmentPayload(
  data: EstablishmentRegisterInput,
): EstablishmentRegisterPayload {
  return {
    establishmentName: sanitizeTextInput(data.establishmentName),
    establishmentType: data.establishmentType,
    wilaya: sanitizeTextInput(data.wilaya),
    address: sanitizeTextInput(data.address),
    professionalEmail: sanitizeTextInput(data.professionalEmail).toLowerCase(),
    phone: sanitizeTextInput(data.phone),
    managerFullName: sanitizeTextInput(data.managerFullName),
    password: data.password.trim(),
    confirmPassword: data.confirmPassword.trim(),
    acceptTerms: data.acceptTerms,
    acceptVerification: data.acceptVerification,
  };
}

export function EstablishmentRegisterForm({
  direction,
  isRtl,
  locale,
  t,
}: RegisterI18nProps) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const validationMessages = useMemo(() => getRegisterValidationMessages(t), [t]);
  const apiErrorMessages = useMemo<ApiErrorMessages>(
    () => ({
      addressRequired: t("register.feedback.apiErrors.addressRequired"),
      alertTitle: t("register.feedback.apiErrors.alertTitle"),
      conditionsRequired: t("register.feedback.apiErrors.conditionsRequired"),
      database: t("register.feedback.apiErrors.database"),
      emailConflict: t("register.feedback.apiErrors.emailConflict"),
      emailInvalid: t("register.feedback.apiErrors.emailInvalid"),
      fullNameRequired: t("register.feedback.apiErrors.fullNameRequired"),
      generic: t("register.feedback.apiErrors.generic"),
      network: t("register.feedback.apiErrors.network"),
      notFound: t("register.feedback.apiErrors.notFound"),
      passwordMismatch: t("register.feedback.apiErrors.passwordMismatch"),
      passwordTooShort: t("register.feedback.apiErrors.passwordTooShort"),
      phoneConflict: t("register.feedback.apiErrors.phoneConflict"),
      phoneRequired: t("register.feedback.apiErrors.phoneRequired"),
      server: t("register.feedback.apiErrors.server"),
      specialityRequired: t("register.feedback.apiErrors.specialityRequired"),
      validation: t("register.feedback.apiErrors.validation"),
      verificationRequired: t("register.feedback.apiErrors.verificationRequired"),
      wilayaRequired: t("register.feedback.apiErrors.wilayaRequired"),
    }),
    [t],
  );
  const schema = useMemo(
    () => createEstablishmentRegisterSchema(validationMessages),
    [validationMessages],
  );
  const {
    data: registrationResponse,
    errorDetails: registrationErrorDetails,
    errorMessage: registrationErrorMessage,
    errorTitle: registrationErrorTitle,
    isLoading,
    isSuccess,
    registerEstablishment,
    reset: resetRegistration,
  } = useRegisterEstablishment(apiErrorMessages);

  const {
    register,
    handleSubmit,
    control,
    reset,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<
    EstablishmentRegisterFormValues,
    unknown,
    EstablishmentRegisterInput
  >({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues,
  });

  const isBusy = isLoading || isSubmitting;
  const hasErrors = Object.keys(errors).length > 0;
  const passwordValue = useWatch({ control, name: "password" }) ?? "";
  const confirmPasswordValue =
    useWatch({ control, name: "confirmPassword" }) ?? "";
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
    if (hasErrors) {
      void trigger();
    }
  }, [hasErrors, locale, trigger]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage(null);
    }, 4500);

    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  const sanitizeOnBlur = (
    event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    event.currentTarget.value = sanitizeTextInput(event.currentTarget.value);
  };

  const onSubmit = async (data: EstablishmentRegisterInput) => {
    if (isBusy) {
      return;
    }

    resetRegistration();
    setToastMessage(null);

    try {
      // Le backend devra refaire toutes les validations, meme si le frontend les applique deja.
      // Rate limiting must be enforced on backend.
      const antiBotToken: string | null = null;
      void antiBotToken;

      await registerEstablishment(toEstablishmentPayload(data));
      reset(defaultValues);
      setToastMessage(t("register.feedback.success"));
    } catch {
      // normalizeApiError maps backend/network details to safe UI messages.
    }
  };

  return (
    <>
      {toastMessage ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "fixed top-5 z-50 flex max-w-md items-start gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-900 shadow-2xl shadow-sky-950/10",
            direction === "rtl" ? "left-5" : "right-5",
          )}
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{toastMessage}</p>
        </div>
      ) : null}

      {isSuccess && registrationResponse ? (
        <RegisterSuccessCard
          direction={direction}
          isRtl={isRtl}
          locale={locale}
          t={t}
        />
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
          {registrationErrorMessage ? (
            <RegisterErrorAlert
              details={registrationErrorDetails}
              message={registrationErrorMessage}
              title={registrationErrorTitle}
            />
          ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="establishmentName">
            {t("register.forms.establishment.fields.establishmentName.label")}
          </Label>
          <Input
            id="establishmentName"
            className="mt-2 text-start"
            dir={direction}
            placeholder={t(
              "register.forms.establishment.fields.establishmentName.placeholder",
            )}
            autoComplete="organization"
            maxLength={120}
            aria-invalid={Boolean(errors.establishmentName)}
            aria-describedby="establishmentName-error"
            {...register("establishmentName", { onBlur: sanitizeOnBlur })}
          />
          <FormErrorMessage
            id="establishmentName-error"
            message={errors.establishmentName?.message}
          />
        </div>

        <div>
          <Label htmlFor="establishmentType">
            {t("register.forms.establishment.fields.establishmentType.label")}
          </Label>
          <Select
            id="establishmentType"
            className="mt-2 text-start"
            dir={direction}
            aria-invalid={Boolean(errors.establishmentType)}
            aria-describedby="establishmentType-error"
            {...register("establishmentType")}
          >
            <option value="">{t("register.forms.selectPlaceholder")}</option>
            {ESTABLISHMENT_TYPE_OPTIONS.map(({ value, translationKey }) => (
              <option key={value} value={value}>
                {t(`register.establishmentTypes.${translationKey}`)}
              </option>
            ))}
          </Select>
          <FormErrorMessage
            id="establishmentType-error"
            message={errors.establishmentType?.message}
          />
        </div>

        <div>
          <Label htmlFor="establishmentWilaya">
            {t("register.forms.establishment.fields.wilaya.label")}
          </Label>
          <Select
            id="establishmentWilaya"
            className="mt-2 text-start"
            dir={direction}
            aria-invalid={Boolean(errors.wilaya)}
            aria-describedby="establishmentWilaya-error"
            {...register("wilaya")}
          >
            <option value="">{t("register.forms.selectPlaceholder")}</option>
            {ALGERIAN_WILAYAS.map((wilaya) => (
              <option key={wilaya} value={wilaya}>
                {wilaya}
              </option>
            ))}
          </Select>
          <FormErrorMessage
            id="establishmentWilaya-error"
            message={errors.wilaya?.message}
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="address">
            {t("register.forms.establishment.fields.address.label")}
          </Label>
          <Textarea
            id="address"
            className="mt-2 text-start"
            dir={direction}
            placeholder={t(
              "register.forms.establishment.fields.address.placeholder",
            )}
            autoComplete="street-address"
            maxLength={180}
            aria-invalid={Boolean(errors.address)}
            aria-describedby="address-error"
            {...register("address", { onBlur: sanitizeOnBlur })}
          />
          <FormErrorMessage id="address-error" message={errors.address?.message} />
        </div>

        <div>
          <Label htmlFor="professionalEmail">
            {t("register.forms.establishment.fields.professionalEmail.label")}
          </Label>
          <Input
            id="professionalEmail"
            type="email"
            className="mt-2 text-start"
            dir={direction}
            placeholder={t(
              "register.forms.establishment.fields.professionalEmail.placeholder",
            )}
            autoComplete="email"
            maxLength={160}
            aria-invalid={Boolean(errors.professionalEmail)}
            aria-describedby="professionalEmail-error"
            {...register("professionalEmail", { onBlur: sanitizeOnBlur })}
          />
          <FormErrorMessage
            id="professionalEmail-error"
            message={errors.professionalEmail?.message}
          />
        </div>

        <div>
          <Label htmlFor="establishmentPhone">
            {t("register.forms.establishment.fields.phone.label")}
          </Label>
          <Input
            id="establishmentPhone"
            type="tel"
            className="mt-2 text-start"
            dir={direction}
            placeholder={t(
              "register.forms.establishment.fields.phone.placeholder",
            )}
            autoComplete="tel"
            inputMode="tel"
            maxLength={24}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby="establishmentPhone-error"
            {...register("phone", { onBlur: sanitizeOnBlur })}
          />
          <FormErrorMessage
            id="establishmentPhone-error"
            message={errors.phone?.message}
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="managerFullName">
            {t("register.forms.establishment.fields.managerFullName.label")}
          </Label>
          <Input
            id="managerFullName"
            className="mt-2 text-start"
            dir={direction}
            placeholder={t(
              "register.forms.establishment.fields.managerFullName.placeholder",
            )}
            autoComplete="name"
            maxLength={120}
            aria-invalid={Boolean(errors.managerFullName)}
            aria-describedby="managerFullName-error"
            {...register("managerFullName", { onBlur: sanitizeOnBlur })}
          />
          <FormErrorMessage
            id="managerFullName-error"
            message={errors.managerFullName?.message}
          />
        </div>

        <PasswordInput
          id="establishmentPassword"
          label={t("register.forms.establishment.fields.password.label")}
          direction={direction}
          strengthValue={passwordValue}
          error={errors.password?.message}
          aria-invalid={Boolean(errors.password)}
          {...passwordLabels}
          {...register("password")}
        />

        <PasswordInput
          id="establishmentConfirmPassword"
          label={t("register.forms.establishment.fields.confirmPassword.label")}
          direction={direction}
          strengthValue={confirmPasswordValue}
          error={errors.confirmPassword?.message}
          aria-invalid={Boolean(errors.confirmPassword)}
          {...passwordLabels}
          {...register("confirmPassword")}
        />
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-white/75 p-4">
        <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
          <Checkbox
            aria-invalid={Boolean(errors.acceptTerms)}
            aria-describedby="establishmentTerms-error"
            {...register("acceptTerms")}
          />
          <span>{t("register.forms.terms.acceptTerms")}</span>
        </label>
        <FormErrorMessage
          id="establishmentTerms-error"
          message={errors.acceptTerms?.message}
        />

        <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
          <Checkbox
            aria-invalid={Boolean(errors.acceptVerification)}
            aria-describedby="establishmentVerification-error"
            {...register("acceptVerification")}
          />
          <span>{t("register.forms.terms.acceptVerification")}</span>
        </label>
        <FormErrorMessage
          id="establishmentVerification-error"
          message={errors.acceptVerification?.message}
        />
      </div>

      <div>
        <Button type="submit" size="lg" className="w-full" disabled={isBusy}>
          {isBusy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          {isBusy
            ? t("register.forms.establishment.loading")
            : t("register.forms.establishment.submit")}
        </Button>
        <p className="mt-4 text-center text-sm text-slate-600">
          <span>{t("register.forms.signInPrompt")}</span>{" "}
          <a
            href="/login"
            className={cn(
              "font-semibold text-cyan-700 underline-offset-4 hover:underline",
              direction === "rtl" && "inline-block",
            )}
          >
            {t("register.forms.signInLink")}
          </a>
        </p>
      </div>
        </form>
      )}
    </>
  );
}
