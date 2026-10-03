"use client";

import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminPayments } from "@/features/admin/hooks/use-admin-payments";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { type AdminPaymentListItem, type AdminPaymentStatus } from "@/types/admin";
import { type AccountType, type PaymentMethod } from "@/types/subscription";

import { AdminPaymentDetailModal } from "./AdminPaymentDetailModal";
import { PaymentsTable } from "./PaymentsTable";

type PaymentFilterState = {
  accountType: "ALL" | AccountType;
  method: "ALL" | PaymentMethod;
  search: string;
  status: "ALL" | AdminPaymentStatus;
};

const initialFilters: PaymentFilterState = {
  accountType: "ALL",
  method: "ALL",
  search: "",
  status: "ALL",
};

const paymentsPageSize = 20;

const paymentStatuses: AdminPaymentStatus[] = [
  "WAITING_ADMIN_REVIEW",
  "WAITING_PAYMENT",
  "CREATED",
  "PAID",
  "REJECTED",
  "FAILED",
  "CANCELED",
  "EXPIRED",
];

const paymentMethods: PaymentMethod[] = [
  "SYNTHETIC_CHARGILY",
  "MANUAL_POST_TRANSFER",
  "BARIDIMOB_RECEIPT",
  "MANUAL_CASH",
];

const accountTypes: AccountType[] = ["ESTABLISHMENT", "INDEPENDENT_DOCTOR"];

const selectClass =
  "mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm";

// Read-only for now: approve / reject / cash activation and proof viewing are
// separate workflow decisions, out of this page's scope.
export function AdminPaymentsPage() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const [filters, setFilters] = useState<PaymentFilterState>(initialFilters);
  const [page, setPage] = useState(1);
  const [detailTarget, setDetailTarget] = useState<AdminPaymentListItem | null>(null);

  // Any change to what is queried restarts from the first page.
  const updateFilters = (nextFilters: PaymentFilterState) => {
    setFilters(nextFilters);
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setPage(1);
  };

  const query = useMemo(
    () => ({
      accountType: filters.accountType === "ALL" ? undefined : filters.accountType,
      limit: paymentsPageSize,
      method: filters.method === "ALL" ? undefined : filters.method,
      page,
      search: filters.search.trim() || undefined,
      status: filters.status === "ALL" ? undefined : filters.status,
    }),
    [filters.accountType, filters.method, filters.search, filters.status, page],
  );

  const { data, error, isLoading } = useAdminPayments(query);

  const totalPages = Math.max(1, data?.meta.totalPages ?? 1);
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  return (
    <AdminShell
      breadcrumb={`${t("admin.breadcrumb.pages")} / ${t("admin.layout.nav.payments")}`}
      titleKey="admin.payments.page.title"
    >
      <div className="space-y-6">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {t("admin.payments.page.subtitle")}
        </p>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="md:col-span-2 xl:col-span-1">
              <Label htmlFor="paymentSearch">{t("admin.payments.filters.search")}</Label>
              <Input
                id="paymentSearch"
                type="search"
                placeholder={t("admin.payments.filters.searchPlaceholder")}
                className="mt-2 rounded-xl border-border"
                value={filters.search}
                onChange={(event) => updateFilters({ ...filters, search: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="paymentStatus">{t("admin.payments.filters.status")}</Label>
              <select
                id="paymentStatus"
                className={selectClass}
                value={filters.status}
                onChange={(event) =>
                  updateFilters({ ...filters, status: event.target.value as PaymentFilterState["status"] })
                }
              >
                <option value="ALL">{t("admin.common.all")}</option>
                {paymentStatuses.map((status) => (
                  <option key={status} value={status}>
                    {t(`admin.badges.paymentStatus.${status}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="paymentMethod">{t("admin.payments.filters.method")}</Label>
              <select
                id="paymentMethod"
                className={selectClass}
                value={filters.method}
                onChange={(event) =>
                  updateFilters({ ...filters, method: event.target.value as PaymentFilterState["method"] })
                }
              >
                <option value="ALL">{t("admin.common.all")}</option>
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {t(`admin.badges.paymentMethod.${method}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="paymentAccountType">{t("admin.payments.filters.accountType")}</Label>
              <select
                id="paymentAccountType"
                className={selectClass}
                value={filters.accountType}
                onChange={(event) =>
                  updateFilters({
                    ...filters,
                    accountType: event.target.value as PaymentFilterState["accountType"],
                  })
                }
              >
                <option value="ALL">{t("admin.common.all")}</option>
                {accountTypes.map((type) => (
                  <option key={type} value={type}>
                    {t(`admin.badges.type.${type}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="button" variant="outline" onClick={resetFilters}>
              {t("admin.actions.reset")}
            </Button>
          </div>
        </section>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground shadow-sm">
            {t("admin.payments.loading")}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5 text-sm font-medium text-[var(--danger-ink)]">
            {t("admin.payments.error")}
          </div>
        ) : (
          <>
            <PaymentsTable
              locale={locale}
              onViewDetails={setDetailTarget}
              payments={data?.data ?? []}
              t={t}
            />
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {t("admin.payments.pagination", {
                  page: data?.meta.page ?? page,
                  total: data?.meta.total ?? 0,
                  totalPages,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canGoPrevious}
                  onClick={() => setPage((currentPage) => currentPage - 1)}
                >
                  {t("admin.actions.previous")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canGoNext}
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                >
                  {t("admin.actions.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
      <AdminPaymentDetailModal
        locale={locale}
        onClose={() => setDetailTarget(null)}
        payment={detailTarget}
        t={t}
      />
    </AdminShell>
  );
}
