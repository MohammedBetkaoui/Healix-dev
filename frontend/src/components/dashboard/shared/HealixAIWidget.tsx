import { WorkspaceLink as Link } from "../layout/WorkspaceLink";
import { ArrowRight, BrainCircuit } from "lucide-react";
import type { TranslationFunction } from "@/lib/i18n";

type AIActivity = {
  specialties: readonly { key: string; count: number }[];
  completed?: number;
  pending?: number;
  review?: number;
};

export function HealixAIWidget({ activity, t, formatNumber, periodLabel }: {
  activity: AIActivity;
  t: TranslationFunction;
  formatNumber: (value: number) => string;
  periodLabel?: string;
}) {
  const total = activity.specialties.reduce((sum, item) => sum + item.count, 0);
  const statusLabels = [
    activity.completed === undefined ? null : t("dashboard.clinical.ai.completed", { count: formatNumber(activity.completed) }),
    activity.pending === undefined ? null : t("dashboard.clinical.ai.pending", { count: formatNumber(activity.pending) }),
  ].filter((label) => label !== null);
  return (
    <section className="surface-section ai-widget overflow-hidden" aria-labelledby="ai-heading">
      <div className="clinical-section-heading">
        <div><h2 id="ai-heading">{t("dashboard.clinical.ai.title")}</h2><p className="clinical-caption mt-1">{t("dashboard.clinical.ai.subtitle")}</p></div>
        <BrainCircuit size={22} strokeWidth={1.7} aria-hidden="true" />
      </div>
      <div className="px-5 py-4">
        <p className="mb-4 flex items-baseline gap-2"><span className="text-2xl font-semibold">{formatNumber(total)}</span><span className="clinical-caption">{periodLabel ?? t("dashboard.clinical.ai.today")}</span></p>
        <dl className="grid grid-cols-2 gap-x-5 gap-y-3">{activity.specialties.map((item) => <div key={item.key} className="flex items-start justify-between gap-2 text-xs">
          <dt className="text-[var(--text-secondary)]">{t(`dashboard.clinical.ai.${item.key}`)}</dt><dd className="font-semibold">{formatNumber(item.count)}</dd>
        </div>)}</dl>
        {activity.review !== undefined || statusLabels.length > 0 ? (
          <div className="mt-4 border-t border-[var(--line-soft)] pt-3">
            {activity.review !== undefined ? <p className="text-xs font-medium text-[var(--warning-ink)]">{t("dashboard.clinical.ai.review", { count: formatNumber(activity.review) })}</p> : null}
            {statusLabels.length > 0 ? <p className="clinical-caption mt-1">{statusLabels.join(" · ")}</p> : null}
          </div>
        ) : null}
        <Link href="#analyses" className="clinical-link mt-2">{t("dashboard.clinical.actions.ai")}<ArrowRight size={15} strokeWidth={1.8} className="clinical-directional" /></Link>
        <p className="clinical-caption mt-1">{t("dashboard.clinical.ai.disclaimer")}</p>
      </div>
    </section>
  );
}
