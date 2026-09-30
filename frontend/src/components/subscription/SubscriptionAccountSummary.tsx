import {
  BadgeCheck,
  CalendarClock,
  CreditCard,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type SubscriptionContext,
  type SubscriptionPlan,
} from "@/types/subscription";

import { formatBillingDate } from "./subscription-format";

type SubscriptionAccountSummaryProps = {
  context: SubscriptionContext;
  currentPlan?: SubscriptionPlan;
  locale: Locale;
  t: TranslationFunction;
};

type SummaryTone = "success" | "warning" | "danger" | "neutral";

const toneDot: Record<SummaryTone, string> = {
  danger: "bg-[var(--danger)]",
  neutral: "bg-[var(--border-strong)]",
  success: "bg-[var(--success)]",
  warning: "bg-[var(--warning)]",
};

function SummaryItem({
  hint,
  icon: Icon,
  label,
  tone,
  value,
}: {
  hint: string;
  icon: LucideIcon;
  label: string;
  tone?: SummaryTone;
  value: string;
}) {
  return (
    <div className="operational-metric">
      <dt className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--text-secondary)]">
        {label}
        <Icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
      </dt>
      <dd className="mt-3">
        <p className="flex items-center gap-2 text-[.95rem] font-semibold text-[var(--text-primary)]">
          {tone ? (
            <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", toneDot[tone])} />
          ) : null}
          <span className="min-w-0 truncate">{value}</span>
        </p>
        <p className="clinical-caption mt-1">{hint}</p>
      </dd>
    </div>
  );
}

function getAccountTone(status: SubscriptionContext["accountStatus"]): SummaryTone {
  if (status === "ACTIVE" || status === "VERIFIED_NO_PLAN") return "success";
  if (status === "SUSPENDED" || status === "REJECTED") return "danger";
  if (status === "PENDING_VERIFICATION") return "warning";
  return "neutral";
}

function getVerificationTone(status: SubscriptionContext["verificationStatus"]): SummaryTone {
  if (status === "VERIFIED") return "success";
  if (status === "SUSPENDED" || status === "REJECTED") return "danger";
  if (status === "PENDING_VERIFICATION") return "warning";
  return "neutral";
}

function getSubscriptionTone(status: SubscriptionContext["subscriptionStatus"]): SummaryTone {
  if (status === "ACTIVE") return "success";
  if (status === "PAYMENT_PENDING") return "warning";
  if (status === "EXPIRED" || status === "CANCELED") return "danger";
  return "neutral";
}

// Read-only overview of the account's billing situation, in the same
// operational-metrics strip as the dashboards.
export function SubscriptionAccountSummary({
  context,
  currentPlan,
  locale,
  t,
}: SubscriptionAccountSummaryProps) {
  const hasPlan = context.subscriptionStatus !== "NO_PLAN" && currentPlan;
  const periodEnd = hasPlan ? formatBillingDate(context.currentPeriodEnd, locale) : null;
  const periodStart = hasPlan ? formatBillingDate(context.currentPeriodStart, locale) : null;

  return (
    <section aria-label={t("subscription.summary.title")}>
      <dl className="operational-metrics">
        <SummaryItem
          hint={t(`subscription.accountType.${context.accountType}`)}
          icon={ShieldCheck}
          label={t("subscription.summary.account")}
          tone={getAccountTone(context.accountStatus)}
          value={t(`subscription.status.account.${context.accountStatus}`)}
        />
        <SummaryItem
          hint={t("subscription.summary.verificationHint")}
          icon={BadgeCheck}
          label={t("subscription.summary.verification")}
          tone={getVerificationTone(context.verificationStatus)}
          value={t(`subscription.status.verification.${context.verificationStatus}`)}
        />
        <SummaryItem
          hint={t(`subscription.status.subscription.${context.subscriptionStatus}`)}
          icon={CreditCard}
          label={t("subscription.summary.plan")}
          tone={getSubscriptionTone(context.subscriptionStatus)}
          value={hasPlan ? t(currentPlan.name) : t("subscription.summary.noPlan")}
        />
        <SummaryItem
          hint={
            periodStart
              ? t("subscription.summary.periodStart", { date: periodStart })
              : t("subscription.summary.noPeriodHint")
          }
          icon={CalendarClock}
          label={t("subscription.summary.period")}
          value={periodEnd ?? "—"}
        />
      </dl>
    </section>
  );
}
