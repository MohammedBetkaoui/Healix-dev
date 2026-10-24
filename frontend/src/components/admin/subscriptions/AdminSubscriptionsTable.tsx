import { formatPaymentAmount } from "@/components/admin/payments/payment-format";
import { type AdminSubscriptionRow } from "@/features/admin/subscriptions.types";
import { type Locale } from "@/i18n";
import { formatAdminDateTime } from "@/lib/date-format";
import { type TranslationFunction } from "@/lib/i18n";

import { SubscriptionStatusBadge } from "./SubscriptionStatusBadge";

type AdminSubscriptionsTableProps = {
  accounts: AdminSubscriptionRow[];
  locale: Locale;
  onViewDetails: (account: AdminSubscriptionRow) => void;
  t: TranslationFunction;
};

// "x / limit" or "x" when the quota is unlimited.
function usageText(used: number, limit: number | null, t: TranslationFunction) {
  return limit === null
    ? t("admin.subscriptions.table.unlimited", { used })
    : t("admin.subscriptions.table.usage", { limit, used });
}

function ExpiryCell({ account, locale, t }: { account: AdminSubscriptionRow; locale: Locale; t: TranslationFunction }) {
  if (!account.expiresAt) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <>
      <p className="text-foreground">{formatAdminDateTime(account.expiresAt, locale)}</p>
      {account.daysLeft !== null ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("admin.subscriptions.table.daysLeft", { days: account.daysLeft })}
        </p>
      ) : null}
    </>
  );
}

// The accounts that can subscribe, with where they stand. The normal
// purchases are not here to be activated: the card payment does it by itself.
export function AdminSubscriptionsTable({
  accounts,
  locale,
  onViewDetails,
  t,
}: AdminSubscriptionsTableProps) {
  if (accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        {t("admin.common.noResults")}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-4 py-4 text-start">{t("admin.subscriptions.table.account")}</th>
              <th className="px-4 py-4 text-start">{t("admin.subscriptions.table.status")}</th>
              <th className="px-4 py-4 text-start">{t("admin.subscriptions.table.plan")}</th>
              <th className="px-4 py-4 text-start">{t("admin.subscriptions.table.expiry")}</th>
              <th className="px-4 py-4 text-start">{t("admin.subscriptions.table.ai")}</th>
              <th className="px-4 py-4 text-start">{t("admin.subscriptions.table.patients")}</th>
              <th className="px-4 py-4 text-start">{t("admin.subscriptions.table.lastPayment")}</th>
              <th className="px-4 py-4 text-start">{t("admin.subscriptions.table.action")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {accounts.map((account) => (
              <tr key={account.accountId} className="align-middle">
                <td className="px-4 py-4">
                  <p className="font-semibold text-foreground">{account.displayName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{account.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t(`admin.badges.type.${account.accountType}`)}</p>
                </td>
                <td className="px-4 py-4">
                  <SubscriptionStatusBadge status={account.status} t={t} />
                </td>
                <td className="px-4 py-4 font-medium text-foreground">
                  {account.plan ? account.plan.name : "—"}
                  {account.trial ? (
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {t("admin.subscriptions.table.trial")}
                    </span>
                  ) : null}
                </td>
                <td className="min-w-[8rem] px-4 py-4">
                  <ExpiryCell account={account} locale={locale} t={t} />
                </td>
                <td className="whitespace-nowrap px-4 py-4 tabular-nums">
                  <bdi dir="ltr">{usageText(account.usage.aiAnalysesThisMonth, account.quotas.aiAnalysesPerMonth, t)}</bdi>
                </td>
                <td className="whitespace-nowrap px-4 py-4 tabular-nums">
                  <bdi dir="ltr">{usageText(account.usage.patients, account.quotas.maxPatients, t)}</bdi>
                </td>
                <td className="px-4 py-4 text-xs text-muted-foreground">
                  {account.lastPayment ? (
                    <>
                      <bdi dir="ltr" className="font-mono">{account.lastPayment.reference}</bdi>
                      <p className="mt-1 tabular-nums">
                        <bdi dir="ltr">{formatPaymentAmount(account.lastPayment.amount, account.lastPayment.currency)}</bdi>{" "}
                        · {t(`admin.badges.paymentStatus.${account.lastPayment.status}`)}
                      </p>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    className="whitespace-nowrap font-semibold text-[var(--accent-dark)] hover:underline hover:underline-offset-4"
                    onClick={() => onViewDetails(account)}
                  >
                    {t("admin.actions.viewDetails")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
