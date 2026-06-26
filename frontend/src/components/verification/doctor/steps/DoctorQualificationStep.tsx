import {
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";

import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { type DoctorVerificationFormInput } from "@/features/verification/types/doctor-verification.types";

import { SelectField, StepCard, TextField } from "./DoctorStepFields";

type DoctorQualificationStepProps = {
  direction: Direction;
  errors: FieldErrors<DoctorVerificationFormInput>;
  register: UseFormRegister<DoctorVerificationFormInput>;
  t: TranslationFunction;
};

export function DoctorQualificationStep({
  direction,
  errors,
  register,
  t,
}: DoctorQualificationStepProps) {
  const doctorTypes = [
    {
      label: t("doctorVerification.options.doctorTypes.generalist"),
      value: "GENERALIST",
    },
    {
      label: t("doctorVerification.options.doctorTypes.specialist"),
      value: "SPECIALIST",
    },
  ];

  return (
    <StepCard title={t("doctorVerification.steps.qualification")}>
      <SelectField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.doctorType")}
        name="doctorType"
        options={doctorTypes}
        placeholder={t("doctorVerification.options.select")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.speciality")}
        name="speciality"
        placeholder={t("doctorVerification.placeholders.speciality")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.primaryDegree")}
        name="primaryDegree"
        placeholder={t("doctorVerification.placeholders.primaryDegree")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.university")}
        name="university"
        placeholder={t("doctorVerification.placeholders.university")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.graduationYear")}
        name="graduationYear"
        placeholder={t("doctorVerification.placeholders.graduationYear")}
        register={register}
        type="number"
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.specialityDegree")}
        name="specialityDegree"
        placeholder={t("doctorVerification.placeholders.specialityDegree")}
        register={register}
      />
      <TextField
        direction={direction}
        errors={errors}
        label={t("doctorVerification.fields.specialityGraduationYear")}
        name="specialityGraduationYear"
        placeholder={t("doctorVerification.placeholders.graduationYear")}
        register={register}
        type="number"
      />
    </StepCard>
  );
}
