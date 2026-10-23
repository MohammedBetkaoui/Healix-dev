"use client";

import { ArrowUpRight, FileText } from "lucide-react";
import Link from "next/link";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { usePatientReports } from "../hooks/use-reports";
import { reportCategoryKeys } from "../reports.copy";
import { getReportErrorKey } from "../utils/report-errors";
import { getAiRunHref } from "../utils/report-utils";
import { ReportStatusBadge } from "./ReportStatusBadge";

type PatientReportsSectionProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  locale: Locale;
  patientId: string;
  t: TranslationFunction;
};

// The reports of one patient: the same rows as the reports center
// (GET /reports/patients/:id), the current version of each.
export function PatientReportsSection({ accountType, locale, patientId, t }: PatientReportsSectionProps) {
  const reports = usePatientReports(patientId);
  const rows = reports.data ?? [];
  const centerHref = `${accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor"}/reports`;
  const formatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <section className="surface-section p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><FileText className="h-5 w-5 text-[var(--institutional)]" strokeWidth={1.7} aria-hidden="true" /><div><h2 className="text-lg font-semibold text-[var(--ink)]">{t("reports.patient.title")}</h2><p className="mt-1 text-xs text-[var(--ink-faint)]">{t("reports.patient.help")}</p></div></div><Link href={centerHref} className="clinical-button">{t("reports.patient.openCenter")}<ArrowUpRight size={14} aria-hidden="true" /></Link></div>
      {reports.isLoading ? <div className="mt-5 h-20 animate-pulse rounded-[var(--radius-sm)] bg-[var(--panel-soft)]" role="status" aria-busy="true" aria-label={t("reports.patient.loading")} /> : null}
      {reports.isError ? <p className="mt-5 text-xs text-[var(--danger-ink)]" role="alert">{t(`reports.errors.${getReportErrorKey(reports.error)}`)} <button type="button" className="clinical-link" onClick={() => void reports.refetch()}>{t("reports.actions.retry")}</button></p> : null}
      {reports.data ? (
        <div className="mt-5 divide-y divide-[var(--line-soft)] rounded-[var(--radius-md)] border border-[var(--line)]">
          {rows.map((report) => (
            <article key={report.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="clinical-figure text-[0.68rem] font-semibold text-[var(--accent-dark)]" dir="ltr">{report.number ?? t("reports.common.pendingReference")}</p>
                <p className="mt-1 text-sm font-semibold">{report.sourceType === "AI_ANALYSIS" ? t(reportCategoryKeys[report.category]) : report.title}</p>
                <p className="mt-1 text-[0.66rem] text-[var(--text-secondary)]">{formatter.format(new Date(report.effectiveDate))} · v{report.version}</p>
              </div>
              <div className="flex items-center gap-2">
                <ReportStatusBadge status={report.status} t={t} />
                {report.ai ? <Link href={getAiRunHref(report.ai, accountType)} className="clinical-button min-h-9">{t("reports.ai.openAnalysis")}</Link> : null}
                <Link href={`${centerHref}?report=${encodeURIComponent(report.id)}`} className="clinical-button min-h-9">{t("reports.actions.open")}</Link>
              </div>
            </article>
          ))}
          {!rows.length ? <p className="p-6 text-center text-xs text-[var(--text-secondary)]">{t("reports.patient.empty")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
