"use client";

import { type FieldErrors, type UseFormRegister, type UseFormWatch } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  algerianWilayas,
  patientGenderValues,
  patientInsuranceValues,
  patientSectorValues,
} from "@/features/patients/patients.constants";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type PatientFormValues } from "@/types/patient";

type PatientFormFieldsProps = {
  direction: Direction;
  errors: FieldErrors<PatientFormValues>;
  register: UseFormRegister<PatientFormValues>;
  t: TranslationFunction;
  watch: UseFormWatch<PatientFormValues>;
};

function FieldError({ message }: { message?: string }) {
  return message ? <p className="font-[var(--font-auth-mono)] text-[0.68rem] text-[#8a5524]">{message}</p> : null;
}

function Field({
  children,
  error,
  label,
  required,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[0.78rem] font-medium text-[var(--ink)]">
        {label} {required ? <span className="text-[var(--gold)]">*</span> : null}
      </Label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

const fieldClass = "h-11 rounded-[0.7rem] border-[var(--line)] bg-[#fcfbf8] text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus-visible:border-[var(--accent)] focus-visible:ring-[var(--accent-soft)]";

function SectionHeading({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--line-soft)] pb-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--gold-line)] bg-[var(--gold-soft)] font-[var(--font-auth-mono)] text-[0.68rem] text-[var(--gold)]">{index}</span>
      <h3 className="font-[var(--font-auth-mono)] text-[0.68rem] font-medium uppercase tracking-[0.12em] text-[var(--ink-soft)]">{title}</h3>
    </div>
  );
}

export function PatientFormFields({
  direction,
  errors,
  register,
  t,
  watch,
}: PatientFormFieldsProps) {
  const insurance = watch("insurance");
  const sector = watch("sector");
  const showInsuredNumber = insurance === "CNAS" || insurance === "CASNOS" || sector === "CONVENTIONED";

  return (
    <div className={cn("space-y-8", direction === "rtl" && "text-right")}>
      <section className="space-y-4">
        <SectionHeading index="01" title={t("patients.modal.sections.identity")} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("patients.modal.fields.firstName")} error={errors.firstName?.message} required>
            <Input className={fieldClass} autoComplete="given-name" {...register("firstName")} />
          </Field>
          <Field label={t("patients.modal.fields.lastName")} error={errors.lastName?.message} required>
            <Input className={fieldClass} autoComplete="family-name" {...register("lastName")} />
          </Field>
          <Field label={t("patients.modal.fields.firstNameAr")} error={errors.firstNameAr?.message} required>
            <Input className={cn(fieldClass, "text-right")} dir="rtl" lang="ar" {...register("firstNameAr")} />
          </Field>
          <Field label={t("patients.modal.fields.lastNameAr")} error={errors.lastNameAr?.message} required>
            <Input className={cn(fieldClass, "text-right")} dir="rtl" lang="ar" {...register("lastNameAr")} />
          </Field>
          <Field label={t("patients.modal.fields.birthDate")} error={errors.birthDate?.message} required>
            <Input className={fieldClass} type="date" {...register("birthDate")} />
          </Field>
          <Field label={t("patients.modal.fields.gender")} error={errors.gender?.message} required>
            <Select className={fieldClass} {...register("gender")}>
              <option value="">{t("patients.filters.all")}</option>
              {patientGenderValues.map((gender) => (
                <option key={gender} value={gender}>{t(`patients.genders.${gender}`)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("patients.modal.fields.nationalId")} error={errors.nationalId?.message}>
            <Input className={fieldClass} inputMode="numeric" maxLength={18} placeholder="000000000000000000" {...register("nationalId")} />
          </Field>
          <Field label={t("patients.modal.fields.hospitalRecordNumber")}>
            <Input className={fieldClass} placeholder="DH-16-000123" {...register("hospitalRecordNumber")} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading index="02" title={t("patients.modal.sections.administrative")} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("patients.modal.fields.sector")} error={errors.sector?.message} required>
            <Select className={fieldClass} {...register("sector")}>
              <option value="">{t("patients.filters.all")}</option>
              {patientSectorValues.map((value) => <option key={value} value={value}>{t(`patients.sectors.${value}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("patients.modal.fields.insurance")} error={errors.insurance?.message} required>
            <Select className={fieldClass} {...register("insurance")}>
              <option value="">{t("patients.filters.all")}</option>
              {patientInsuranceValues.map((value) => <option key={value} value={value}>{t(`patients.insurances.${value}`)}</option>)}
            </Select>
          </Field>
          {showInsuredNumber ? (
            <Field label={t("patients.modal.fields.insuredNumber")}>
              <Input className={fieldClass} {...register("insuredNumber")} />
            </Field>
          ) : null}
          <Field label={t("patients.modal.fields.wilaya")} error={errors.wilaya?.message} required>
            <Select className={fieldClass} {...register("wilaya")}>
              <option value="">{t("patients.filters.all")}</option>
              {algerianWilayas.map(([code, name]) => <option key={code} value={`${code}|${name}`}>{code} · {name}</option>)}
            </Select>
          </Field>
          <Field label={t("patients.modal.fields.commune")} error={errors.commune?.message} required>
            <Input className={fieldClass} {...register("commune")} />
          </Field>
          <Field label={t("patients.modal.fields.referringDoctor")} error={errors.referringDoctor?.message} required>
            <Input className={fieldClass} placeholder="Dr Amel Benaïssa" {...register("referringDoctor")} />
          </Field>
          <Field label={t("patients.modal.fields.doctorRegistrationNumber")} error={errors.doctorRegistrationNumber?.message} required>
            <Input className={fieldClass} placeholder="DZ-OM-16-04128" {...register("doctorRegistrationNumber")} />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading index="03" title={t("patients.modal.sections.contact")} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("patients.modal.fields.phone")} error={errors.phone?.message} required>
            <Input className={fieldClass} inputMode="tel" placeholder="0550123456" {...register("phone")} />
          </Field>
          <Field label={t("patients.modal.fields.email")} error={errors.email?.message}>
            <Input className={fieldClass} type="email" {...register("email")} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-[0.8rem] border border-[var(--line)] bg-[#fcfbf8] p-4">
          <input className="mt-0.5 h-4 w-4 accent-[var(--accent)]" type="checkbox" {...register("smsEnabled")} />
          <span>
            <span className="block text-sm font-medium text-[var(--ink)]">{t("patients.modal.fields.smsEnabled")}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--ink-soft)]">{t("patients.modal.help.smsEnabled")}</span>
          </span>
        </label>
      </section>

      <section className="rounded-[1rem] rounded-bl-[0.35rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-5">
        <div className="flex items-center justify-between gap-4">
          <SectionHeading index="04" title={t("patients.modal.sections.consent")} />
          <span className="shrink-0 rounded-full border border-[var(--accent-line)] bg-[var(--panel)] px-3 py-1 font-[var(--font-auth-mono)] text-[0.62rem] text-[var(--accent-dark)]">LOI 18-07</span>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">{t("patients.modal.help.consent")}</p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-[0.75rem] border border-[var(--accent-line)] bg-[var(--panel)] p-4">
          <input className="mt-0.5 h-4 w-4 accent-[var(--accent)]" type="checkbox" {...register("healthDataConsent")} />
          <span>
            <span className="block text-sm font-medium text-[var(--accent-dark)]">{t("patients.modal.fields.healthDataConsent")}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--ink-soft)]">{t("patients.modal.help.consentAudit")}</span>
          </span>
        </label>
        <FieldError message={errors.healthDataConsent?.message} />
      </section>
    </div>
  );
}
