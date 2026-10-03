import { type Locale } from "@/i18n";
import { formatAdminDateTime } from "@/lib/date-format";
import { type TranslationFunction } from "@/lib/i18n";
import { type AdminPaymentListItem } from "@/types/admin";

import { formatPaymentAmount } from "./payment-format";
import { PaymentMethodBadge } from "./PaymentMethodBadge";
import { PaymentStatusBadge } from "./PaymentStatusBadge";

type PaymentsTableProps = {
  locale: Locale;
  onViewDetails: (payment: AdminPaymentListItem) => void;
  payments: AdminPaymentListItem[];
  t: TranslationFunction;
};

export function PaymentsTable({
  locale,
  onViewDetails,
  payments,
  t,
}: PaymentsTableProps) {
  if (payments.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
        {t("admin.common.noResults")}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted text-xs uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-4 py-4 text-start">{t("admin.payments.table.reference")}</th>
              <th className="px-4 py-4 text-start">{t("admin.payments.table.user")}</th>
              <th className="px-4 py-4 text-start">{t("admin.payments.table.plan")}</th>
              <th className="px-4 py-4 text-end">{t("admin.payments.table.amount")}</th>
              <th className="px-4 py-4 text-start">{t("admin.payments.table.method")}</th>
              <th className="px-4 py-4 text-start">{t("admin.payments.table.status")}</th>
              <th className="px-4 py-4 text-start">{t("admin.payments.table.date")}</th>
              <th className="px-4 py-4 text-start">{t("admin.payments.table.action")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payments.map((payment) => (
              <tr key={payment.id} className="align-middle">
                <td className="px-4 py-4">
                  <bdi dir="ltr" className="whitespace-nowrap font-mono text-xs font-semibold text-foreground">
                    {payment.reference}
                  </bdi>
                </td>
                <td className="px-4 py-4">
                  <p className="font-semibold text-foreground">{payment.userName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{payment.userEmail}</p>
                </td>
                <td className="px-4 py-4">
                  <p className="font-medium text-foreground">{payment.plan.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`subscription.billing.${payment.billingPeriod.toLowerCase()}`)}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-end font-semibold tabular-nums text-foreground">
                  <bdi dir="ltr">{formatPaymentAmount(payment.amount, payment.currency)}</bdi>
                </td>
                <td className="px-4 py-4">
                  <PaymentMethodBadge method={payment.method} t={t} />
                </td>
                <td className="px-4 py-4">
                  <PaymentStatusBadge status={payment.status} t={t} />
                </td>
                <td className="min-w-[7.5rem] px-4 py-4 text-muted-foreground">
                  {formatAdminDateTime(payment.createdAt, locale)}
                </td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    className="whitespace-nowrap font-semibold text-[var(--accent-dark)] hover:underline hover:underline-offset-4"
                    onClick={() => onViewDetails(payment)}
                  >
                    {t("admin.actions.viewDetails")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 p-4 lg:hidden">
        {payments.map((payment) => (
          <article
            key={payment.id}
            className="rounded-2xl border border-border bg-muted p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{payment.userName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{payment.userEmail}</p>
              </div>
              <p className="whitespace-nowrap font-semibold tabular-nums text-foreground">
                <bdi dir="ltr">{formatPaymentAmount(payment.amount, payment.currency)}</bdi>
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <PaymentStatusBadge status={payment.status} t={t} />
              <PaymentMethodBadge method={payment.method} t={t} />
            </div>
            <div className="mt-4 grid gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">
                  {t("admin.payments.table.reference")}:
                </span>{" "}
                <bdi dir="ltr" className="font-mono">{payment.reference}</bdi>
              </p>
              <p>
                <span className="font-semibold text-foreground">
                  {t("admin.payments.table.plan")}:
                </span>{" "}
                {payment.plan.name}
              </p>
              <p>
                <span className="font-semibold text-foreground">
                  {t("admin.payments.table.date")}:
                </span>{" "}
                {formatAdminDateTime(payment.createdAt, locale)}
              </p>
            </div>
            <button
              type="button"
              className="mt-4 inline-flex text-sm font-semibold text-[var(--accent-dark)]"
              onClick={() => onViewDetails(payment)}
            >
              {t("admin.actions.viewDetails")}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
