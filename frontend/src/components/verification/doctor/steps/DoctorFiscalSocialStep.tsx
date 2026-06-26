import {
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";

import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { type DoctorVerificationFormInput } from "@/features/verification/types/doctor-verification.types";

import { SelectField, StepCard, TextField } from "./DoctorStepFields";

type DoctorFiscalSocialStepProps = {
  direction: Direction;
  errors: FieldErrors<DoctorVerificationFormInput>;
  register: UseFormRegister<DoctorVerificationFormInput>;
  t: TranslationFunction;
};

export function DoctorFiscalSocialStep({
  direction,
  errors,
  register,
  t,
}: DoctorFiscalSocialStepProps) {
  const activityTypes = [
    {
      label: t("doctorVerification.options.fiscalActivityTypes.liberalMedical"),
      value: "LIBERAL_MEDICAL",
    },
    {
      label: t("doctorVerification.options.fiscalActivityTypes.individualCabinet"),
      value: "INDIVIDUAL_CABINET",
    },
    {
      label: t("doctorVerification.options.fiscalActivityTypes.groupCabinet"),
      value: "GROUP_CABINET",
    },
    {
      label: t("doctorVerification.options.fiscalActivityTypes.other"),
      value: "OTHER",
    },
  ];

  return (
    <StepCard title={t("doctorVerification.steps.fiscalSocial")}>
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.nif")}
        name="nif"
        placeholder={t("doctorVerification.placeholders.nif")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.taxCenter")}
        name="taxCenter"
        placeholder={t("doctorVerification.placeholders.taxCenter")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.casnosNumber")}
        name="casnosNumber"
        placeholder={t("doctorVerification.placeholders.casnosNumber")}
        register={register}
      />
      <SelectField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.fiscalActivityType")}
        name="fiscalActivityType"
        options={activityTypes}
        placeholder={t("doctorVerification.options.select")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.professionalRib")}
        name="professionalRib"
        placeholder={t("doctorVerification.placeholders.professionalRib")}
        register={register}
      />
    </StepCard>
  );
}
