import { type TranslationFunction } from "@/lib/i18n";

type DashboardAccountStatusKey =
  | "active"
  | "basic"
  | "loading"
  | "paymentPending"
  | "pending"
  | "rejected"
  | "suspended"
  | "unknown"
  | "verified";

type DashboardAccountStatusPresentationInput = {
  isLoading: boolean;
  status?: string;
  t: TranslationFunction;
};

export type DashboardAccountStatusPresentation = {
  actionLabel?: string;
  cardDescription: string;
  cardTitle: string;
  footerLabel: string;
  statHint: string;
  statusLabel: string;
};

const accountStatusKeyByValue: Record<string, DashboardAccountStatusKey> = {
  ACTIVE: "active",
  BASIC_ACCOUNT: "basic",
  PAYMENT_PENDING: "paymentPending",
  PENDING_VERIFICATION: "pending",
  REJECTED: "rejected",
  SUSPENDED: "suspended",
  VERIFIED_NO_PLAN: "verified",
};

const actionEnabledStatuses = new Set<DashboardAccountStatusKey>([
  "basic",
  "rejected",
]);

function getAccountStatusKey(
  status: string | undefined,
  isLoading: boolean,
): DashboardAccountStatusKey {
  if (isLoading) {
    return "loading";
  }

  if (!status) {
    return "unknown";
  }

  return accountStatusKeyByValue[status] ?? "unknown";
}

export function getDashboardAccountStatusPresentation({
  isLoading,
  status,
  t,
}: DashboardAccountStatusPresentationInput): DashboardAccountStatusPresentation {
  const key = getAccountStatusKey(status, isLoading);
  const statusLabel =
    key === "unknown" && status
      ? status
      : t(`dashboard.common.accountStatus.statusLabels.${key}`);

  return {
    actionLabel: actionEnabledStatuses.has(key)
      ? t(
          key === "rejected"
            ? "dashboard.common.accountStatus.actions.correct"
            : "dashboard.common.accountStatus.actions.start",
        )
      : undefined,
    cardDescription: t(`dashboard.common.accountStatus.descriptions.${key}`),
    cardTitle: t(`dashboard.common.accountStatus.titles.${key}`),
    footerLabel: t(`dashboard.common.accountStatus.footers.${key}`),
    statHint: t(`dashboard.common.accountStatus.hints.${key}`),
    statusLabel,
  };
}
