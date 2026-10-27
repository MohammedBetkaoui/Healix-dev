import { FileText, Pill } from "lucide-react";

import { getPatientDisplayName } from "@/features/prescriptions/utils/prescription-format";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type ConsultationListItem, type ConsultationStatus } from "../types/consultation.types";
import { truncateText } from "../utils/consultation-utils";

type Props = {
  consultations: ConsultationListItem[];
  locale: Locale;
  onOpen: (consultation: ConsultationListItem) => void;
  t: TranslationFunction;
};

const statusClass: Record<ConsultationStatus, string> = {
  DRAFT: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]",
  IN_PROGRESS: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  COMPLETED: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  CANCELED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
};

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function StatusBadge({ status, t }: { status: ConsultationStatus; t: TranslationFunction }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold ${statusClass[status]}`}>{t(`consultations.statuses.${status}`)}</span>;
}

function Counts({ consultation, t }: { consultation: ConsultationListItem; t: TranslationFunction }) {
  return <span className="flex items-center gap-3 text-[0.66rem] text-[var(--text-secondary)]"><span className="inline-flex items-center gap-1"><Pill size={12} aria-hidden="true" />{consultation.prescriptionCount}<span className="sr-only">{t("consultations.columns.prescriptions")}</span></span><span className="inline-flex items-center gap-1"><FileText size={12} aria-hidden="true" />{consultation.reportCount}<span className="sr-only">{t("consultations.columns.reports")}</span></span></span>;
}

export function ConsultationsTable({ consultations, locale, onOpen, t }: Props) {
  if (!consultations.length) {
    return <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center"><p className="text-sm font-semibold">{t("consultations.table.empty")}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{t("consultations.table.emptyHelp")}</p></section>;
  }
  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[52rem] text-start text-xs">
          <caption className="sr-only">{t("consultations.table.caption")}</caption>
          <thead className="bg-[var(--surface-muted)] text-[0.66rem] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]"><tr>{(["patient", "date", "doctor", "reason", "status"] as const).map((key) => <th key={key} className="px-3 py-3 text-start font-semibold" scope="col">{t(`consultations.columns.${key}`)}</th>)}<th className="px-3 py-3 text-end font-semibold" scope="col">{t("consultations.columns.actions")}</th></tr></thead>
          <tbody className="divide-y divide-[var(--line-soft)]">
            {consultations.map((consultation) => <tr key={consultation.id} className="align-middle hover:bg-[var(--surface-muted)]">
              <td className="px-3 py-3.5"><p className="font-semibold">{getPatientDisplayName(consultation.patient, locale)}</p>{consultation.patient.hospitalRecordNumber ? <p className="clinical-figure mt-1 text-[0.64rem] text-[var(--text-muted)]" dir="ltr">{consultation.patient.hospitalRecordNumber}</p> : null}</td>
              <td className="whitespace-nowrap px-3 py-3.5">{formatDate(consultation.occurredAt, locale)}</td>
              <td className="px-3 py-3.5"><p className="font-medium">{consultation.doctor.fullName}</p><p className="mt-1 text-[0.64rem] text-[var(--text-muted)]">{consultation.doctor.speciality}</p></td>
              <td className="max-w-64 px-3 py-3.5"><p>{consultation.chiefComplaint ? truncateText(consultation.chiefComplaint, 85) : t("consultations.common.notProvided")}</p>{consultation.primaryDiagnosis ? <p className="mt-1 text-[0.66rem] text-[var(--text-muted)]">{truncateText(consultation.primaryDiagnosis, 70)}</p> : null}</td>
              <td className="px-3 py-3.5"><StatusBadge status={consultation.status} t={t} /></td>
              <td className="px-3 py-3.5 text-end"><button type="button" className="clinical-button min-h-9" onClick={() => onOpen(consultation)}>{t("consultations.actions.open")}</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-[var(--line-soft)] md:hidden">
        {consultations.map((consultation) => <article key={consultation.id} className="p-4">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">{getPatientDisplayName(consultation.patient, locale)}</h2><p className="mt-1 text-[0.66rem] text-[var(--text-secondary)]">{formatDate(consultation.occurredAt, locale)} · {consultation.doctor.fullName}</p></div><StatusBadge status={consultation.status} t={t} /></div>
          <p className="mt-3 text-xs">{consultation.chiefComplaint ? truncateText(consultation.chiefComplaint, 100) : t("consultations.common.notProvided")}</p>
          <div className="mt-3 flex items-center justify-between gap-3"><Counts consultation={consultation} t={t} /><button type="button" className="clinical-button min-h-9" onClick={() => onOpen(consultation)}>{t("consultations.actions.open")}</button></div>
        </article>)}
      </div>
    </section>
  );
}
