"use client";

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
import { SubscriptionFAQ } from "@/components/subscription/SubscriptionFAQ";
import { SubscriptionHeader } from "@/components/subscription/SubscriptionHeader";
import { SubscriptionStatusCard } from "@/components/subscription/SubscriptionStatusCard";
import { VerificationAccessBanner } from "@/components/subscription/VerificationAccessBanner";
import { getSubscriptionPlansByAccountType } from "@/config/subscription-plans";
import { getMockSubscriptionContext } from "@/data/subscription.mock";
import { useCreatePaymentIntent } from "@/features/payments/hooks/use-create-payment-intent";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
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

function getVerificationHref(accountType: AccountType) {
  return accountType === "ESTABLISHMENT"
    ? "/establishment/verification"
    : "/doctor/verification";
}

function getDashboardUser(accountType: AccountType) {
  return accountType === "ESTABLISHMENT"
    ? {
        accountType,
        footerSubtitle: "Administration",
        initials: "HE",
        name: "Healix Clinique",
        roleKey: "dashboard.common.roles.establishment",
        workspaceSubtitle: "Clinique El Shifa",
      }
    : {
        accountType,
        footerSubtitle: "Neurologie",
        initials: "SB",
        name: "Dr Samir Benali",
        roleKey: "dashboard.common.roles.doctor",
        workspaceSubtitle: "Cabinet HealixDZ",
      };
}

export function SubscriptionPage({ accountType }: SubscriptionPageProps) {
  const { locale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
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
  const context = useMemo(
    () => getMockSubscriptionContext(accountType),
    [accountType],
  );
  const currentPlan = plans.find((plan) => plan.id === context.currentPlanId);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
  const canSelectPlan = canSelectSubscriptionPlan(
    context.accountStatus,
    context.verificationStatus,
  );
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
      user={getDashboardUser(accountType)}
    >
      <div className="space-y-6">
        {toastMessage ? (
          <div
            role="status"
            className="fixed end-6 top-6 z-50 max-w-sm rounded-xl border border-[var(--accent-line)] bg-[var(--panel)] p-4 text-sm font-medium text-[var(--accent-dark)] shadow-sm"
          >
            {toastMessage}
          </div>
        ) : null}

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

        <BillingToggle
          billingPeriod={billingPeriod}
          onChange={setBillingPeriod}
          t={t}
        />

        <PricingGrid
          billingPeriod={billingPeriod}
          canSelectPlan={canSelectPlan}
          onSelectPlan={handleSelectPlan}
          plans={plans}
          selectedPlanId={selectedPlanId}
          t={t}
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
    </DashboardShell>
  );
}
