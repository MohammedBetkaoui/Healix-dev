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
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_14px_42px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-cyan-700">
              {t("subscription.header.eyebrow")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
              {t("subscription.header.title")}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
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
