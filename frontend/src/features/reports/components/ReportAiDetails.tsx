import { BadgeCheck, BrainCircuit, Copy, ExternalLink, Stethoscope } from "lucide-react";
import Link from "next/link";

import { findModel } from "@/features/ai-analyses/ai-models.registry";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type ClinicalReport } from "../types/report.types";
import { aiResults, getAiRunHref } from "../utils/report-utils";

type ReportAiDetailsProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  locale: Locale;
  onCopy: (value: string) => void;
  report: ClinicalReport;
  t: TranslationFunction;
};

export function ReportAiDetails({ accountType, locale, onCopy, report, t }: ReportAiDetailsProps) {
  const ai = report.ai;
  if (!ai) return null;
  const percent = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 1, style: "percent" });
  const model = findModel(ai.classificationModelId ?? ai.segmentationModelId);
  const modelName = model?.architecture ?? ai.classificationModelId ?? ai.segmentationModelId ?? "—";
  const results = aiResults(ai);
  const checksum = ai.weightsSha256;

  return (
    <section className="space-y-4" aria-labelledby="ai-report-details">
      <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-4">
        <BrainCircuit size={19} className="mt-0.5 shrink-0 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
        <div><h3 id="ai-report-details" className="text-sm font-semibold text-[var(--text-primary)]">{t("reports.ai.title")}</h3><p className="mt-1 text-[0.7rem] leading-5 text-[var(--text-secondary)]">{t("reports.ai.disclaimer")}</p><Link href={getAiRunHref(ai, accountType)} className="clinical-link mt-2 inline-flex items-center gap-1.5 text-[0.7rem] font-semibold">{t("reports.ai.openAnalysis")}<ExternalLink size={12} aria-hidden="true" /></Link></div>
      </div>
      <dl className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4 text-xs sm:grid-cols-2">
        <div><dt className="text-[var(--text-muted)]">{t("reports.ai.pipeline")}</dt><dd className="mt-1 font-semibold">{t(`aiAnalyses.pipelines.${ai.pipeline}.name`)}</dd></div>
        <div><dt className="text-[var(--text-muted)]">{t("reports.ai.model")}</dt><dd className="mt-1 font-semibold">{modelName}{model?.version ? ` · ${model.version}` : ""}</dd></div>
        {ai.decisionStatus === "VALIDATED" || ai.decisionStatus === "CORRECTED" ? <div><dt className="text-[var(--text-muted)]">{t("reports.ai.decision")}</dt><dd className="mt-1 inline-flex items-center gap-1.5 font-semibold text-[var(--success-ink)]"><BadgeCheck size={14} aria-hidden="true" />{t(`reports.ai.decisions.${ai.decisionStatus}`)}</dd></div> : null}
        <div><dt className="text-[var(--text-muted)]">{t("reports.ai.validator")}</dt><dd className="mt-1 inline-flex items-center gap-1.5 font-semibold"><Stethoscope size={14} className="text-[var(--medical)]" aria-hidden="true" />{report.validator?.fullName ?? report.author.fullName}</dd></div>
        {checksum ? <div className="sm:col-span-2"><dt className="text-[var(--text-muted)]">{t("reports.ai.checksum")}</dt><dd className="mt-1 flex items-center gap-2"><bdi dir="ltr" className="clinical-figure break-all font-semibold">{`${checksum.slice(0, 8)}…${checksum.slice(-6)}`}</bdi><button type="button" className="clinical-icon-button h-7 min-w-7" onClick={() => onCopy(checksum)} aria-label={t("reports.actions.copyChecksum")}><Copy size={13} aria-hidden="true" /></button></dd></div> : null}
      </dl>
      {results.length ? (
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
          <table className="w-full text-xs">
            <thead className="bg-[var(--surface-muted)]"><tr><th scope="col" className="px-3 py-2.5 text-start font-semibold">{t("reports.ai.result")}</th><th scope="col" className="px-3 py-2.5 text-start font-semibold">{t("reports.ai.value")}</th><th scope="col" className="px-3 py-2.5 text-end font-semibold">{t("reports.ai.score")}</th></tr></thead>
            <tbody className="divide-y divide-[var(--line-soft)]">{results.map((result) => <tr key={result.code}><td className="px-3 py-2.5 font-semibold">{result.label}</td><td className="px-3 py-2.5 text-[var(--text-secondary)]">{result.value}</td><td className="clinical-figure px-3 py-2.5 text-end">{result.score === undefined ? "—" : percent.format(result.score)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
      {ai.clinicianImpression ? <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h4 className="text-xs font-semibold">{t("reports.ai.clinicianImpression")}</h4><p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{ai.clinicianImpression}</p></div> : null}
    </section>
  );
}
