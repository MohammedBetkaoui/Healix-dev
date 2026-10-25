"use client";

import { Info } from "lucide-react";

import { type CardioVolumeEvaluation } from "@/features/ai-analyses/ai-analyses.types";
import { formatEvaluationDate, isolate } from "@/features/ai-analyses/evaluation-presentation";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

type VolumeMetricsTableProps = {
  /** undefined while loading; null when no evaluation describes these weights. */
  evaluation: CardioVolumeEvaluation | null | undefined;
  loading: boolean;
  locale: Locale;
  t: TranslationFunction;
};

/**
 * The agreement of the ejection fractions the service measures with the ACDC truth, on the test patients,
 * for the weights of an analysis only (mean absolute error, bias, 95 % limits of agreement, Pearson's r).
 */
export function VolumeMetricsTable({ evaluation, loading, locale, t }: VolumeMetricsTableProps) {
  const intl = locale === "ar" ? "ar-DZ" : "fr-DZ";

  if (loading) {
    return (
      <p role="status" className="text-sm text-[var(--text-secondary)]">
        {t("aiAnalyses.run.volumetry.metrics.loading")}
      </p>
    );
  }
  if (!evaluation) {
    return (
      <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
        <Info size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
        {t("aiAnalyses.run.volumetry.metrics.none")}
      </p>
    );
  }

  const one = new Intl.NumberFormat(intl, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const two = new Intl.NumberFormat(intl, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const signed = new Intl.NumberFormat(intl, { maximumFractionDigits: 1, minimumFractionDigits: 1, signDisplay: "exceptZero" });
  const integer = new Intl.NumberFormat(intl);
  const cell = "py-1.5 pe-3 text-end font-[family-name:var(--font-auth-mono)] tabular-nums";

  return (
    <>
      <p className="max-w-3xl text-xs leading-5 text-[var(--text-secondary)]">
        {t("aiAnalyses.run.volumetry.metrics.service", {
          date: formatEvaluationDate(evaluation.generatedAt.slice(0, 10), locale),
          patients: isolate(integer.format(evaluation.nPatients)),
        })}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] max-w-3xl text-sm" data-volume-metrics="true">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
              <th scope="col" className="py-1.5 pe-3 text-start font-medium">{t("aiAnalyses.run.volumetry.metrics.measure")}</th>
              <th scope="col" className="py-1.5 pe-3 text-end font-medium">{t("aiAnalyses.run.volumetry.metrics.mae")}</th>
              <th scope="col" className="py-1.5 pe-3 text-end font-medium">{t("aiAnalyses.run.volumetry.metrics.bias")}</th>
              <th scope="col" className="py-1.5 pe-3 text-end font-medium">{t("aiAnalyses.run.volumetry.metrics.limits")}</th>
              <th scope="col" className="py-1.5 pe-3 text-end font-medium">{t("aiAnalyses.run.volumetry.metrics.correlation")}</th>
              <th scope="col" className="py-1.5 text-end font-medium">{t("aiAnalyses.run.volumetry.metrics.patients")}</th>
            </tr>
          </thead>
          <tbody>
            {(["lvef", "rvef"] as const).map((key) => {
              const figures = evaluation[key];
              return (
                <tr key={key} className="border-b border-[var(--line-soft)]">
                  <th scope="row" className="py-1.5 pe-3 text-start font-normal">{t(`aiAnalyses.run.volumetry.metrics.${key}`)}</th>
                  <td className={cell}><bdi dir="ltr">{one.format(figures.mae)}</bdi></td>
                  <td className={cell}><bdi dir="ltr">{signed.format(figures.bias)}</bdi></td>
                  <td className={cell}>
                    <bdi dir="ltr">
                      {figures.limitsOfAgreement
                        ? `${signed.format(figures.limitsOfAgreement[0])} / ${signed.format(figures.limitsOfAgreement[1])}`
                        : "—"}
                    </bdi>
                  </td>
                  <td className={cell}><bdi dir="ltr">{figures.pearsonR === null ? "—" : two.format(figures.pearsonR)}</bdi></td>
                  <td className="py-1.5 text-end font-[family-name:var(--font-auth-mono)] tabular-nums"><bdi dir="ltr">{integer.format(figures.n)}</bdi></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
