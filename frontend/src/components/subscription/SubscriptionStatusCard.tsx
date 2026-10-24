import { BadgeCheck, Clock3, Lock, Repeat2, RotateCw } from "lucide-react";

import { type Locale } from "@/i18n";
import { type Entitlements } from "@/features/subscriptions/types/entitlements.types";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type SubscriptionContext,
  type SubscriptionPlan,
} from "@/types/subscription";

import { formatBillingDate } from "./subscription-format";

type SubscriptionStatusCardProps = {
  context: SubscriptionContext;
  currentPlan?: SubscriptionPlan;
  // The effective state of the subscription (a trial, an ended one...).
  entitlements?: Entitlements | null;
  locale: Locale;
  onChangePlan: () => void;
  onRenew: () => void;
  t: TranslationFunction;
};

const tones = {
  active: "border-t-[color:var(--success)]",
  ended: "border-t-[color:var(--danger)]",
  trial: "border-t-[color:var(--accent)]",
} as const;

// The subscription held: a paid one (renew, change plan), the free trial (its
// days left, subscribe), or one that has ended or was stopped (read-only mode,
// renew or choose again).
export function SubscriptionStatusCard({
  context,
  currentPlan,
  entitlements,
  locale,
  onChangePlan,
  onRenew,
  t,
}: SubscriptionStatusCardProps) {
  const status = entitlements?.status ?? context.subscriptionStatus;

  if (!currentPlan || !["ACTIVE", "TRIALING", "EXPIRED", "CANCELED"].includes(status)) {
    return null;
  }

  const end = formatBillingDate(entitlements?.expiresAt ?? context.currentPeriodEnd, locale) ?? "—";
  const start = formatBillingDate(context.currentPeriodStart, locale) ?? "—";
  const planName = t(currentPlan.name);
  const trial = status === "TRIALING";
  const ended = status === "EXPIRED" || status === "CANCELED";
  const tone = trial ? tones.trial : ended ? tones.ended : tones.active;
  const Icon = trial ? Clock3 : ended ? Lock : BadgeCheck;

  const label = trial
    ? t("subscription.statusCard.trialLabel")
    : status === "EXPIRED"
      ? t("subscription.statusCard.expiredLabel")
      : status === "CANCELED"
        ? t("subscription.statusCard.canceledLabel")
        : t("subscription.current.active");
  const title = trial
    ? t("subscription.statusCard.trialTitle", { plan: planName })
    : status === "EXPIRED"
      ? t("subscription.statusCard.expiredTitle", { end, plan: planName })
      : status === "CANCELED"
        ? t("subscription.statusCard.canceledTitle", { plan: planName })
        : `${t("subscription.current.plan")}: ${planName}`;
  const caption = trial
    ? t("subscription.statusCard.trialPeriod", { days: entitlements?.daysLeft ?? 0, end })
    : ended
      ? t("subscription.statusCard.readOnlyNote")
      : t("subscription.current.period", { end, start });

  return (
    <section
      data-subscription-status={status}
      className={cn(
        "flex flex-col gap-4 rounded-[var(--radius-md)] border border-t-2 border-[var(--border)] bg-[var(--surface)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between",
        tone,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="healix-mark">
          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
          <h2 className="mt-0.5 text-base font-semibold text-[var(--text-primary)]">{title}</h2>
          <p className="clinical-caption mt-0.5">{caption}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {status === "ACTIVE" ? (
          <button type="button" className="clinical-button" onClick={onChangePlan}>
            <Repeat2 size={16} strokeWidth={1.8} aria-hidden="true" />
            {t("subscription.current.changePlan")}
          </button>
        ) : null}
        {currentPlan.custom ? null : (
          <button type="button" className="clinical-button clinical-button-primary" onClick={onRenew}>
            <RotateCw size={16} strokeWidth={1.8} aria-hidden="true" />
            {trial
              ? t("subscription.statusCard.trialAction")
              : status === "CANCELED"
                ? t("subscription.cta.subscribe")
                : t("subscription.current.renew")}
          </button>
        )}
      </div>
    </section>
  );
}
