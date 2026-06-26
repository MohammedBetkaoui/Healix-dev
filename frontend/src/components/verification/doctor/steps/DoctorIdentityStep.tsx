import {
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";

import { ALGERIAN_WILAYAS } from "@/types/auth";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { type DoctorVerificationFormInput } from "@/features/verification/types/doctor-verification.types";

import { SelectField, StepCard, TextareaField, TextField } from "./DoctorStepFields";

type DoctorIdentityStepProps = {
  direction: Direction;
  errors: FieldErrors<DoctorVerificationFormInput>;
  register: UseFormRegister<DoctorVerificationFormInput>;
  t: TranslationFunction;
};

export function DoctorIdentityStep({
  direction,
  errors,
  register,
  t,
}: DoctorIdentityStepProps) {
  const identityTypes = [
    {
      label: t("doctorVerification.options.identityTypes.nationalId"),
      value: "NATIONAL_ID",
    },
    {
      label: t("doctorVerification.options.identityTypes.passport"),
      value: "PASSPORT",
    },
    {
      label: t("doctorVerification.options.identityTypes.drivingLicense"),
      value: "DRIVING_LICENSE",
    },
    {
      label: t("doctorVerification.options.identityTypes.other"),
      value: "OTHER",
    },
  ];

  const wilayaOptions = ALGERIAN_WILAYAS.map((wilaya) => ({
    label: wilaya,
    value: wilaya,
  }));

  return (
    <StepCard title={t("doctorVerification.steps.identity")}>
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.fullName")}
        name="fullName"
        placeholder={t("doctorVerification.placeholders.fullName")}
        register={register}
        autoComplete="name"
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.birthDate")}
        name="birthDate"
        register={register}
        type="date"
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.birthPlace")}
        name="birthPlace"
        placeholder={t("doctorVerification.placeholders.birthPlace")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.nationality")}
        name="nationality"
        placeholder={t("doctorVerification.placeholders.nationality")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.identityNumber")}
        name="identityNumber"
        placeholder={t("doctorVerification.placeholders.identityNumber")}
        register={register}
      />
      <SelectField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.identityDocumentType")}
        name="identityDocumentType"
        options={identityTypes}
        placeholder={t("doctorVerification.options.select")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.phone")}
        name="phone"
        placeholder={t("doctorVerification.placeholders.phone")}
        register={register}
        type="tel"
        autoComplete="tel"
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.professionalEmail")}
        name="professionalEmail"
        placeholder={t("doctorVerification.placeholders.professionalEmail")}
        register={register}
        type="email"
        autoComplete="email"
      />
      <SelectField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.wilaya")}
        name="wilaya"
        options={wilayaOptions}
        placeholder={t("doctorVerification.options.select")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.commune")}
        name="commune"
        placeholder={t("doctorVerification.placeholders.commune")}
        register={register}
      />
      <TextareaField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.personalOrProfessionalAddress")}
        name="personalOrProfessionalAddress"
        placeholder={t("doctorVerification.placeholders.address")}
        register={register}
      />
    </StepCard>
  );
}
