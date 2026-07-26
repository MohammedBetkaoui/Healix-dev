"use client";

import {
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  patientBloodGroupValues,
  patientGenderValues,
} from "@/features/patients/patients.constants";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type PatientFormValues } from "@/types/patient";

type PatientFormFieldsProps = {
  direction: Direction;
  errors: FieldErrors<PatientFormValues>;
  register: UseFormRegister<PatientFormValues>;
  t: TranslationFunction;
};

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs font-medium text-red-500">{message}</p>;
}

function fieldClassName(direction: Direction) {
  return cn(direction === "rtl" && "text-right");
}

export function PatientFormFields({
  direction,
  errors,
  register,
  t,
}: PatientFormFieldsProps) {
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
          {t("patients.modal.sections.personal")}
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("patients.modal.fields.firstName")}</Label>
            <Input
              aria-invalid={Boolean(errors.firstName)}
              className={fieldClassName(direction)}
              {...register("firstName")}
            />
            <FieldError message={errors.firstName?.message} />
          </div>
          <div className="space-y-2">
            <Label>{t("patients.modal.fields.lastName")}</Label>
            <Input
              aria-invalid={Boolean(errors.lastName)}
              className={fieldClassName(direction)}
              {...register("lastName")}
            />
            <FieldError message={errors.lastName?.message} />
          </div>
          <div className="space-y-2">
            <Label>{t("patients.modal.fields.birthDate")}</Label>
            <Input
              aria-invalid={Boolean(errors.birthDate)}
              className={fieldClassName(direction)}
              type="date"
              {...register("birthDate")}
            />
            <FieldError message={errors.birthDate?.message} />
          </div>
          <div className="space-y-2">
            <Label>{t("patients.modal.fields.gender")}</Label>
            <Select
              aria-invalid={Boolean(errors.gender)}
              className={fieldClassName(direction)}
              {...register("gender")}
            >
              <option value="">{t("patients.filters.all")}</option>
              {patientGenderValues.map((gender) => (
                <option key={gender} value={gender}>
                  {t(`patients.genders.${gender}`)}
                </option>
              ))}
            </Select>
            <FieldError message={errors.gender?.message} />
          </div>
          <div className="space-y-2">
            <Label>{t("patients.modal.fields.phone")}</Label>
            <Input
              aria-invalid={Boolean(errors.phone)}
              className={fieldClassName(direction)}
              {...register("phone")}
            />
            <FieldError message={errors.phone?.message} />
          </div>
          <div className="space-y-2">
            <Label>{t("patients.modal.fields.email")}</Label>
            <Input
              aria-invalid={Boolean(errors.email)}
              className={fieldClassName(direction)}
              type="email"
              {...register("email")}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>{t("patients.modal.fields.address")}</Label>
            <Textarea
              className={fieldClassName(direction)}
              {...register("address")}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
          {t("patients.modal.sections.medical")}
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("patients.modal.fields.bloodGroup")}</Label>
            <Select
              className={fieldClassName(direction)}
              {...register("bloodGroup")}
            >
              <option value="">{t("patients.filters.all")}</option>
              {patientBloodGroupValues.map((bloodGroup) => (
                <option key={bloodGroup} value={bloodGroup}>
                  {bloodGroup}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("patients.modal.fields.allergies")}</Label>
            <Input
              className={fieldClassName(direction)}
              placeholder={t("patients.modal.placeholders.allergies")}
              {...register("allergies")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("patients.modal.fields.chronicDiseases")}</Label>
            <Textarea
              className={fieldClassName(direction)}
              placeholder={t("patients.modal.placeholders.chronicDiseases")}
              {...register("chronicDiseases")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("patients.modal.fields.history")}</Label>
            <Textarea
              className={fieldClassName(direction)}
              placeholder={t("patients.modal.placeholders.history")}
              {...register("history")}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
          {t("patients.modal.sections.emergency")}
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("patients.modal.fields.emergencyContactName")}</Label>
            <Input
              aria-invalid={Boolean(errors.emergencyContactName)}
              className={fieldClassName(direction)}
              {...register("emergencyContactName")}
            />
            <FieldError message={errors.emergencyContactName?.message} />
          </div>
          <div className="space-y-2">
            <Label>{t("patients.modal.fields.emergencyContactPhone")}</Label>
            <Input
              aria-invalid={Boolean(errors.emergencyContactPhone)}
              className={fieldClassName(direction)}
              {...register("emergencyContactPhone")}
            />
            <FieldError message={errors.emergencyContactPhone?.message} />
          </div>
        </div>
      </section>
    </div>
  );
}
