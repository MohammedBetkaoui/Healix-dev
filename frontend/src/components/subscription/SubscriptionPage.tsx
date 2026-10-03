"use client";

import { Info } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import {
  doctorNavSections,
  establishmentNavSections,
} from "@/components/dashboard/layout/navigation";
import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { BillingToggle } from "@/components/subscription/BillingToggle";
import { PaymentCheckoutModal } from "@/components/subscription/PaymentCheckoutModal";
import { PlanComparisonTable } from "@/components/subscription/PlanComparisonTable";
import { PricingGrid } from "@/components/subscription/PricingGrid";
import { SubscriptionAccountSummary } from "@/components/subscription/SubscriptionAccountSummary";
import { SubscriptionFAQ } from "@/components/subscription/SubscriptionFAQ";
import { SubscriptionHeader } from "@/components/subscription/SubscriptionHeader";
import { SubscriptionStatusCard } from "@/components/subscription/SubscriptionStatusCard";
import { VerificationAccessBanner } from "@/components/subscription/VerificationAccessBanner";
import { getSubscriptionPlansByAccountType } from "@/config/subscription-plans";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useCreatePaymentIntent } from "@/features/payments/hooks/use-create-payment-intent";
import { useMySubscription } from "@/features/subscriptions/hooks/use-my-subscription";
import { toSubscriptionContext } from "@/features/subscriptions/subscriptions.api";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  type AccountType,
  type BillingPeriod,
  type PaymentMethod,
} from "@/types/subscription";

type SubscriptionPageProps = {
  accountType: AccountType;
};

function canSelectSubscriptionPlan(
  accountStatus: string,
  verificationStatus: string,
) {
  return (
    verificationStatus === "VERIFIED" &&
    (accountStatus === "VERIFIED_NO_PLAN" || accountStatus === "ACTIVE")
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <span className={cn("block animate-pulse rounded-[var(--radius-xs)] bg-[var(--surface-muted)]", className)} />;
}

// Same layout as the loaded page (heading, summary strip, plan cards), so
// nothing jumps when the account data arrives.
function SubscriptionPageSkeleton({ label }: { label: string }) {
  return (
    <div className="workspace-stack">
      <p className="sr-only" role="status">{label}</p>
      <div aria-hidden="true" className="space-y-2">
        <SkeletonBlock className="h-3 w-28" />
        <SkeletonBlock className="h-6 w-64" />
        <SkeletonBlock className="h-3.5 w-80 max-w-full" />
      </div>
      <div aria-hidden="true" className="operational-metrics">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="operational-metric space-y-3">
            <SkeletonBlock className="h-3 w-24" />
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-8 w-36" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function getVerificationHref(accountType: AccountType) {
  return accountType === "ESTABLISHMENT"
    ? "/establishment/verification"
    : "/doctor/verification";
}

export function SubscriptionPage({ accountType }: SubscriptionPageProps) {
  const { locale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  // Establishment name for the workspace subtitle; skipped for doctor
  // accounts (ESTABLISHMENT_ADMIN-only endpoint).
  const prefill = useEstablishmentVerificationPrefill({ enabled: accountType === "ESTABLISHMENT" });
  const initials = getAccountInitials(currentUser.data?.fullName);
  const dashboardUser =
    accountType === "ESTABLISHMENT"
      ? {
          accountType,
          footerSubtitle: t("dashboard.clinical.administration"),
          initials,
          name: currentUser.data?.fullName || t("dashboard.clinical.administration"),
          roleKey: "dashboard.common.roles.establishment",
          workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace"),
        }
      : {
          accountType,
          footerSubtitle: t("dashboard.clinical.doctor.practice"),
          initials,
          name: currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace"),
          roleKey: "dashboard.common.roles.doctor",
          workspaceSubtitle: t("dashboard.clinical.doctor.workspace"),
        };
  const [billingPeriod, setBillingPeriod] =
    useState<BillingPeriod>("MONTHLY");
  const [selectedPlanId, setSelectedPlanId] = useState<string | undefined>();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | undefined>();
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const {
    createIntent,
    error: paymentError,
    isLoading: isCreatingPaymentIntent,
  } = useCreatePaymentIntent();

  const plans = useMemo(
    () => getSubscriptionPlansByAccountType(accountType),
    [accountType],
  );
  const { data, error, isLoading } = useMySubscription();
  // Memoized so the context keeps a stable identity between renders for the
  // components it is passed to.
  const context = useMemo(
    () => (data ? toSubscriptionContext(data) : null),
    [data],
  );
  const currentPlan = context
    ? plans.find((plan) => plan.id === context.currentPlanId)
    : undefined;
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const canSelectPlan =
    context !== null &&
    canSelectSubscriptionPlan(context.accountStatus, context.verificationStatus);
  const canCheckout = Boolean(
    canSelectPlan &&
      selectedPlan &&
      !selectedPlan.custom &&
      paymentMethod,
  );

  const navSections =
    accountType === "ESTABLISHMENT"
      ? establishmentNavSections
      : doctorNavSections;

  const handleSelectPlan = (planId: string) => {
    if (!canSelectPlan) {
      return;
    }

    const nextPlan = plans.find((plan) => plan.id === planId);
    setSelectedPlanId(planId);
    setPaymentMethod(undefined);

    if (nextPlan?.custom) {
      showMockToast(t("subscription.pricing.contactTeam"));
      return;
    }

    setIsPaymentModalOpen(true);
  };

  const handleClosePaymentModal = useCallback(() => {
    setIsPaymentModalOpen(false);
  }, []);

  const showMockToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3200);
  };

  return (
    <DashboardShell
      accountType={accountType}
      activeKey="subscription"
      navSections={navSections}
      titleKey="subscription.header.title"
      user={dashboardUser}
    >
      <div role="status" aria-live="polite">
        {toastMessage ? (
          <div className="fixed end-6 top-6 z-50 flex max-w-sm items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text-primary)] shadow-[var(--shadow-raised)]">
            <Info size={17} strokeWidth={1.8} aria-hidden="true" className="mt-px shrink-0 text-[var(--accent-dark)]" />
            {toastMessage}
          </div>
        ) : null}
      </div>

      {isLoading ? (
        <SubscriptionPageSkeleton label={t("subscription.page.loading")} />
      ) : error || !context ? (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-5 py-4 text-sm font-medium text-[var(--danger-ink)]"
        >
          {t("subscription.page.error")}
        </div>
      ) : (
        <div className="workspace-stack">
            <SubscriptionHeader
              accountStatus={context.accountStatus}
              accountType={accountType}
              t={t}
            />

            <VerificationAccessBanner
              context={context}
              t={t}
              verificationHref={getVerificationHref(accountType)}
            />

            <SubscriptionAccountSummary
              context={context}
              currentPlan={currentPlan}
              locale={locale}
              t={t}
            />

            <SubscriptionStatusCard
              context={context}
              currentPlan={currentPlan}
              locale={locale}
              onChangePlan={() =>
                showMockToast(t("subscription.mock.changePlanSoon"))
              }
              onRenew={() => showMockToast(t("subscription.mock.renewSoon"))}
              t={t}
            />

            <PricingGrid
              billingPeriod={billingPeriod}
              canSelectPlan={canSelectPlan}
              currentPlanId={
                context.subscriptionStatus === "ACTIVE" ? context.currentPlanId : null
              }
              onSelectPlan={handleSelectPlan}
              plans={plans}
              selectedPlanId={selectedPlanId}
              t={t}
              toolbar={
                <BillingToggle
                  billingPeriod={billingPeriod}
                  onChange={setBillingPeriod}
                  t={t}
                />
              }
            />

            <PlanComparisonTable
              billingPeriod={billingPeriod}
              plans={plans}
              t={t}
            />

            <SubscriptionFAQ t={t} />

            <PaymentCheckoutModal
              accountType={accountType}
              billingPeriod={billingPeriod}
              canCheckout={canCheckout}
              context={context}
              direction={direction}
              error={paymentError}
              isLoading={isCreatingPaymentIntent}
              isOpen={isPaymentModalOpen}
              onClose={handleClosePaymentModal}
              onConfirm={() => {
                if (!selectedPlan || !paymentMethod) {
                  return;
                }

                void createIntent({
                  billingPeriod,
                  paymentMethod,
                  planId: selectedPlan.id,
                });
              }}
              onPaymentMethodChange={setPaymentMethod}
              paymentMethod={paymentMethod}
              plan={selectedPlan}
              t={t}
            />
        </div>
      )}
    </DashboardShell>
  );
}
