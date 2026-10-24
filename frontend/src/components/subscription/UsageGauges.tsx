import { Gauge } from "lucide-react";

import {
  getGaugeState,
  quotaGauges,
  type GaugeState,
} from "@/features/subscriptions/utils/entitlements-presentation";
import { type Entitlements } from "@/features/subscriptions/types/entitlements.types";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const fillClass: Record<GaugeState["tone"], string> = {
  danger: "bg-[var(--danger)]",
  ok: "bg-[var(--accent)]",
  unlimited: "bg-[var(--border-strong)]",
  warning: "bg-[var(--warning)]",
};

const valueClass: Record<GaugeState["tone"], string> = {
  danger: "text-[var(--danger-ink)]",
  ok: "text-[var(--text-primary)]",
  unlimited: "text-[var(--text-primary)]",
  warning: "text-[var(--warning-ink)]",
};

type UsageGaugeProps = {
  label: string;
  state: GaugeState;
  t: TranslationFunction;
};

// One quota: the number used out of the limit, and a bar that is orange from
// 80 % and red at 100 %. An unlimited quota shows the count alone.
export function UsageGauge({ label, state, t }: UsageGaugeProps) {
  const text =
    state.limit === null
      ? t("subscription.usage.unlimited", { used: state.used })
      : t("subscription.usage.ofLimit", { limit: state.limit, used: state.used });

  return (
    <div className="operational-metric" data-tone={state.tone}>
      <div className="flex items-baseline justify-between gap-2">
        <dt className="text-xs font-medium text-[var(--text-secondary)]">{label}</dt>
        <dd className={cn("text-sm font-semibold tabular-nums", valueClass[state.tone])}>
          <bdi dir="ltr">{text}</bdi>
        </dd>
      </div>
      {state.limit === null ? null : (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={state.limit}
          aria-valuenow={Math.min(state.used, state.limit)}
          aria-valuetext={text}
          className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]"
        >
          <div
            className={cn("h-full rounded-full transition-[width]", fillClass[state.tone])}
            style={{ width: `${state.percent}%` }}
          />
        </div>
      )}
      {state.tone === "warning" || state.tone === "danger" ? (
        <p className={cn("mt-2 text-xs font-medium", valueClass[state.tone])}>
          {t(`subscription.usage.tone.${state.tone}`)}
        </p>
      ) : null}
    </div>
  );
}

type UsageGaugesProps = {
  entitlements: Entitlements;
  // The doctors gauge is for an establishment's team. A doctor in private
  // practice is the only doctor of their plan: "1 / 1, quota reached" in red
  // would alarm for nothing, so the page leaves it out for them.
  showDoctors?: boolean;
  t: TranslationFunction;
};

// The usage of the plan, for the subscription page: AI analyses of the month
// (of the whole trial during a trial), active patients, doctors.
export function UsageGauges({ entitlements, showDoctors = true, t }: UsageGaugesProps) {
  const allPipelines = entitlements.quotas.aiPipelines === null;
  const gauges = quotaGauges.filter(({ key }) => showDoctors || key !== "maxDoctors");

  return (
    <section
      aria-labelledby="subscription-usage-heading"
      className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="clinical-section-heading border-b border-[var(--line-soft)]">
        <div className="min-w-0">
          <h2 id="subscription-usage-heading" className="flex items-center gap-2 text-[var(--text-primary)]">
            <Gauge size={17} strokeWidth={1.8} aria-hidden="true" />
            {t("subscription.usage.title")}
          </h2>
          <p className="clinical-caption mt-0.5 max-w-2xl">
            {entitlements.trial
              ? t("subscription.usage.captionTrial")
              : t("subscription.usage.caption")}
          </p>
        </div>
      </div>
      <dl className="operational-metrics">
        {gauges.map(({ key, usage }) => (
          <UsageGauge
            key={key}
            label={t(
              entitlements.trial && key === "aiAnalysesPerMonth"
                ? "subscription.usage.labels.aiAnalysesTrial"
                : `subscription.usage.labels.${key}`,
            )}
            state={getGaugeState(usage(entitlements), entitlements.quotas[key])}
            t={t}
          />
        ))}
      </dl>
      <p className="border-t border-[var(--line-soft)] bg-[var(--surface-muted)] px-5 py-3 text-xs text-[var(--text-secondary)]">
        {allPipelines
          ? t("subscription.usage.pipelines.all")
          : t("subscription.usage.pipelines.limited")}
      </p>
    </section>
  );
}
