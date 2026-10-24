"use client";

import { Gauge, X } from "lucide-react";
import { type ReactNode, useId } from "react";

import { formatPaymentAmount } from "@/components/admin/payments/payment-format";
import { Button } from "@/components/ui/button";
import { useAdminSubscriptionDetail } from "@/features/admin/hooks/use-admin-subscriptions";
import {
  type AdminSubscriptionDetail,
  type AdminSubscriptionRow,
} from "@/features/admin/subscriptions.types";
import { type Locale } from "@/i18n";
import { formatAdminDateTime } from "@/lib/date-format";
import { type TranslationFunction } from "@/lib/i18n";
import { type PlanQuotas } from "@/types/subscription";

import { SubscriptionActionsPanel } from "./SubscriptionActionsPanel";
import { SubscriptionStatusBadge } from "./SubscriptionStatusBadge";

type AdminSubscriptionDetailDialogProps = {
  account: AdminSubscriptionRow | null;
  locale: Locale;
  onClose: () => void;
  t: TranslationFunction;
};

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function quotaText(value: number | null, t: TranslationFunction) {
  return value === null ? t("admin.subscriptions.detail.unlimited") : String(value);
}

function pipelinesText(quotas: PlanQuotas, t: TranslationFunction) {
  return quotas.aiPipelines === null
    ? t("admin.subscriptions.detail.allPipelines")
    : quotas.aiPipelines.map((pipeline) => t(`aiAnalyses.pipelines.${pipeline}.name`)).join(", ") || "—";
}

// The quotas that apply, next to those of the plan, and the usage.
function QuotasTable({ detail, t }: { detail: AdminSubscriptionDetail; t: TranslationFunction }) {
  const effective = detail.entitlements.quotas;
  const planQuotas = detail.subscription?.plan.quotas ?? null;
  const rows = [
    { key: "aiAnalysesPerMonth", used: detail.entitlements.usage.aiAnalysesThisMonth },
    { key: "maxPatients", used: detail.entitlements.usage.patients },
    { key: "maxDoctors", used: detail.entitlements.usage.doctors },
  ] as const;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="min-w-full text-sm">
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-start">{t("admin.subscriptions.detail.quota")}</th>
            <th className="px-4 py-3 text-start">{t("admin.subscriptions.detail.effective")}</th>
            <th className="px-4 py-3 text-start">{t("admin.subscriptions.detail.planValue")}</th>
            <th className="px-4 py-3 text-start">{t("admin.subscriptions.detail.used")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map(({ key, used }) => (
            <tr key={key}>
              <th scope="row" className="px-4 py-3 text-start font-medium">{t(`admin.subscriptions.form.quotas.${key}`)}</th>
              <td className="px-4 py-3 tabular-nums"><bdi dir="ltr">{quotaText(effective[key], t)}</bdi></td>
              <td className="px-4 py-3 tabular-nums text-muted-foreground">
                <bdi dir="ltr">{planQuotas ? quotaText(planQuotas[key], t) : "—"}</bdi>
              </td>
              <td className="px-4 py-3 tabular-nums"><bdi dir="ltr">{used}</bdi></td>
            </tr>
          ))}
          <tr>
            <th scope="row" className="px-4 py-3 text-start font-medium">{t("admin.subscriptions.form.quotas.aiPipelines")}</th>
            <td className="px-4 py-3">{pipelinesText(effective, t)}</td>
            <td className="px-4 py-3 text-muted-foreground">{planQuotas ? pipelinesText(planQuotas, t) : "—"}</td>
            <td className="px-4 py-3">—</td>
          </tr>
        </tbody>
      </table>
      {detail.subscription?.customQuotas ? (
        <p className="border-t border-border bg-secondary px-4 py-2 text-xs font-medium text-[var(--accent-dark)]">
          {t("admin.subscriptions.detail.customQuotas")}
        </p>
      ) : null}
    </div>
  );
}

export function AdminSubscriptionDetailDialog({ account, ...props }: AdminSubscriptionDetailDialogProps) {
  // Mounted only while an account is targeted, keyed by id so that switching
  // accounts never shows the previous one's details.
  if (!account) {
    return null;
  }

  return <DetailDialog key={account.accountId} account={account} {...props} />;
}

function DetailDialog({
  account,
  locale,
  onClose,
  t,
}: Omit<AdminSubscriptionDetailDialogProps, "account"> & { account: AdminSubscriptionRow }) {
  const titleId = useId();
  const { data, isError, isLoading } = useAdminSubscriptionDetail(account.accountId);
  const formatDate = (value: string | null) => (value ? formatAdminDateTime(value, locale) : "—");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <button
        type="button"
        aria-label={t("admin.actions.close")}
        className="absolute inset-0 bg-[#0f172a]/35 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
        role="dialog"
      >
        <div className="max-h-[92vh] overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-[var(--accent-dark)]">
                <Gauge className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("admin.subscriptions.detail.title")}
                </p>
                <h2 id={titleId} className="mt-2 text-2xl font-semibold text-foreground">
                  {account.displayName}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{account.email}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <SubscriptionStatusBadge status={data?.entitlements.status ?? account.status} t={t} />
                  {(data?.entitlements.trial ?? account.trial) ? (
                    <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      {t("admin.subscriptions.table.trial")}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={t("admin.actions.close")} onClick={onClose}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {isLoading ? (
            <div role="status" className="mt-6 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              {t("admin.subscriptions.detail.loading")}
            </div>
          ) : isError || !data ? (
            <div role="alert" className="mt-6 rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5 text-sm font-medium text-[var(--danger-ink)]">
              {t("admin.subscriptions.detail.error")}
            </div>
          ) : (
            <>
              <Section title={t("admin.subscriptions.detail.subscription")}>
                <dl className="grid gap-3 rounded-2xl border border-border bg-card p-4 text-sm md:grid-cols-2">
                  <div><dt className="text-xs text-muted-foreground">{t("admin.subscriptions.table.plan")}</dt><dd className="font-medium">{data.entitlements.plan?.name ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t("admin.subscriptions.detail.billing")}</dt><dd className="font-medium">{data.subscription ? t(`subscription.billing.${data.subscription.billingPeriod.toLowerCase()}`) : "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t("admin.subscriptions.detail.startedAt")}</dt><dd className="font-medium">{formatDate(data.subscription?.startedAt ?? null)}</dd></div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("admin.subscriptions.table.expiry")}</dt>
                    <dd className="font-medium">
                      {formatDate(data.entitlements.expiresAt)}
                      {data.entitlements.daysLeft !== null ? ` · ${t("admin.subscriptions.table.daysLeft", { days: data.entitlements.daysLeft })}` : ""}
                    </dd>
                  </div>
                  <div><dt className="text-xs text-muted-foreground">{t("admin.subscriptions.detail.verification")}</dt><dd className="font-medium">{data.account.verificationStatus}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t("admin.subscriptions.detail.canceledAt")}</dt><dd className="font-medium">{formatDate(data.subscription?.canceledAt ?? null)}</dd></div>
                </dl>
              </Section>

              <Section title={t("admin.subscriptions.detail.quotas")}>
                <QuotasTable detail={data} t={t} />
              </Section>

              <Section title={t("admin.subscriptions.detail.actions")}>
                <SubscriptionActionsPanel detail={data} t={t} />
              </Section>

              <Section title={t("admin.subscriptions.detail.events")}>
                {data.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("admin.subscriptions.detail.noEvents")}</p>
                ) : (
                  <ol className="divide-y divide-border rounded-2xl border border-border bg-card">
                    {data.events.map((event) => (
                      <li key={event.id} className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="font-semibold">{t(`subscription.history.events.${event.type}`)}</p>
                          <time dateTime={event.createdAt} className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</time>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {event.fromStatus ?? "—"} → {event.toStatus ?? "—"}
                          {event.toExpiresAt ? ` · ${t("admin.subscriptions.detail.until", { date: formatDate(event.toExpiresAt) })}` : ""}
                          {event.paymentReference ? ` · ${event.paymentReference}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {event.actor ? t("admin.subscriptions.detail.by", { name: event.actor.fullName }) : t("admin.subscriptions.detail.system")}
                          {event.reason ? ` — ${event.reason}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>

              <Section title={t("admin.subscriptions.detail.payments")}>
                {data.payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("admin.subscriptions.detail.noPayments")}</p>
                ) : (
                  <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                    {data.payments.map((payment) => (
                      <li key={payment.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                        <span>
                          <bdi dir="ltr" className="font-mono text-xs">{payment.reference}</bdi>{" "}
                          · {payment.plan?.name ?? "—"} · {t(`subscription.billing.${payment.billingPeriod.toLowerCase()}`)}
                        </span>
                        <span className="tabular-nums">
                          <bdi dir="ltr">{formatPaymentAmount(payment.amount, payment.currency)}</bdi>{" "}
                          · {t(`admin.badges.paymentStatus.${payment.status}`)} · {formatDate(payment.paidAt ?? payment.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
