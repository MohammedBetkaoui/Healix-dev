import { ArrowRight, BrainCircuit } from "lucide-react";

import { pendingAge } from "@/features/ai-analyses/runs-tracking";
import { shareOf } from "@/features/dashboard/dashboard-overview";
import { type DashboardOverview } from "@/features/dashboard/dashboard.types";
import type { TranslationFunction } from "@/lib/i18n";

import { WorkspaceLink as Link } from "../layout/WorkspaceLink";

// The AI analyses of the period: awaiting a decision, decided (validated,
// corrected, rejected), uncertain results. The latest ones are listed in the
// table next to it.
export function HealixAIWidget({ ai, days, trackingHref, t, formatNumber, formatPercent }: {
  ai: DashboardOverview["aiAnalyses"];
  days: number;
  trackingHref: string;
  t: TranslationFunction;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
}) {
  const age = pendingAge(ai.pending.oldestAgeHours);
  const uncertainShare = shareOf(ai.uncertain.count, ai.uncertain.total);
  const decided = [
    { count: ai.validated, key: "validated" },
    { count: ai.corrected, key: "corrected" },
    { count: ai.rejected, key: "rejected" },
  ] as const;

  return (
    <section className="surface-section ai-widget overflow-hidden" aria-labelledby="ai-heading">
      <div className="clinical-section-heading">
        <div>
          <h2 id="ai-heading">{t("dashboard.clinical.ai.title")}</h2>
          <p className="clinical-caption mt-1">{t("dashboard.clinical.ai.subtitle", { days: formatNumber(days) })}</p>
        </div>
        <BrainCircuit size={22} strokeWidth={1.7} aria-hidden="true" />
      </div>
      <div className="px-5 py-4">
        <p className="mb-4 flex items-baseline gap-2">
          <span className="clinical-figure text-2xl font-semibold">{formatNumber(ai.total)}</span>
          <span className="clinical-caption">{t("dashboard.clinical.ai.total", { days: formatNumber(days) })}</span>
        </p>
        <div className="grid gap-3">
          <dl className="flex items-start justify-between gap-2 text-sm">
            <dt>
              <span className="font-medium text-[var(--warning-ink)]">{t("dashboard.clinical.ai.pending")}</span>
              {age ? (
                <span className="clinical-caption block">
                  {age.unit === "days"
                    ? t("dashboard.clinical.ai.oldestDays", { count: formatNumber(age.value) })
                    : t("dashboard.clinical.ai.oldestHours", { count: formatNumber(age.value) })}
                </span>
              ) : null}
            </dt>
            <dd className="clinical-figure font-semibold">{formatNumber(ai.pending.count)}</dd>
          </dl>
          <dl className="grid grid-cols-3 gap-3 border-t border-[var(--line-soft)] pt-3 text-xs">
            {decided.map((item) => (
              <div key={item.key}>
                <dt className="text-[var(--text-secondary)]">{t(`dashboard.clinical.ai.${item.key}`)}</dt>
                <dd className="clinical-figure mt-1 text-base font-semibold">{formatNumber(item.count)}</dd>
              </div>
            ))}
          </dl>
          <dl className="border-t border-[var(--line-soft)] pt-3 text-xs">
            <dt className="text-[var(--text-secondary)]">
              {t("dashboard.clinical.ai.uncertain", { threshold: formatPercent(ai.uncertain.threshold) })}
            </dt>
            <dd className="mt-1">
              {uncertainShare === null ? (
                <span className="text-[var(--text-secondary)]">{t("dashboard.clinical.ai.uncertainNone")}</span>
              ) : (
                <span className="clinical-figure">
                  {t("dashboard.clinical.ai.uncertainValue", {
                    count: formatNumber(ai.uncertain.count),
                    percent: formatPercent(uncertainShare),
                    total: formatNumber(ai.uncertain.total),
                  })}
                </span>
              )}
            </dd>
          </dl>
        </div>
        <Link href={trackingHref} className="clinical-link mt-4">{t("dashboard.clinical.ai.tracking")}<ArrowRight size={15} strokeWidth={1.8} className="clinical-directional" /></Link>
        <p className="clinical-caption mt-1">{t("dashboard.clinical.ai.disclaimer")}</p>
      </div>
    </section>
  );
}
