"use client";

import { ArrowUpRight, FileText } from "lucide-react";
import Link from "next/link";

import { useAiAnalysisRuns } from "@/features/ai-analyses/hooks/use-ai-analysis-runs";
import { getReportBlocker } from "@/features/ai-analyses/run-report";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { mockClinicalReports } from "../mock-data/reports.mock";
import { localizeReport } from "../reports.copy";
import { ReportStatusBadge } from "./ReportStatusBadge";

export function PatientReportsSection({ accountType, locale, patientId, t }: { accountType: "DOCTOR" | "ESTABLISHMENT"; locale: Locale; patientId: string; t: TranslationFunction }) {
  const aiRuns = useAiAnalysisRuns(patientId);
  const live = (aiRuns.data ?? []).filter((run) => getReportBlocker(run) === null);
  const demos = mockClinicalReports.filter((report) => report.subject.id === patientId);
  const roleBase = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";

  return (
    <section className="surface-section p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><FileText className="h-5 w-5 text-[var(--institutional)]" strokeWidth={1.7} aria-hidden="true" /><div><h2 className="text-lg font-semibold text-[var(--ink)]">{t("reports.patient.title")}</h2><p className="mt-1 text-xs text-[var(--ink-faint)]">{t("reports.patient.help")}</p></div></div>{accountType === "ESTABLISHMENT" ? <Link href="/establishment/reports" className="clinical-button">{t("reports.patient.openCenter")}<ArrowUpRight size={14} aria-hidden="true" /></Link> : null}</div>
      {aiRuns.isLoading ? <div className="mt-5 h-20 animate-pulse rounded-[var(--radius-sm)] bg-[var(--panel-soft)]" aria-label={t("reports.patient.loading")} /> : null}
      <div className="mt-5 divide-y divide-[var(--line-soft)] rounded-[var(--radius-md)] border border-[var(--line)]">
        {live.map((run) => <article key={run.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="clinical-figure text-[0.68rem] font-semibold text-[var(--accent-dark)]" dir="ltr">{run.reportNumber ?? t("reports.common.pendingReference")}</p><p className="mt-1 text-sm font-semibold">{t(`aiAnalyses.pipelines.${run.pipeline}.name`)}</p><p className="mt-1 text-[0.66rem] text-[var(--text-secondary)]">{new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(run.decidedAt ?? run.updatedAt))}</p></div><div className="flex items-center gap-2"><ReportStatusBadge status={run.decisionStatus === "CORRECTED" ? "CORRECTED" : "FINAL"} t={t} /><Link href={`${roleBase}/ai-analyses/runs/${encodeURIComponent(run.id)}?patient=${encodeURIComponent(patientId)}`} className="clinical-button min-h-9">{t("reports.actions.open")}</Link></div></article>)}
        {demos.map((report) => <article key={report.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="clinical-figure text-[0.68rem] font-semibold text-[var(--accent-dark)]" dir="ltr">{report.identifier}</p><p className="mt-1 text-sm font-semibold">{localizeReport(report.title, locale)}</p><p className="mt-1 text-[0.66rem] text-[var(--text-secondary)]">{t("reports.common.demo")}</p></div><ReportStatusBadge status={report.status} t={t} /></article>)}
        {!aiRuns.isLoading && !live.length && !demos.length ? <p className="p-6 text-center text-xs text-[var(--text-secondary)]">{t("reports.patient.empty")}</p> : null}
      </div>
    </section>
  );
}

