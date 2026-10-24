"use client";

import { Clock3, Lock, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { useEntitlements } from "@/features/subscriptions/hooks/use-entitlements";
import {
  getBannerActionKind,
  getBannerState,
  type SubscriptionBannerState,
} from "@/features/subscriptions/utils/entitlements-presentation";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type AccountType } from "@/types/auth";

const tones = {
  expiring: {
    className:
      "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    icon: TriangleAlert,
  },
  readOnly: {
    className:
      "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
    icon: Lock,
  },
  trial: {
    className:
      "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]",
    icon: Clock3,
  },
} satisfies Record<SubscriptionBannerState["kind"], { className: string; icon: LucideIcon }>;

const readOnlyStatuses = ["CANCELED", "EXPIRED", "NO_PLAN"];

function getMessage(state: SubscriptionBannerState, t: TranslationFunction) {
  switch (state.kind) {
    case "trial":
      return state.daysLeft === 1
        ? t("subscription.banner.trialOne")
        : t("subscription.banner.trialOther", { days: state.daysLeft });
    case "expiring":
      return state.daysLeft === 1
        ? t("subscription.banner.expiringOne")
        : t("subscription.banner.expiringOther", { days: state.daysLeft });
    case "readOnly":
      return t(
        `subscription.banner.readOnly.${readOnlyStatuses.includes(state.status) ? state.status : "NO_PLAN"}`,
      );
  }
}

type SubscriptionBannerViewProps = {
  accountType: AccountType;
  canManage: boolean;
  state: SubscriptionBannerState;
  t: TranslationFunction;
};

// The strip above every page of the workspace: the free trial and its days
// left, a subscription that is about to end, the read-only mode (in red).
// Whoever pays gets the button to choose a plan or renew; an affiliated doctor
// is told that their establishment manages it.
export function SubscriptionBannerView({
  accountType,
  canManage,
  state,
  t,
}: SubscriptionBannerViewProps) {
  const tone = tones[state.kind];
  const Icon = tone.icon;
  const subscriptionHref = `${accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor"}/subscription`;
  const action = getBannerActionKind(state);
  const hint =
    state.kind === "readOnly"
      ? t("subscription.banner.readOnlyHint")
      : state.kind === "trial"
        ? t("subscription.banner.trialHint")
        : null;

  return (
    <section
      aria-label={t("subscription.banner.label")}
      data-banner={state.kind}
      role={state.kind === "readOnly" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6",
        tone.className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon aria-hidden="true" size={18} strokeWidth={1.9} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{getMessage(state, t)}</p>
          {hint ? <p className="mt-0.5 text-xs opacity-90">{hint}</p> : null}
        </div>
      </div>
      {canManage ? (
        <Link
          href={subscriptionHref}
          className="clinical-button clinical-button-primary shrink-0 self-start sm:self-auto"
        >
          {t(`subscription.banner.actions.${action}`)}
        </Link>
      ) : (
        <p className="shrink-0 text-xs font-medium">{t("subscription.banner.affiliated")}</p>
      )}
    </section>
  );
}

export function SubscriptionBanner({
  accountType,
  t,
}: {
  accountType: AccountType;
  t: TranslationFunction;
}) {
  const { entitlements } = useEntitlements();
  const state = getBannerState(entitlements);

  if (!entitlements || !state) {
    return null;
  }

  return (
    <SubscriptionBannerView
      accountType={accountType}
      canManage={entitlements.canManage}
      state={state}
      t={t}
    />
  );
}
