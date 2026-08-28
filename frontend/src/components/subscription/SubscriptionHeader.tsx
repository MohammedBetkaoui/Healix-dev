import { ShieldCheck } from "lucide-react";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { type TranslationFunction } from "@/lib/i18n";
import {
  type AccountStatus,
  type AccountType,
} from "@/types/subscription";

type SubscriptionHeaderProps = {
  accountStatus: AccountStatus;
  accountType: AccountType;
  t: TranslationFunction;
};

export function SubscriptionHeader({
  accountStatus,
  accountType,
  t,
}: SubscriptionHeaderProps) {
  return (
    <section className="rounded-[1.35rem] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[0_18px_46px_-34px_rgba(22,33,29,0.5)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[0.95rem] rounded-bl-[0.32rem] border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
            <ShieldCheck className="h-6 w-6" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div>
            <p className="font-[var(--font-auth-mono)] text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[var(--gold-dark)]">
              {t("subscription.header.eyebrow")}
            </p>
            <h1 className="mt-2 font-[var(--font-auth-display)] text-3xl font-medium tracking-[-0.015em] text-[var(--ink)] md:text-[2.2rem]">
              {t("subscription.header.title")}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">
              {accountType === "ESTABLISHMENT"
                ? t("subscription.header.establishmentSubtitle")
                : t("subscription.header.doctorSubtitle")}
            </p>
          </div>
        </div>
        <StatusBadge
          label={t(`subscription.status.account.${accountStatus}`)}
          tone={accountStatus === "ACTIVE" ? "success" : "info"}
        />
      </div>
    </section>
  );
}
