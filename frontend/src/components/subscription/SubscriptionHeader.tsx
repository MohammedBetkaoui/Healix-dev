import { Building2, Stethoscope } from "lucide-react";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { type TranslationFunction } from "@/lib/i18n";
import { type DashboardStatusTone } from "@/types/dashboard";
import {
  type AccountStatus,
  type AccountType,
} from "@/types/subscription";

type SubscriptionHeaderProps = {
  accountStatus: AccountStatus;
  accountType: AccountType;
  t: TranslationFunction;
};

const accountStatusTone: Record<AccountStatus, DashboardStatusTone> = {
  ACTIVE: "success",
  BASIC_ACCOUNT: "neutral",
  PENDING_VERIFICATION: "warning",
  REJECTED: "danger",
  SUSPENDED: "danger",
  VERIFIED_NO_PLAN: "info",
};

export function SubscriptionHeader({
  accountStatus,
  accountType,
  t,
}: SubscriptionHeaderProps) {
  const AccountIcon = accountType === "ESTABLISHMENT" ? Building2 : Stethoscope;

  return (
    <header className="workspace-intro">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-medium text-[var(--medical)]">
          {t("subscription.header.eyebrow")}
        </p>
        <h1 className="break-words">{t("subscription.header.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
          {accountType === "ESTABLISHMENT"
            ? t("subscription.header.establishmentSubtitle")
            : t("subscription.header.doctorSubtitle")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
          <AccountIcon size={14} strokeWidth={1.8} aria-hidden="true" />
          {t(`subscription.accountType.${accountType}`)}
        </span>
        <StatusBadge
          label={t(`subscription.status.account.${accountStatus}`)}
          tone={accountStatusTone[accountStatus] ?? "neutral"}
        />
      </div>
    </header>
  );
}
