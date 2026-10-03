"use client";

import {
  BadgeCheck,
  CalendarCheck,
  CalendarClock,
  CalendarSearch,
  CreditCard,
  FileText,
  Hash,
  Mail,
  MessageSquareText,
  Phone,
  Repeat,
  ShieldCheck,
  Tag,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { type ReactNode, useId } from "react";

import { DetailItem } from "@/components/admin/audit/AdminAuditLogDetailModal";
import { Button } from "@/components/ui/button";
import { useAdminPaymentDetail } from "@/features/admin/hooks/use-admin-payment-detail";
import { type Locale } from "@/i18n";
import { formatAdminDateTime } from "@/lib/date-format";
import { type TranslationFunction } from "@/lib/i18n";
import { type AdminPaymentListItem } from "@/types/admin";

import { formatPaymentAmount } from "./payment-format";
import { PaymentMethodBadge } from "./PaymentMethodBadge";
import { PaymentStatusBadge } from "./PaymentStatusBadge";

type AdminPaymentDetailModalProps = {
  locale: Locale;
  onClose: () => void;
  payment: AdminPaymentListItem | null;
  t: TranslationFunction;
};

function DetailSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function AdminPaymentDetailModal({
  payment,
  ...dialogProps
}: AdminPaymentDetailModalProps) {
  // Mounted only while a payment is targeted; keyed by id so switching
  // payments never shows the previous one's details.
  if (!payment) {
    return null;
  }

  return <AdminPaymentDetailDialog key={payment.id} payment={payment} {...dialogProps} />;
}

// Read-only: no approve/reject action and no access to the proof file itself
// (only its name), both left to a separate workflow step.
function AdminPaymentDetailDialog({
  locale,
  onClose,
  payment,
  t,
}: Omit<AdminPaymentDetailModalProps, "payment"> & { payment: AdminPaymentListItem }) {
  const titleId = useId();
  const { data, isError, isLoading } = useAdminPaymentDetail(payment.id);
  const formatDate = (value: string | null) => (value ? formatAdminDateTime(value, locale) : "-");

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
          {/* Header renders straight from the table row while the detail loads. */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-secondary text-[var(--accent-dark)]">
                <CreditCard className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("admin.payments.detail.title")}
                </p>
                <h2 id={titleId} className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
                  <bdi dir="ltr">{formatPaymentAmount(payment.amount, payment.currency)}</bdi>
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  <bdi dir="ltr" className="font-mono">{payment.reference}</bdi>
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <PaymentStatusBadge status={payment.status} t={t} />
                  <PaymentMethodBadge method={payment.method} t={t} />
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={t("admin.actions.close")}
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {isLoading ? (
            <div role="status" className="mt-6 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              {t("admin.payments.detail.loading")}
            </div>
          ) : isError || !data ? (
            <div role="alert" className="mt-6 rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5 text-sm font-medium text-[var(--danger-ink)]">
              {t("admin.payments.detail.error")}
            </div>
          ) : (
            <>
              <DetailSection title={t("admin.payments.detail.sections.payment")}>
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem icon={Hash} label={t("admin.payments.table.reference")} value={data.reference} />
                  <DetailItem icon={Wallet} label={t("admin.payments.detail.fields.amount")} value={formatPaymentAmount(data.amount, data.currency)} />
                  <DetailItem icon={CreditCard} label={t("admin.payments.table.method")} value={t(`admin.badges.paymentMethod.${data.method}`)} />
                  <DetailItem icon={ShieldCheck} label={t("admin.payments.table.status")} value={t(`admin.badges.paymentStatus.${data.status}`)} />
                  <DetailItem icon={Repeat} label={t("admin.payments.detail.fields.billingPeriod")} value={t(`subscription.billing.${data.billingPeriod.toLowerCase()}`)} />
                  <DetailItem icon={Tag} label={t("admin.payments.detail.fields.provider")} value={data.provider ?? "-"} />
                  <DetailItem icon={CalendarClock} label={t("admin.payments.detail.fields.createdAt")} value={formatDate(data.createdAt)} />
                  <DetailItem icon={CalendarCheck} label={t("admin.payments.detail.fields.paidAt")} value={formatDate(data.paidAt)} />
                  <DetailItem icon={CalendarSearch} label={t("admin.payments.detail.fields.reviewedAt")} value={formatDate(data.reviewedAt)} />
                  {/* File name only: viewing/downloading the proof is out of scope. */}
                  <DetailItem icon={FileText} label={t("admin.payments.detail.fields.proof")} value={data.proof?.originalName ?? t("admin.payments.detail.fields.noProof")} />
                </div>
              </DetailSection>

              <DetailSection title={t("admin.payments.detail.sections.user")}>
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem icon={UserRound} label={t("admin.payments.detail.fields.name")} value={data.user.fullName} />
                  <DetailItem icon={Mail} label={t("admin.payments.detail.fields.email")} value={data.user.email} />
                  <DetailItem icon={Phone} label={t("admin.payments.detail.fields.phone")} value={data.user.phone} />
                  <DetailItem icon={BadgeCheck} label={t("admin.payments.detail.fields.role")} value={t(`admin.badges.roles.${data.user.role}`)} />
                  <DetailItem icon={Tag} label={t("admin.payments.detail.fields.accountType")} value={t(`admin.badges.type.${data.accountType}`)} />
                  <DetailItem icon={ShieldCheck} label={t("admin.payments.detail.fields.accountStatus")} value={t(`admin.badges.accountStatus.${data.user.accountStatus}`)} />
                </div>
              </DetailSection>

              <DetailSection title={t("admin.payments.detail.sections.plan")}>
                <div className="grid gap-4 md:grid-cols-2">
                  <DetailItem icon={CreditCard} label={t("admin.payments.detail.fields.planName")} value={data.plan.name} />
                  <DetailItem icon={Hash} label={t("admin.payments.detail.fields.planCode")} value={data.plan.code} />
                </div>
              </DetailSection>

              {data.adminNote || data.rejectionReason ? (
                <DetailSection title={t("admin.payments.detail.sections.notes")}>
                  <div className="grid gap-4 md:grid-cols-2">
                    {data.rejectionReason ? (
                      <DetailItem icon={MessageSquareText} label={t("admin.payments.detail.fields.rejectionReason")} value={data.rejectionReason} />
                    ) : null}
                    {data.adminNote ? (
                      <DetailItem icon={MessageSquareText} label={t("admin.payments.detail.fields.adminNote")} value={data.adminNote} />
                    ) : null}
                  </div>
                </DetailSection>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
