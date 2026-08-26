"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type FocusEvent, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRegisterIndependentDoctor } from "@/features/auth/hooks/use-register-independent-doctor";
import { type IndependentDoctorRegisterPayload } from "@/features/auth/types/register.types";
import { type ApiErrorMessages } from "@/lib/api/api-error";
import { getRegisterValidationMessages } from "@/lib/i18n";
import {
  normalizeEmail,
  sanitizePhone,
  sanitizeTextInput,
} from "@/lib/security";
import { cn } from "@/lib/utils";
import { createIndependentDoctorRegisterSchema } from "@/lib/validations/register.schema";
import {
  ALGERIAN_WILAYAS,
  type IndependentDoctorRegisterFormValues,
  type IndependentDoctorRegisterInput,
} from "@/types/auth";

import { FormErrorMessage } from "./FormErrorMessage";
import { PasswordInput } from "./PasswordInput";
import { RegisterErrorAlert } from "./RegisterErrorAlert";
import { type RegisterI18nProps } from "./RegisterPage";
import styles from "./RegisterPage.module.css";
import { RegisterSuccessCard } from "./RegisterSuccessCard";

const defaultValues: IndependentDoctorRegisterFormValues = {
  accountType: "INDEPENDENT_DOCTOR",
  fullName: "",
  speciality: "",
  wilaya: "",
  professionalAddress: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  acceptTerms: false,
  acceptVerification: false,
};

function toIndependentDoctorPayload(
  data: IndependentDoctorRegisterInput,
): IndependentDoctorRegisterPayload {
  return {
    fullName: sanitizeTextInput(data.fullName),
    speciality: sanitizeTextInput(data.speciality),
    wilaya: sanitizeTextInput(data.wilaya),
    professionalAddress: sanitizeTextInput(data.professionalAddress),
    email: normalizeEmail(data.email),
    phone: sanitizePhone(data.phone),
    password: data.password.trim(),
    confirmPassword: data.confirmPassword.trim(),
    acceptTerms: data.acceptTerms,
    acceptVerification: data.acceptVerification,
  };
}

export function IndependentDoctorRegisterForm({
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
    () => createIndependentDoctorRegisterSchema(validationMessages),
    [validationMessages],
  );
  const {
    data: registrationResponse,
    errorDetails: registrationErrorDetails,
    errorMessage: registrationErrorMessage,
    errorTitle: registrationErrorTitle,
    isLoading,
    isSuccess,
    registerIndependentDoctor,
    reset: resetRegistration,
  } = useRegisterIndependentDoctor(apiErrorMessages);

  const {
    register,
    handleSubmit,
    control,
    reset,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<
    IndependentDoctorRegisterFormValues,
    unknown,
    IndependentDoctorRegisterInput
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

  const normalizeEmailOnBlur = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.value = normalizeEmail(event.currentTarget.value);
  };

  const sanitizePhoneOnBlur = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.value = sanitizePhone(event.currentTarget.value);
  };

  const onSubmit = async (data: IndependentDoctorRegisterInput) => {
    if (isBusy) {
      return;
    }

    resetRegistration();
    setToastMessage(null);

    try {
      // Backend validation remains mandatory.
      // Authentication tokens will be handled later using secure httpOnly cookies.
      const antiBotToken: string | null = null;
      void antiBotToken;

      await registerIndependentDoctor(toIndependentDoctorPayload(data));
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
          className={styles.toast}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
            <path d="m8 12 2.6 2.6L16.5 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p>{toastMessage}</p>
        </div>
      ) : null}

      {isSuccess && registrationResponse ? (
        <RegisterSuccessCard
          accountType="INDEPENDENT_DOCTOR"
          direction={direction}
          isRtl={isRtl}
          locale={locale}
          t={t}
        />
      ) : (
        <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
          {registrationErrorMessage ? (
            <RegisterErrorAlert
              details={registrationErrorDetails}
              message={registrationErrorMessage}
              title={registrationErrorTitle}
            />
          ) : null}

          <div className={styles.fieldsGrid}>
            <div className={styles.fullSpan}>
              <Label htmlFor="fullName" className={styles.fieldLabel}>
                {t("register.forms.doctor.fields.fullName.label")}
              </Label>
              <Input
                id="fullName"
                className={styles.fieldControl}
                dir={direction}
                placeholder={t(
                  "register.forms.doctor.fields.fullName.placeholder",
                )}
                autoComplete="name"
                maxLength={120}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby="fullName-error"
                {...register("fullName", { onBlur: sanitizeOnBlur })}
              />
              <FormErrorMessage
                id="fullName-error"
                message={errors.fullName?.message}
              />
            </div>

            <div>
              <Label htmlFor="speciality" className={styles.fieldLabel}>
                {t("register.forms.doctor.fields.speciality.label")}
              </Label>
              <Input
                id="speciality"
                className={styles.fieldControl}
                dir={direction}
                placeholder={t(
                  "register.forms.doctor.fields.speciality.placeholder",
                )}
                autoComplete="organization-title"
                maxLength={100}
                aria-invalid={Boolean(errors.speciality)}
                aria-describedby="speciality-error"
                {...register("speciality", { onBlur: sanitizeOnBlur })}
              />
              <FormErrorMessage
                id="speciality-error"
                message={errors.speciality?.message}
              />
            </div>

            <div>
              <Label htmlFor="doctorWilaya" className={styles.fieldLabel}>
                {t("register.forms.doctor.fields.wilaya.label")}
              </Label>
              <Select
                id="doctorWilaya"
                className={styles.fieldControl}
                dir={direction}
                aria-invalid={Boolean(errors.wilaya)}
                aria-describedby="doctorWilaya-error"
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
                id="doctorWilaya-error"
                message={errors.wilaya?.message}
              />
            </div>

            <div className={styles.fullSpan}>
              <Label htmlFor="professionalAddress" className={styles.fieldLabel}>
                {t("register.forms.doctor.fields.professionalAddress.label")}
              </Label>
              <Textarea
                id="professionalAddress"
                className={cn(styles.fieldControl, styles.textareaControl)}
                dir={direction}
                placeholder={t(
                  "register.forms.doctor.fields.professionalAddress.placeholder",
                )}
                autoComplete="street-address"
                maxLength={180}
                aria-invalid={Boolean(errors.professionalAddress)}
                aria-describedby="professionalAddress-error"
                {...register("professionalAddress", {
                  onBlur: sanitizeOnBlur,
                })}
              />
              <FormErrorMessage
                id="professionalAddress-error"
                message={errors.professionalAddress?.message}
              />
            </div>

            <div>
              <Label htmlFor="doctorEmail" className={styles.fieldLabel}>
                {t("register.forms.doctor.fields.email.label")}
              </Label>
              <Input
                id="doctorEmail"
                type="email"
                className={styles.fieldControl}
                dir={direction}
                placeholder={t("register.forms.doctor.fields.email.placeholder")}
                autoComplete="email"
                maxLength={160}
                aria-invalid={Boolean(errors.email)}
                aria-describedby="doctorEmail-error"
                {...register("email", { onBlur: normalizeEmailOnBlur })}
              />
              <FormErrorMessage
                id="doctorEmail-error"
                message={errors.email?.message}
              />
            </div>

            <div>
              <Label htmlFor="doctorPhone" className={styles.fieldLabel}>
                {t("register.forms.doctor.fields.phone.label")}
              </Label>
              <Input
                id="doctorPhone"
                type="tel"
                className={styles.fieldControl}
                dir={direction}
                placeholder={t("register.forms.doctor.fields.phone.placeholder")}
                autoComplete="tel"
                inputMode="tel"
                maxLength={24}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby="doctorPhone-error"
                {...register("phone", { onBlur: sanitizePhoneOnBlur })}
              />
              <FormErrorMessage
                id="doctorPhone-error"
                message={errors.phone?.message}
              />
            </div>

            <PasswordInput
              id="doctorPassword"
              label={t("register.forms.doctor.fields.password.label")}
              direction={direction}
              strengthValue={passwordValue}
              error={errors.password?.message}
              aria-invalid={Boolean(errors.password)}
              {...passwordLabels}
              {...register("password")}
            />

            <PasswordInput
              id="doctorConfirmPassword"
              label={t("register.forms.doctor.fields.confirmPassword.label")}
              direction={direction}
              strengthValue={confirmPasswordValue}
              error={errors.confirmPassword?.message}
              aria-invalid={Boolean(errors.confirmPassword)}
              {...passwordLabels}
              {...register("confirmPassword")}
            />
          </div>

          <div className={styles.termsPanel}>
            <label className={styles.termLabel}>
              <input
                type="checkbox"
                aria-invalid={Boolean(errors.acceptTerms)}
                aria-describedby="doctorTerms-error"
                {...register("acceptTerms")}
              />
              <span>{t("register.forms.terms.acceptTerms")}</span>
            </label>
            <FormErrorMessage
              id="doctorTerms-error"
              message={errors.acceptTerms?.message}
            />

            <label className={styles.termLabel}>
              <input
                type="checkbox"
                aria-invalid={Boolean(errors.acceptVerification)}
                aria-describedby="doctorVerification-error"
                {...register("acceptVerification")}
              />
              <span>{t("register.forms.terms.acceptVerification")}</span>
            </label>
            <FormErrorMessage
              id="doctorVerification-error"
              message={errors.acceptVerification?.message}
            />
          </div>

          <div>
            <button type="submit" className={styles.submitButton} disabled={isBusy}>
              {isBusy ? (
                <span className={styles.spinner} aria-hidden="true" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {isBusy
                ? t("register.forms.doctor.loading")
                : t("register.forms.doctor.submit")}
            </button>
            <p className={styles.signinPrompt}>
              <span>{t("register.forms.signInPrompt")}</span>{" "}
              <a
                href="/login"
                className={styles.signinLink}
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
