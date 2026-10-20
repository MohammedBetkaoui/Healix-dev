import { ShieldCheck, UserRound } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { localize } from "../prescriptions.copy";
import { type PrescriptionPatient } from "../types/prescription.types";
import { formatPrescriptionDate, getPatientAge, getPatientDisplayName } from "../utils/prescription-format";

type PatientContextCardProps = {
  locale: Locale;
  patient: PrescriptionPatient;
  t: TranslationFunction;
};

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[.65rem] text-[var(--text-muted)]">{label}</dt><dd className="mt-0.5 text-[.76rem] font-medium text-[var(--text-primary)]">{value}</dd></div>;
}

function ClinicalValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[var(--radius-sm)] border border-[var(--line-soft)] bg-[var(--surface)] p-2.5"><dt className="text-[.64rem] text-[var(--text-muted)]">{label}</dt><dd className="mt-1 text-[.72rem] font-medium leading-5 text-[var(--text-primary)]">{value}</dd></div>;
}

export function PatientContextCard({ locale, patient, t }: PatientContextCardProps) {
  const missing = t("prescriptions.common.notProvided");
  const list = (values?: PrescriptionPatient["allergies"]) => values?.length ? values.map((value) => localize(value, locale)).join(", ") : missing;
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-start gap-3 border-b border-[var(--line-soft)] p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[var(--medical)]"><UserRound size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        <div className="min-w-0"><h3 className="text-sm font-semibold">{getPatientDisplayName(patient, locale)}</h3><p className="mt-0.5 text-[.68rem] text-[var(--text-secondary)]">{patient.fileNumber}</p></div>
      </div>
      <dl className="grid grid-cols-2 gap-3 p-4">
        <InfoLine label={t("prescriptions.patient.birthAge")} value={`${formatPrescriptionDate(patient.birthDate, locale)} · ${getPatientAge(patient.birthDate)} ${t("prescriptions.common.years")}`} />
        <InfoLine label={t("prescriptions.patient.sex")} value={t(`prescriptions.patient.${patient.sex === "FEMALE" ? "female" : "male"}`)} />
        <InfoLine label={t("prescriptions.patient.fileNumber")} value={patient.fileNumber} />
        <InfoLine label={t("prescriptions.patient.phone")} value={patient.phone} />
        <InfoLine label={t("prescriptions.patient.coverage")} value={patient.insurance.organization === "UNKNOWN" ? missing : patient.insurance.organization} />
        <InfoLine label={t("prescriptions.patient.chifa")} value={patient.insurance.maskedChifaNumber ? `${t("prescriptions.patient.chifa")} ${patient.insurance.maskedChifaNumber}` : missing} />
      </dl>
      <div className="border-t border-[var(--line-soft)] bg-[var(--surface-muted)] p-4">
        <h4 className="mb-3 flex items-center gap-2 text-[.72rem] font-semibold text-[var(--medical)]"><ShieldCheck size={15} strokeWidth={1.8} aria-hidden="true" />{t("prescriptions.patient.clinicalStrip")}</h4>
        <dl className="grid gap-2 sm:grid-cols-2">
          <ClinicalValue label={t("prescriptions.patient.allergies")} value={list(patient.allergies)} />
          <ClinicalValue label={t("prescriptions.patient.activeTreatments")} value={list(patient.activeTreatments)} />
          <ClinicalValue label={t("prescriptions.patient.chronicConditions")} value={list(patient.chronicConditions)} />
          <ClinicalValue label={t("prescriptions.patient.pregnancy")} value={patient.pregnancyBreastfeeding ? localize(patient.pregnancyBreastfeeding, locale) : missing} />
          <ClinicalValue label={t("prescriptions.patient.weight")} value={patient.weightKg ? `${patient.weightKg} kg` : missing} />
          <ClinicalValue label={t("prescriptions.patient.renal")} value={patient.renalFunction ? localize(patient.renalFunction, locale) : missing} />
          <ClinicalValue label={t("prescriptions.patient.hepatic")} value={patient.hepaticFunction ? localize(patient.hepaticFunction, locale) : missing} />
        </dl>
      </div>
    </section>
  );
}

