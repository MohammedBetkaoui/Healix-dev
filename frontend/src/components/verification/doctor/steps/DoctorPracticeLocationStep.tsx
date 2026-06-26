import {
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";

import { ALGERIAN_WILAYAS } from "@/types/auth";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { type DoctorVerificationFormInput } from "@/features/verification/types/doctor-verification.types";

import { SelectField, StepCard, TextareaField, TextField } from "./DoctorStepFields";

type DoctorPracticeLocationStepProps = {
  direction: Direction;
  errors: FieldErrors<DoctorVerificationFormInput>;
  register: UseFormRegister<DoctorVerificationFormInput>;
  t: TranslationFunction;
};

export function DoctorPracticeLocationStep({
  direction,
  errors,
  register,
  t,
}: DoctorPracticeLocationStepProps) {
  const wilayaOptions = ALGERIAN_WILAYAS.map((wilaya) => ({
    label: wilaya,
    value: wilaya,
  }));
  const cabinetTypes = [
    {
      label: t("doctorVerification.options.cabinetTypes.individual"),
      value: "INDIVIDUAL",
    },
    {
      label: t("doctorVerification.options.cabinetTypes.group"),
      value: "GROUP",
    },
    {
      label: t("doctorVerification.options.cabinetTypes.privateConsultation"),
      value: "PRIVATE_CONSULTATION",
    },
    {
      label: t("doctorVerification.options.cabinetTypes.teleconsultation"),
      value: "TELECONSULTATION",
    },
    {
      label: t("doctorVerification.options.cabinetTypes.other"),
      value: "OTHER",
    },
  ];

  return (
    <StepCard title={t("doctorVerification.steps.practiceLocation")}>
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.cabinetName")}
        name="cabinetName"
        placeholder={t("doctorVerification.placeholders.cabinetName")}
        register={register}
      />
      <SelectField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.cabinetType")}
        name="cabinetType"
        options={cabinetTypes}
        placeholder={t("doctorVerification.options.select")}
        register={register}
      />
      <TextareaField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.cabinetAddress")}
        name="cabinetAddress"
        placeholder={t("doctorVerification.placeholders.cabinetAddress")}
        register={register}
      />
      <SelectField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.cabinetWilaya")}
        name="cabinetWilaya"
        options={wilayaOptions}
        placeholder={t("doctorVerification.options.select")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.cabinetCommune")}
        name="cabinetCommune"
        placeholder={t("doctorVerification.placeholders.commune")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.cabinetPhone")}
        name="cabinetPhone"
        placeholder={t("doctorVerification.placeholders.phone")}
        register={register}
        type="tel"
        autoComplete="tel"
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.cabinetEmail")}
        name="cabinetEmail"
        placeholder={t("doctorVerification.placeholders.professionalEmail")}
        register={register}
        type="email"
        autoComplete="email"
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.healthDirectorate")}
        name="healthDirectorate"
        placeholder={t("doctorVerification.placeholders.healthDirectorate")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.cabinetOpeningAuthorizationNumber")}
        name="cabinetOpeningAuthorizationNumber"
        register={register}
      />
    </StepCard>
  );
}
