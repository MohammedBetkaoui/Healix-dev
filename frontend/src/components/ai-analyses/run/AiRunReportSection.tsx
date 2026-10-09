"use client";

import { FileDown, TriangleAlert } from "lucide-react";
import { useId } from "react";

import { type AiAnalysisRun } from "@/features/ai-analyses/ai-analyses.types";
import { isolate } from "@/features/ai-analyses/evaluation-presentation";
import { useDownloadAiReport } from "@/features/ai-analyses/hooks/use-download-ai-report";
import { getReportBlocker, getReportErrorKey } from "@/features/ai-analyses/run-report";
import { getVerificationRequiredMessage } from "@/lib/api/get-mutation-error-message";
import { type TranslationFunction } from "@/lib/i18n";

type AiRunReportSectionProps = {
  patientId: string;
  run: AiAnalysisRun;
  t: TranslationFunction;
};

// The official PDF report: downloadable once the physician has validated or
// corrected the result; otherwise says what is missing. The PDF itself is in
// French whatever the interface language.
export function AiRunReportSection({ patientId, run, t }: AiRunReportSectionProps) {
  const headingId = useId();
  const download = useDownloadAiReport(patientId, run.id);
  const blocker = getReportBlocker(run);
  const reportNumber = run.reportNumber ?? download.data ?? null;
  const errorMessage = download.isError
    ? getVerificationRequiredMessage(download.error, t) ??
      t(`aiAnalyses.report.errors.${getReportErrorKey(download.error)}`)
    : null;

  return (
    <section aria-labelledby={headingId} className="surface-section p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h2 id={headingId} className="text-base font-semibold text-[var(--text-primary)]">
            {t("aiAnalyses.report.title")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
            {blocker ? t(`aiAnalyses.report.blockers.${blocker}`) : t("aiAnalyses.report.description")}
          </p>
          {blocker ? null : <p className="mt-1 text-xs text-[var(--text-secondary)]">{t("aiAnalyses.report.frenchOnly")}</p>}
          {reportNumber ? (
            <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
              {t("aiAnalyses.report.number", { number: isolate(reportNumber) })}
            </p>
          ) : null}
        </div>
        {blocker ? null : (
          <button
            type="button"
            className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={download.isPending}
            onClick={() => download.mutate()}
          >
            <FileDown size={16} strokeWidth={1.8} aria-hidden="true" />
            {download.isPending ? t("aiAnalyses.report.downloading") : t("aiAnalyses.report.download")}
          </button>
        )}
      </div>
      {errorMessage ? (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
          <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
