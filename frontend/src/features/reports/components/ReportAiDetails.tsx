import { BadgeCheck, BrainCircuit, Copy, Stethoscope } from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { type ClinicalReport } from "../types/report.types";

export function ReportAiDetails({ locale, onCopy, report, t }: { locale: Locale; onCopy: (value: string) => void; report: ClinicalReport; t: TranslationFunction }) {
  const ai = report.aiContext;
  if (!ai) return null;
  const percent = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 1, style: "percent" });

  return (
    <section className="space-y-4" aria-labelledby="ai-report-details">
      <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-4">
        <BrainCircuit size={19} className="mt-0.5 shrink-0 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
        <div><h3 id="ai-report-details" className="text-sm font-semibold text-[var(--text-primary)]">{t("reports.ai.title")}</h3><p className="mt-1 text-[0.7rem] leading-5 text-[var(--text-secondary)]">{t("reports.ai.disclaimer")}</p></div>
      </div>
      <dl className="grid gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-4 text-xs sm:grid-cols-2">
        <div><dt className="text-[var(--text-muted)]">{t("reports.ai.pipeline")}</dt><dd className="mt-1 font-semibold">{t(`aiAnalyses.pipelines.${ai.pipeline}.name`)}</dd></div>
        <div><dt className="text-[var(--text-muted)]">{t("reports.ai.model")}</dt><dd className="mt-1 font-semibold">{ai.modelName}{ai.modelVersion ? ` · ${ai.modelVersion}` : ""}</dd></div>
        <div><dt className="text-[var(--text-muted)]">{t("reports.ai.decision")}</dt><dd className="mt-1 inline-flex items-center gap-1.5 font-semibold text-[var(--success-ink)]"><BadgeCheck size={14} aria-hidden="true" />{t(`reports.ai.decisions.${ai.decisionStatus}`)}</dd></div>
        <div><dt className="text-[var(--text-muted)]">{t("reports.ai.validator")}</dt><dd className="mt-1 inline-flex items-center gap-1.5 font-semibold"><Stethoscope size={14} className="text-[var(--medical)]" aria-hidden="true" />{report.validator?.displayName[locale] ?? t("reports.common.notProvided")}</dd></div>
        {ai.modelChecksum ? <div className="sm:col-span-2"><dt className="text-[var(--text-muted)]">{t("reports.ai.checksum")}</dt><dd className="mt-1 flex items-center gap-2"><bdi dir="ltr" className="clinical-figure break-all font-semibold">{`${ai.modelChecksum.slice(0, 8)}…${ai.modelChecksum.slice(-6)}`}</bdi><button type="button" className="clinical-icon-button h-7 min-w-7" onClick={() => onCopy(ai.modelChecksum!)} aria-label={t("reports.actions.copyChecksum")}><Copy size={13} aria-hidden="true" /></button></dd></div> : null}
      </dl>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
        <table className="w-full text-xs">
          <thead className="bg-[var(--surface-muted)]"><tr><th scope="col" className="px-3 py-2.5 text-start font-semibold">{t("reports.ai.result")}</th><th scope="col" className="px-3 py-2.5 text-start font-semibold">{t("reports.ai.value")}</th><th scope="col" className="px-3 py-2.5 text-end font-semibold">{t("reports.ai.score")}</th></tr></thead>
          <tbody className="divide-y divide-[var(--line-soft)]">{ai.results.map((result) => <tr key={result.code}><td className="px-3 py-2.5 font-semibold">{result.label[locale]}</td><td className="px-3 py-2.5 text-[var(--text-secondary)]">{result.value}</td><td className="clinical-figure px-3 py-2.5 text-end">{result.score === undefined ? "—" : percent.format(result.score)}</td></tr>)}</tbody>
        </table>
      </div>
      {ai.clinicianImpression ? <div className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h4 className="text-xs font-semibold">{t("reports.ai.clinicianImpression")}</h4><p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{ai.clinicianImpression}</p></div> : null}
    </section>
  );
}

