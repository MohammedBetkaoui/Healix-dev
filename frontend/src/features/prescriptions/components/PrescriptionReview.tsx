import { CalendarDays, FileCheck2, Save, ShieldAlert, Stethoscope, UserRound } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type ClinicalSafetyAlert, type PrescriptionCapabilities } from "../types/prescription.types";

type PrescriptionReviewProps = {
  alerts: ClinicalSafetyAlert[];
  busy: boolean;
  /** Patient chosen and every line complete. */
  canSave: boolean;
  capabilities: PrescriptionCapabilities;
  /** Credentials of the prescriber (Ordre number, council, address) are complete. */
  credentialsComplete: boolean;
  durationDays: number;
  itemCount: number;
  locale: Locale;
  /** Critical alerts were shown: the next validation confirms them. */
  needsConfirmation: boolean;
  onSave: () => void;
  onValidate: () => void;
  patientLabel: string;
  prescriberLabel: string;
  t: TranslationFunction;
  /** Regulated prescription whose confirmation is still missing. */
  validationBlocked: boolean;
};

export function PrescriptionReview({ alerts, busy, canSave, capabilities, credentialsComplete, durationDays, itemCount, locale, needsConfirmation, onSave, onValidate, patientLabel, prescriberLabel, t, validationBlocked }: PrescriptionReviewProps) {
  const unresolved = alerts.filter((alert) => !alert.resolved).length;
  const rows = [
    { icon: UserRound, label: t("prescriptions.review.patient"), value: patientLabel || t("prescriptions.common.notProvided") },
    { icon: Stethoscope, label: t("prescriptions.review.prescriber"), value: prescriberLabel || t("prescriptions.common.notProvided") },
    { icon: CalendarDays, label: t("prescriptions.review.date"), value: new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ").format(new Date()) },
    { icon: FileCheck2, label: t("prescriptions.review.medicationCount"), value: String(itemCount) },
  ];
  const canValidate = capabilities.canSignPrescription && canSave && credentialsComplete && !validationBlocked && !busy;
  return (
    <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-semibold">{t("prescriptions.review.title")}</h3>
      <dl className="mt-3 divide-y divide-[var(--line-soft)]">{rows.map(({ icon: Icon, label, value }) => <div key={label} className="flex items-center justify-between gap-3 py-2.5 text-[.72rem]"><dt className="flex items-center gap-2 text-[var(--text-secondary)]"><Icon size={14} aria-hidden="true" />{label}</dt><dd className="text-end font-semibold">{value}</dd></div>)}<div className="flex items-center justify-between gap-3 py-2.5 text-[.72rem]"><dt className="text-[var(--text-secondary)]">{t("prescriptions.review.overallDuration")}</dt><dd className="font-semibold">{durationDays} {t("prescriptions.common.days")}</dd></div><div className="flex items-center justify-between gap-3 py-2.5 text-[.72rem]"><dt className="text-[var(--text-secondary)]">{t("prescriptions.review.unresolvedAlerts")}</dt><dd className={unresolved ? "font-semibold text-[var(--warning-ink)]" : "font-semibold text-[var(--success-ink)]"}>{unresolved}</dd></div></dl>
      <p className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--surface-muted)] p-3 text-[.66rem] leading-5 text-[var(--text-secondary)]"><ShieldAlert size={14} className="mt-0.5 shrink-0 text-[var(--medical)]" aria-hidden="true" />{t("prescriptions.review.validationNotice")}</p>
      {!canSave ? <p className="mt-3 text-[.66rem] text-[var(--text-secondary)]">{t("prescriptions.builder.incomplete")}</p> : null}
      {!credentialsComplete ? <p className="mt-3 text-[.66rem] text-[var(--warning-ink)]">{t("prescriptions.builder.credentialsIncomplete")}</p> : null}
      <div className="mt-4 grid gap-2">
        <button type="button" className="clinical-button" onClick={onSave} disabled={!canSave || busy || !capabilities.canCreatePrescription}><Save size={15} aria-hidden="true" />{t("prescriptions.actions.saveDraft")}</button>
        <button type="button" className="clinical-button clinical-button-primary" onClick={onValidate} disabled={!canValidate}><FileCheck2 size={15} aria-hidden="true" />{needsConfirmation ? t("prescriptions.actions.validateAnyway") : t("prescriptions.actions.validate")}</button>
        {!capabilities.canSignPrescription ? <span className="text-[.66rem] text-[var(--text-secondary)]">{t("prescriptions.actions.reserved")}</span> : null}
      </div>
    </section>
  );
}
