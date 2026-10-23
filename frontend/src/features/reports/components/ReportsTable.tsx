import { Eye, FolderOpen, MoreHorizontal } from "lucide-react";
import Link from "next/link";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { reportSourceKeys } from "../reports.copy";
import { type ReportListItem } from "../types/report.types";
import { getReportPatientName } from "../utils/report-utils";
import { ReportStatusBadge } from "./ReportStatusBadge";
import { ReportTypeBadge } from "./ReportTypeBadge";

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

type ReportsTableProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  locale: Locale;
  onOpen: (report: ReportListItem) => void;
  reports: ReportListItem[];
  t: TranslationFunction;
};

const patientHref = (accountType: ReportsTableProps["accountType"], patientId: string) =>
  `${accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor"}/patients/${encodeURIComponent(patientId)}?tab=reports`;

export function ReportsTable({ accountType, locale, onOpen, reports, t }: ReportsTableProps) {
  if (!reports.length) {
    return <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-6 py-14 text-center"><p className="text-sm font-semibold text-[var(--text-primary)]">{t("reports.table.empty")}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{t("reports.table.emptyHelp")}</p></section>;
  }
  const person = (report: ReportListItem) => report.validator?.fullName ?? report.author.fullName;

  return (
    <section className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[64rem] text-start text-xs">
          <caption className="sr-only">{t("reports.table.caption")}</caption>
          <thead className="bg-[var(--surface-muted)] text-[0.66rem] font-semibold uppercase tracking-[0.05em] text-[var(--text-muted)]">
            <tr>{(["reference", "patient", "type", "date", "author", "source", "status", "version"] as const).map((key) => <th key={key} scope="col" className="px-3 py-3 text-start font-semibold">{t(`reports.columns.${key}`)}</th>)}<th scope="col" className="px-3 py-3 text-end font-semibold">{t("reports.columns.actions")}</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--line-soft)]">
            {reports.map((report) => (
              <tr key={report.id} className="align-middle transition hover:bg-[var(--surface-muted)]">
                <td className="px-3 py-3.5"><button type="button" className="clinical-figure text-start font-semibold text-[var(--accent-dark)] hover:underline" onClick={() => onOpen(report)}><bdi dir="ltr">{report.number ?? t("reports.common.pendingReference")}</bdi></button></td>
                <td className="px-3 py-3.5"><p className="font-semibold text-[var(--text-primary)]">{getReportPatientName(report.patient, locale)}</p>{report.patient.hospitalRecordNumber ? <p className="clinical-figure mt-1 text-[0.64rem] text-[var(--text-muted)]" dir="ltr">{report.patient.hospitalRecordNumber}</p> : null}</td>
                <td className="max-w-52 px-3 py-3.5"><ReportTypeBadge category={report.category} t={t} />{report.sourceType === "AI_ANALYSIS" ? null : <p className="mt-1.5 truncate text-[0.65rem] text-[var(--text-secondary)]">{report.title}</p>}</td>
                <td className="whitespace-nowrap px-3 py-3.5 text-[var(--text-secondary)]">{formatDate(report.effectiveDate, locale)}</td>
                <td className="px-3 py-3.5"><p className="whitespace-nowrap font-medium">{person(report)}</p></td>
                <td className="px-3 py-3.5"><p className="whitespace-nowrap text-[var(--text-secondary)]">{t(reportSourceKeys[report.sourceType])}</p></td>
                <td className="px-3 py-3.5"><ReportStatusBadge status={report.status} t={t} /></td>
                <td className="px-3 py-3.5"><span className="clinical-figure font-semibold" dir="ltr">v{report.version}</span>{report.isAmendment ? <p className="mt-1 whitespace-nowrap text-[0.62rem] text-[var(--text-muted)]">{t("reports.common.replaces", { version: report.version - 1 })}</p> : null}</td>
                <td className="px-3 py-3.5 text-end"><button type="button" className="clinical-button min-h-9 whitespace-nowrap" onClick={() => onOpen(report)}><Eye size={14} strokeWidth={1.8} aria-hidden="true" />{t("reports.actions.open")}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[var(--line-soft)] md:hidden">
        {reports.map((report) => (
          <article key={report.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="clinical-figure truncate text-[0.7rem] font-semibold text-[var(--accent-dark)]" dir="ltr">{report.number ?? t("reports.common.pendingReference")}</p><h2 className="mt-1 truncate text-sm font-semibold">{getReportPatientName(report.patient, locale)}</h2><p className="mt-1 text-[0.66rem] text-[var(--text-secondary)]">{formatDate(report.effectiveDate, locale)} · {person(report)}</p></div>
              <ReportStatusBadge status={report.status} t={t} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2"><ReportTypeBadge category={report.category} t={t} /><span className="clinical-figure ms-auto text-[0.68rem] font-semibold" dir="ltr">v{report.version}</span></div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--line-soft)] pt-3">
              <Link href={patientHref(accountType, report.patient.id)} className="clinical-button min-h-9 px-2.5" aria-label={t("reports.actions.patientFile")}><FolderOpen size={14} aria-hidden="true" /><span className="sr-only sm:not-sr-only">{t("reports.actions.patientFile")}</span></Link>
              <button type="button" className="clinical-button min-h-9" onClick={() => onOpen(report)}><MoreHorizontal size={15} aria-hidden="true" />{t("reports.actions.open")}</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
