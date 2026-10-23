import { ShieldCheck, UserRound } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type PatientContext } from "../types/prescription.types";
import { formatPrescriptionDate, getPatientAge, getPatientDisplayName } from "../utils/prescription-format";
import { PrescriptionActionError, PrescriptionsListSkeleton } from "./PrescriptionStateViews";

type PatientContextCardProps = {
  context?: PatientContext;
  errorKey?: string;
  isLoading: boolean;
  locale: Locale;
  t: TranslationFunction;
};

function InfoLine({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[.65rem] text-[var(--text-muted)]">{label}</dt><dd className="mt-0.5 text-[.76rem] font-medium text-[var(--text-primary)]">{value}</dd></div>;
}

function ClinicalValue({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[var(--radius-sm)] border border-[var(--line-soft)] bg-[var(--surface)] p-2.5"><dt className="text-[.64rem] text-[var(--text-muted)]">{label}</dt><dd className="mt-1 text-[.72rem] font-medium leading-5 text-[var(--text-primary)]">{value}</dd></div>;
}

// Identity and structured clinical context of the patient, from
// GET /prescriptions/patients/:id/context. A field the record does not hold
// reads "not provided", never a made-up value.
export function PatientContextCard({ context, errorKey, isLoading, locale, t }: PatientContextCardProps) {
  if (errorKey) return <PrescriptionActionError errorKey={errorKey} t={t} />;
  if (isLoading || !context) {
    return isLoading ? <PrescriptionsListSkeleton t={t} /> : (
      <section className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-[.72rem] text-[var(--text-secondary)]">{t("prescriptions.builder.choosePatient")}</section>
    );
  }
  const { patient } = context;
  const summary = patient.medicalSummary;
  const missing = t("prescriptions.common.notProvided");
  const list = (values?: string[]) => values?.length ? values.join(", ") : missing;
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-start gap-3 border-b border-[var(--line-soft)] p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[var(--medical)]"><UserRound size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        <div className="min-w-0"><h3 className="text-sm font-semibold">{getPatientDisplayName(patient, locale)}</h3><p className="mt-0.5 text-[.68rem] text-[var(--text-secondary)]" dir="ltr">{patient.hospitalRecordNumber ?? missing}</p></div>
      </div>
      <dl className="grid grid-cols-2 gap-3 p-4">
        <InfoLine label={t("prescriptions.patient.birthAge")} value={`${formatPrescriptionDate(patient.birthDate, locale)} · ${getPatientAge(patient.birthDate)} ${t("prescriptions.common.years")}`} />
        <InfoLine label={t("prescriptions.patient.sex")} value={t(`prescriptions.patient.${patient.gender === "FEMALE" ? "female" : "male"}`)} />
        <InfoLine label={t("prescriptions.patient.fileNumber")} value={patient.hospitalRecordNumber ?? missing} />
        <InfoLine label={t("prescriptions.patient.coverage")} value={t(`prescriptions.insurance.organizations.${patient.insurance}`)} />
      </dl>
      <div className="border-t border-[var(--line-soft)] bg-[var(--surface-muted)] p-4">
        <h4 className="mb-3 flex items-center gap-2 text-[.72rem] font-semibold text-[var(--medical)]"><ShieldCheck size={15} strokeWidth={1.8} aria-hidden="true" />{t("prescriptions.patient.clinicalStrip")}</h4>
        <dl className="grid gap-2 sm:grid-cols-2">
          <ClinicalValue label={t("prescriptions.patient.allergies")} value={list(summary?.allergies)} />
          <ClinicalValue label={t("prescriptions.patient.activeTreatments")} value={list(summary?.currentMedications)} />
          <ClinicalValue label={t("prescriptions.patient.chronicConditions")} value={list(summary?.chronicDiseases)} />
          <ClinicalValue label={t("prescriptions.patient.history")} value={list(summary?.history)} />
        </dl>
      </div>
    </section>
  );
}
