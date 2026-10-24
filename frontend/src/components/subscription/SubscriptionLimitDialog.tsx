"use client";

import { Lock, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type Ref } from "react";

import { useCreatePaymentIntent } from "@/features/payments/hooks/use-create-payment-intent";
import { useEntitlements } from "@/features/subscriptions/hooks/use-entitlements";
import { useSubscriptionPlans } from "@/features/subscriptions/hooks/use-subscription-plans";
import { toSubscriptionPlan } from "@/features/subscriptions/subscriptions.api";
import {
  findUpgradePlan,
  type UpgradeNeed,
} from "@/features/subscriptions/utils/entitlements-presentation";
import {
  describeSubscriptionLimit,
  type SubscriptionLimit,
} from "@/lib/api/subscription-limit";
import { onSubscriptionLimit } from "@/lib/api/subscription-limit-notice";
import { useStoredLocale, useTranslation, type TranslationFunction } from "@/lib/i18n";
import { type AccountType } from "@/types/auth";
import { type SubscriptionPlan } from "@/types/subscription";

import { formatPlanAmount } from "./subscription-format";

// What the dialog offers: pay the plan above at once (a quota or a chain that
// the plan does not give), renew the plan that ended, go and choose one, or
// nothing (a plan on quote, an affiliated doctor, the top plan).
export type LimitAction =
  | { kind: "choose" }
  | { kind: "none"; reason: "contact" | "managed" | "top" }
  | { kind: "renew"; plan: SubscriptionPlan }
  | { kind: "upgrade"; plan: SubscriptionPlan };

// The offer for a refusal, from the plans of the account type and the
// subscription the account holds now.
export function getLimitAction(
  limit: SubscriptionLimit,
  context: {
    canManage: boolean;
    currentPlanId: string | null;
    plans: SubscriptionPlan[];
    trial: boolean;
  },
): LimitAction {
  if (limit.code === "PLAN_REQUIRES_CONTACT") {
    return { kind: "none", reason: "contact" };
  }

  if (!context.canManage) {
    return { kind: "none", reason: "managed" };
  }

  if (limit.code === "SUBSCRIPTION_INACTIVE") {
    const current = context.plans.find(
      (plan) => plan.id === context.currentPlanId && !plan.custom,
    );

    return current && limit.status === "EXPIRED"
      ? { kind: "renew", plan: current }
      : { kind: "choose" };
  }

  const need: UpgradeNeed =
    limit.code === "QUOTA_EXCEEDED"
      ? { kind: "quota", limit: limit.limit, quota: limit.quota }
      : { kind: "pipeline", pipeline: limit.pipeline };
  const plan = findUpgradePlan(
    context.plans,
    { planId: context.currentPlanId, trial: context.trial },
    need,
  );

  return plan ? { kind: "upgrade", plan } : { kind: "none", reason: "top" };
}

type SubscriptionLimitDialogViewProps = {
  action: LimitAction;
  dialogRef?: Ref<HTMLDialogElement>;
  error?: string | null;
  isPreparing: boolean;
  limit: SubscriptionLimit | null;
  onAction: () => void;
  onClose: () => void;
  t: TranslationFunction;
  trial: boolean;
};

export function SubscriptionLimitDialogView({
  action,
  dialogRef,
  error,
  isPreparing,
  limit,
  onAction,
  onClose,
  t,
  trial,
}: SubscriptionLimitDialogViewProps) {
  const label =
    action.kind === "upgrade"
      ? t("subscription.limits.upgrade")
      : action.kind === "renew"
        ? t("subscription.limits.renew")
        : action.kind === "choose"
          ? t("subscription.limits.choose")
          : null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="workspace-search-dialog surface-raised"
      aria-labelledby="subscription-limit-title"
      aria-describedby="subscription-limit-description"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="subscription-limit-title" className="flex items-center gap-2 text-base font-semibold">
          <Lock aria-hidden="true" size={17} className="text-[var(--warning-ink)]" />
          {t("subscription.limits.title")}
        </h2>
        <button type="button" className="clinical-icon-button" onClick={onClose} aria-label={t("subscription.limits.close")}>
          <X size={18} />
        </button>
      </div>
      <p id="subscription-limit-description" className="text-sm font-medium text-[var(--text-primary)]">
        {limit ? describeSubscriptionLimit(limit, t, { trial }) : null}
      </p>
      {action.kind === "upgrade" || action.kind === "renew" ? (
        <p className="clinical-caption mt-2">
          {t("subscription.limits.suggestion", {
            plan: t(action.plan.name),
            price:
              action.plan.monthlyPrice === null
                ? "—"
                : formatPlanAmount(action.plan.monthlyPrice),
          })}
        </p>
      ) : null}
      {action.kind === "none" && action.reason === "managed" ? (
        <p className="clinical-caption mt-2">{t("subscription.limits.managedByEstablishment")}</p>
      ) : null}
      {action.kind === "none" && action.reason === "top" ? (
        <p className="clinical-caption mt-2">{t("subscription.limits.noHigherPlan")}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-medium text-[var(--danger-ink)]">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="clinical-button" onClick={onClose}>
          {t("subscription.limits.close")}
        </button>
        {label ? (
          <button
            type="button"
            className="clinical-button clinical-button-primary disabled:opacity-60"
            disabled={isPreparing}
            onClick={onAction}
          >
            {isPreparing ? t("subscription.limits.preparing") : label}
          </button>
        ) : null}
      </div>
    </dialog>
  );
}

// The one dialog of every refusal of the subscription (see
// lib/api/subscription-limit.ts): opened by the HTTP client's notice, whatever
// the screen that asked. Mounted once, in the dashboard shell.
export function SubscriptionLimitDialog({ accountType }: { accountType: AccountType }) {
  const router = useRouter();
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [limit, setLimit] = useState<SubscriptionLimit | null>(null);
  const { entitlements } = useEntitlements();
  const canManage = entitlements?.canManage ?? true;
  const plansQuery = useSubscriptionPlans({ enabled: limit !== null && canManage });
  const { createIntent, error, isLoading } = useCreatePaymentIntent();
  const plans = useMemo(
    () => (plansQuery.data ?? []).map(toSubscriptionPlan),
    [plansQuery.data],
  );
  const subscriptionHref = `${accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor"}/subscription`;

  useEffect(
    () =>
      onSubscriptionLimit((next) => {
        // Several refusals at once (parallel requests) open one dialog.
        setLimit((current) => current ?? next);
      }),
    [],
  );

  useEffect(() => {
    if (limit && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal();
    }
  }, [limit]);

  const action: LimitAction = limit
    ? getLimitAction(limit, {
        canManage,
        currentPlanId: entitlements?.plan?.code ?? null,
        plans,
        trial: entitlements?.trial ?? false,
      })
    : { kind: "none", reason: "top" };

  const close = () => {
    dialogRef.current?.close();
    setLimit(null);
  };

  const run = () => {
    if (action.kind === "choose") {
      close();
      router.push(subscriptionHref);
      return;
    }

    if (action.kind === "upgrade" || action.kind === "renew") {
      // The plan above, paid by card for a month: the payment page shows the
      // new expiry before the card form.
      void createIntent({
        billingPeriod: "MONTHLY",
        paymentMethod: "SYNTHETIC_CHARGILY",
        planId: action.plan.id,
      });
    }
  };

  return (
    <SubscriptionLimitDialogView
      action={action}
      dialogRef={dialogRef}
      error={error}
      isPreparing={isLoading || (limit !== null && canManage && plansQuery.isLoading)}
      limit={limit}
      onAction={run}
      onClose={close}
      t={t}
      trial={entitlements?.trial ?? false}
    />
  );
}
