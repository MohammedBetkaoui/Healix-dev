import { FileText, Pill } from "lucide-react";

import { getPatientDisplayName } from "@/features/prescriptions/utils/prescription-format";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type ConsultationListItem } from "../types/consultation.types";
import { truncateText } from "../utils/consultation-utils";

type ConsultationsTableProps = {
  consultations: ConsultationListItem[];
  locale: Locale;
  onOpen: (consultation: ConsultationListItem) => void;
  t: TranslationFunction;
};

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function Counts({ consultation, t }: { consultation: ConsultationListItem; t: TranslationFunction }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="inline-flex items-center gap-1.5" title={t("consultations.columns.prescriptions")}><Pill size={13} className="text-[var(--medical)]" aria-hidden="true" /><span className="clinical-figure font-semibold">{consultation.prescriptionCount}</span><span className="sr-only">{t("consultations.columns.prescriptions")}</span></span>
      <span className="inline-flex items-center gap-1.5" title={t("consultations.columns.reports")}><FileText size={13} className="text-[var(--medical)]" aria-hidden="true" /><span className="clinical-figure font-semibold">{consultation.reportCount}</span><span className="sr-only">{t("consultations.columns.reports")}</span></span>
    </div>
  );
}

export function ConsultationsTable({ consultations, locale, onOpen, t }: ConsultationsTableProps) {
  if (!consultations.length) {
    return <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center"><p className="text-sm font-semibold text-[var(--text-primary)]">{t("consultations.table.empty")}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{t("consultations.table.emptyHelp")}</p></section>;
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[56rem] text-start text-xs">
          <caption className="sr-only">{t("consultations.table.caption")}</caption>
          <thead className="bg-[var(--surface-muted)] text-[0.66rem] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
            <tr>{(["date", "patient", "reason", "diagnosis", "links"] as const).map((key) => <th key={key} scope="col" className="px-3 py-3 text-start font-semibold">{t(`consultations.columns.${key}`)}</th>)}<th scope="col" className="px-3 py-3 text-end font-semibold">{t("consultations.columns.actions")}</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--line-soft)]">
            {consultations.map((consultation) => (
              <tr key={consultation.id} className="align-middle transition hover:bg-[var(--surface-muted)]">
                <td className="whitespace-nowrap px-3 py-3.5"><button type="button" className="font-semibold text-[var(--accent-dark)] hover:underline" onClick={() => onOpen(consultation)}>{formatDate(consultation.date, locale)}</button></td>
                <td className="px-3 py-3.5"><p className="whitespace-nowrap font-semibold text-[var(--text-primary)]">{getPatientDisplayName(consultation.patient, locale)}</p>{consultation.patient.hospitalRecordNumber ? <p className="clinical-figure mt-1 text-[0.64rem] text-[var(--text-muted)]" dir="ltr">{consultation.patient.hospitalRecordNumber}</p> : null}</td>
                <td className="max-w-56 px-3 py-3.5 text-[var(--text-primary)]">{truncateText(consultation.reason, 80)}</td>
                <td className="max-w-64 px-3 py-3.5 text-[var(--text-secondary)]">{truncateText(consultation.diagnosis, 90)}</td>
                <td className="px-3 py-3.5"><Counts consultation={consultation} t={t} /></td>
                <td className="px-3 py-3.5 text-end"><button type="button" className="clinical-button min-h-9 whitespace-nowrap" onClick={() => onOpen(consultation)}>{t("consultations.actions.open")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[var(--line-soft)] md:hidden">
        {consultations.map((consultation) => (
          <article key={consultation.id} className="p-4">
            <p className="text-[0.66rem] text-[var(--text-secondary)]">{formatDate(consultation.date, locale)}</p>
            <h2 className="mt-1 text-sm font-semibold">{getPatientDisplayName(consultation.patient, locale)}</h2>
            <p className="mt-1 text-xs text-[var(--text-primary)]">{truncateText(consultation.reason, 80)}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{truncateText(consultation.diagnosis, 90)}</p>
            <div className="mt-3 flex items-center justify-between gap-2"><Counts consultation={consultation} t={t} /><button type="button" className="clinical-button min-h-9" onClick={() => onOpen(consultation)}>{t("consultations.actions.open")}</button></div>
          </article>
        ))}
      </div>
    </section>
  );
}
