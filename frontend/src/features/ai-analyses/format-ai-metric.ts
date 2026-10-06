import { type Locale } from "@/i18n";

import { type AiModelMetric } from "./ai-analyses.types";

// Two decimals, as the model team gives them ("≈ 99,27 %", "≈ 0,90").
export function formatAiMetricValue(metric: AiModelMetric, locale: Locale) {
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: metric.unit === "percent" ? "percent" : "decimal",
  }).format(metric.value);

  return metric.approximate ? `≈ ${formatted}` : formatted;
}
