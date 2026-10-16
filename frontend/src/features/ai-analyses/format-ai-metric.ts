import { type Locale } from "@/i18n";

import { type AiDatasetKey, type AiLimitationKey, type AiModelMetric } from "./ai-analyses.types";
import { datasetSizes } from "./ai-models.registry";
import { brainClassificationEvaluation } from "./brain-evaluation";
import { formatInterval, formatPercent, isolate } from "./evaluation-presentation";
import { breakhisEvaluation, nucleiDiceRangeByTissue } from "./pathology-evaluation";

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

/** The BreakHis test patients, as aiAnalyses.sheet.testPatients and the limitation quote them. */
export function testPatientsParams(locale: Locale): { benign: string; patients: string } {
  const integer = new Intl.NumberFormat(intlLocale(locale));
  return {
    benign: isolate(integer.format(breakhisEvaluation.benignPatients)),
    patients: isolate(integer.format(breakhisEvaluation.testPatients)),
  };
}

/** Parameters of aiAnalyses.limitations.<key> that quote a measured figure. */
export function limitationParams(limitation: AiLimitationKey, locale: Locale): Record<string, string> | undefined {
  switch (limitation) {
    case "lowerGliomaRecall":
      return { recall: formatPercent(brainClassificationEvaluation.perClass.glioma.recall, locale) };
    case "fewTestPatients":
      return testPatientsParams(locale);
    case "tissueDependent": {
      // Two decimals, as the Dice of the model sheet.
      const { max, min } = nucleiDiceRangeByTissue();
      const decimal = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2, minimumFractionDigits: 2 });
      return { max: isolate(decimal.format(max)), min: isolate(decimal.format(min)) };
    }
    default:
      return undefined;
  }
}
