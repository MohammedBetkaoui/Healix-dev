import { CalendarDays, Eye, FileCheck2, Save, ShieldAlert, Stethoscope, UserRound } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import {
  type ClinicalSafetyAlert,
  type Practitioner,
  type PrescriptionCapabilities,
  type PrescriptionItem,
  type PrescriptionPatient,
} from "../types/prescription.types";
import { getPatientDisplayName } from "../utils/prescription-format";

type PrescriptionReviewProps = {
  alerts: ClinicalSafetyAlert[];
  capabilities: PrescriptionCapabilities;
  items: PrescriptionItem[];
  locale: Locale;
  onPreview: () => void;
  onSave: () => void;
  onValidate: () => void;
  patient: PrescriptionPatient;
  prescriber: Practitioner;
  t: TranslationFunction;
};

export function PrescriptionReview({ alerts, capabilities, items, locale, onPreview, onSave, onValidate, patient, prescriber, t }: PrescriptionReviewProps) {
  const duration = items.reduce((max, item) => Math.max(max, item.durationDays), 0);
  const unresolved = alerts.filter((alert) => !alert.resolved).length;
  const rows = [
    { icon: UserRound, label: t("prescriptions.review.patient"), value: getPatientDisplayName(patient, locale) },
    { icon: Stethoscope, label: t("prescriptions.review.prescriber"), value: `Dr. ${prescriber.firstName} ${prescriber.lastName}` },
    { icon: CalendarDays, label: t("prescriptions.review.date"), value: new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ").format(new Date()) },
    { icon: FileCheck2, label: t("prescriptions.review.medicationCount"), value: String(items.length) },
  ];
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-semibold">{t("prescriptions.review.title")}</h3>
      <dl className="mt-3 divide-y divide-[var(--line-soft)]">{rows.map(({ icon: Icon, label, value }) => <div key={label} className="flex items-center justify-between gap-3 py-2.5 text-[.72rem]"><dt className="flex items-center gap-2 text-[var(--text-secondary)]"><Icon size={14} aria-hidden="true" />{label}</dt><dd className="text-end font-semibold">{value}</dd></div>)}<div className="flex items-center justify-between gap-3 py-2.5 text-[.72rem]"><dt className="text-[var(--text-secondary)]">{t("prescriptions.review.overallDuration")}</dt><dd className="font-semibold">{duration} {t("prescriptions.common.days")}</dd></div><div className="flex items-center justify-between gap-3 py-2.5 text-[.72rem]"><dt className="text-[var(--text-secondary)]">{t("prescriptions.review.unresolvedAlerts")}</dt><dd className={unresolved ? "font-semibold text-[var(--warning-ink)]" : "font-semibold text-[var(--success-ink)]"}>{unresolved}</dd></div></dl>
      <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--surface-muted)] p-3 text-[.66rem] leading-5 text-[var(--text-secondary)]"><ShieldAlert size={14} className="mt-0.5 shrink-0 text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.review.validationNotice")}</p>
      <div className="mt-4 grid gap-2">
        <button type="button" className="clinical-button" onClick={onSave}><Save size={15} aria-hidden="true" />{t("prescriptions.actions.saveDraft")}</button>
        <button type="button" className="clinical-button" onClick={onPreview}><Eye size={15} aria-hidden="true" />{t("prescriptions.actions.preview")}</button>
        <button type="button" className="clinical-button clinical-button-primary" onClick={onValidate} disabled={!capabilities.canSignPrescription || items.length === 0}><FileCheck2 size={15} aria-hidden="true" />{t("prescriptions.actions.validate")}</button>
        {!capabilities.canSignPrescription ? <span className="text-[.66rem] text-[var(--text-secondary)]">{t("prescriptions.actions.reserved")}</span> : null}
      </div>
    </section>
  );
}

