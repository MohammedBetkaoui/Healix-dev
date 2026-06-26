import {
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";

import { ALGERIAN_WILAYAS } from "@/types/auth";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { type DoctorVerificationFormInput } from "@/features/verification/types/doctor-verification.types";

import { SelectField, StepCard, TextField } from "./DoctorStepFields";

type DoctorProfessionalRegistrationStepProps = {
  direction: Direction;
  errors: FieldErrors<DoctorVerificationFormInput>;
  register: UseFormRegister<DoctorVerificationFormInput>;
  t: TranslationFunction;
};

export function DoctorProfessionalRegistrationStep({
  direction,
  errors,
  register,
  t,
}: DoctorProfessionalRegistrationStepProps) {
  const wilayaOptions = ALGERIAN_WILAYAS.map((wilaya) => ({
    label: wilaya,
    value: wilaya,
  }));
  const statuses = [
    {
      label: t("doctorVerification.options.professionalStatuses.independent"),
      value: "INDEPENDENT_LIBERAL",
    },
    {
      label: t("doctorVerification.options.professionalStatuses.privateSolo"),
      value: "PRIVATE_SOLO",
    },
    {
      label: t("doctorVerification.options.professionalStatuses.privateGroup"),
      value: "PRIVATE_GROUP",
    },
    {
      label: t("doctorVerification.options.professionalStatuses.publicComplementary"),
      value: "PUBLIC_COMPLEMENTARY",
    },
    {
      label: t("doctorVerification.options.professionalStatuses.other"),
      value: "OTHER",
    },
  ];

  return (
    <StepCard title={t("doctorVerification.steps.professionalRegistration")}>
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.ordreRegistrationNumber")}
        name="ordreRegistrationNumber"
        placeholder={t("doctorVerification.placeholders.ordreRegistrationNumber")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.regionalCouncil")}
        name="regionalCouncil"
        placeholder={t("doctorVerification.placeholders.regionalCouncil")}
        register={register}
      />
      <SelectField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.registrationWilaya")}
        name="registrationWilaya"
        options={wilayaOptions}
        placeholder={t("doctorVerification.options.select")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.registrationDate")}
        name="registrationDate"
        register={register}
        type="date"
      />
      <SelectField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.professionalStatus")}
        name="professionalStatus"
        options={statuses}
        placeholder={t("doctorVerification.options.select")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.practiceAuthorizationNumber")}
        name="practiceAuthorizationNumber"
        placeholder={t("doctorVerification.placeholders.practiceAuthorizationNumber")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.issuingAuthority")}
        name="issuingAuthority"
        register={register}
      />
    </StepCard>
  );
}
