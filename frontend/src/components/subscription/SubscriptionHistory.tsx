import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import {
  type SubscriptionEventType,
  type SubscriptionHistory as SubscriptionHistoryData,
} from "@/features/subscriptions/types/entitlements.types";

import { formatBillingDate, formatPlanAmount } from "./subscription-format";

type SubscriptionHistoryProps = {
  error?: boolean;
  history?: SubscriptionHistoryData;
  isLoading?: boolean;
  locale: Locale;
  t: TranslationFunction;
};

function eventDetail(
  event: SubscriptionHistoryData["events"][number],
  locale: Locale,
  t: TranslationFunction,
): string | null {
  const parts: string[] = [];

  if (
    event.type === "PLAN_CHANGED" &&
    event.fromPlan &&
    event.toPlan
  ) {
    parts.push(t("subscription.history.planChange", { from: t(event.fromPlan.name), to: t(event.toPlan.name) }));
  } else if (event.toPlan && event.type !== "EXPIRED" && event.type !== "CANCELED") {
    parts.push(t(event.toPlan.name));
  }

  const until = formatBillingDate(event.toExpiresAt ?? undefined, locale);
  if (until && event.type !== "EXPIRED" && event.type !== "CANCELED") {
    parts.push(t("subscription.history.until", { date: until }));
  }

  if (event.byAdministrator) {
    parts.push(t("subscription.history.byAdministrator"));
  }

  return parts.length ? parts.join(" · ") : null;
}

const cell = "px-4 py-2.5 text-start";

// What the account paid and what happened to its subscription.
export function SubscriptionHistory({
  error,
  history,
  isLoading,
  locale,
  t,
}: SubscriptionHistoryProps) {
  return (
    <section
      aria-labelledby="subscription-history-heading"
      className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="clinical-section-heading border-b border-[var(--line-soft)]">
        <h2 id="subscription-history-heading" className="text-[var(--text-primary)]">
          {t("subscription.history.paymentsTitle")}
        </h2>
      </div>
      {isLoading ? (
        <p role="status" className="px-5 py-4 text-sm text-[var(--text-secondary)]">
          {t("subscription.history.loading")}
        </p>
      ) : error || !history ? (
        <p role="alert" className="px-5 py-4 text-sm font-medium text-[var(--danger-ink)]">
          {t("subscription.history.error")}
        </p>
      ) : (
        <>
          {history.payments.length === 0 ? (
            <p className="px-5 py-4 text-sm text-[var(--text-secondary)]">
              {t("subscription.history.emptyPayments")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead className="bg-[var(--surface-muted)] text-xs text-[var(--text-secondary)]">
                  <tr>
                    <th scope="col" className={cell}>{t("subscription.history.columns.date")}</th>
                    <th scope="col" className={cell}>{t("subscription.history.columns.reference")}</th>
                    <th scope="col" className={cell}>{t("subscription.history.columns.plan")}</th>
                    <th scope="col" className={cell}>{t("subscription.history.columns.amount")}</th>
                    <th scope="col" className={cell}>{t("subscription.history.columns.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line-soft)]">
                  {history.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td className={cell}>{formatBillingDate(payment.paidAt ?? payment.createdAt, locale)}</td>
                      <td className={cell}>
                        <bdi dir="ltr" className="tabular-nums">{payment.reference}</bdi>
                        {payment.cardLast4 ? (
                          <span className="block text-xs text-[var(--text-secondary)]">
                            {t("subscription.history.card", { last4: payment.cardLast4 })}
                          </span>
                        ) : null}
                      </td>
                      <td className={cell}>{payment.plan ? t(payment.plan.name) : "—"}</td>
                      <td className={cell}>
                        <bdi dir="ltr" className="tabular-nums">{formatPlanAmount(payment.amount)} DA</bdi>
                      </td>
                      <td className={cell}>{t(`subscription.paymentFlow.status.${payment.status}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="clinical-section-heading border-y border-[var(--line-soft)]">
            <h2 className="text-[var(--text-primary)]">{t("subscription.history.eventsTitle")}</h2>
          </div>
          {history.events.length === 0 ? (
            <p className="px-5 py-4 text-sm text-[var(--text-secondary)]">
              {t("subscription.history.emptyEvents")}
            </p>
          ) : (
            <ol className="divide-y divide-[var(--line-soft)]">
              {history.events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {t(`subscription.history.events.${event.type satisfies SubscriptionEventType}`)}
                    </p>
                    {eventDetail(event, locale, t) ? (
                      <p className="clinical-caption mt-0.5">{eventDetail(event, locale, t)}</p>
                    ) : null}
                  </div>
                  <time dateTime={event.createdAt} className="clinical-caption shrink-0">
                    {formatBillingDate(event.createdAt, locale)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
