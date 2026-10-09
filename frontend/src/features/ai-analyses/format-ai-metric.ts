import { type Locale } from "@/i18n";

import { type AiDatasetKey, type AiLimitationKey, type AiModelMetric } from "./ai-analyses.types";
import { datasetSizes } from "./ai-models.registry";
import { brainClassificationEvaluation } from "./brain-evaluation";
import { formatInterval, formatPercent } from "./evaluation-presentation";

const intlLocale = (locale: Locale) => (locale === "ar" ? "ar-DZ" : "fr-DZ");

// Two decimals, as the model team gives them ("≈ 99,27 %", "≈ 0,90").
export function formatAiMetricValue(metric: AiModelMetric, locale: Locale) {
  const formatted = new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: metric.unit === "percent" ? "percent" : "decimal",
  }).format(metric.value);

  return metric.approximate ? `≈ ${formatted}` : formatted;
}

/** Bounds of the metric's 95 % interval, or null when it has none. */
export function formatAiMetricInterval(metric: AiModelMetric, locale: Locale): string | null {
  return metric.ci95 ? formatInterval(metric.ci95, metric.unit, locale) : null;
}

/** Parameters of aiAnalyses.datasets.<key>: its number of test images, when known. */
export function datasetLabelParams(dataset: AiDatasetKey, locale: Locale): { count: string } | undefined {
  const size = datasetSizes[dataset];
  return size === undefined ? undefined : { count: new Intl.NumberFormat(intlLocale(locale)).format(size) };
}

/** Parameters of aiAnalyses.limitations.<key> that quote a measured figure. */
export function limitationParams(limitation: AiLimitationKey, locale: Locale): Record<string, string> | undefined {
  return limitation === "lowerGliomaRecall"
    ? { recall: formatPercent(brainClassificationEvaluation.perClass.glioma.recall, locale) }
    : undefined;
}
