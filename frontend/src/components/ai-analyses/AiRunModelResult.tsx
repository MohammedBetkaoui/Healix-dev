import { type AiAnalysisRun } from "@/features/ai-analyses/ai-analyses.types";
import { isolate } from "@/features/ai-analyses/evaluation-presentation";
import { formatScore } from "@/features/ai-analyses/pathology-presentation";
import { getModelLabel, getModelLabels } from "@/features/ai-analyses/run-decision";
import { sortPredictions } from "@/features/ai-analyses/run-presentation";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type AiRunModelResultProps = {
  run: Pick<
    AiAnalysisRun,
    "decisionThreshold" | "malignancyScore" | "modelDecision" | "modelLabel" | "pipeline" | "predictions" | "status"
  > &
    Partial<Pick<AiAnalysisRun, "modelLabels">>;
  locale: Locale;
  /** Shown when the model gave nothing (failed run…). */
  empty: string;
  t: TranslationFunction;
  figureClassName?: string;
};

// The model's answer in a list cell, per chain: the brain top class and its
// probability, the BreakHis result and its score (never a percentage), or
// the nuclei map, which has no class, the ECG classes at or above their
// threshold (possibly none).
export function AiRunModelResult({ empty, figureClassName, locale, run, t }: AiRunModelResultProps) {
  const figure = cn("font-[family-name:var(--font-auth-mono)] tabular-nums", figureClassName);

  if (run.pipeline === "pathology-nuclei") {
    return <>{run.status === "SUCCEEDED" ? t("aiAnalyses.record.nucleiMap") : empty}</>;
  }

  if (run.pipeline === "cardio-ecg") {
    if (run.status !== "SUCCEEDED") return <>{empty}</>;
    const labels = getModelLabels(run) ?? [];
    return <>{labels.length > 0 ? labels.map((label) => t(`aiAnalyses.classes.${label}`)).join(", ") : t("aiAnalyses.record.ecgNone")}</>;
  }

  if (run.pipeline === "pathology-breast") {
    const label = getModelLabel({ ...run, predictions: null });
    if (!label) return <>{empty}</>;
    return (
      <>
        {t(`aiAnalyses.classes.${label}`)}
        {run.malignancyScore !== null ? (
          <>
            {" "}
            <span className={figure}>
              {t("aiAnalyses.record.score", { value: isolate(formatScore(run.malignancyScore, locale, run.decisionThreshold ?? undefined)) })}
            </span>
          </>
        ) : null}
      </>
    );
  }

  const top = sortPredictions(run.predictions ?? [])[0];
  if (!top) return <>{empty}</>;
  const percent = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 1, style: "percent" });
  return (
    <>
      {t(`aiAnalyses.classes.${top.label}`)}{" "}
      <bdi dir="ltr" className={figure}>{percent.format(top.probability)}</bdi>
    </>
  );
}
