"use client";

import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminSubscriptions } from "@/features/admin/hooks/use-admin-subscriptions";
import { type AdminSubscriptionRow } from "@/features/admin/subscriptions.types";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { type AccountType, type SubscriptionStatus } from "@/types/subscription";

import { AdminSubscriptionDetailDialog } from "./AdminSubscriptionDetailDialog";
import { AdminSubscriptionsTable } from "./AdminSubscriptionsTable";

type FilterState = {
  accountType: "ALL" | AccountType;
  expiringSoon: boolean;
  search: string;
  status: "ALL" | SubscriptionStatus;
};

const initialFilters: FilterState = {
  accountType: "ALL",
  expiringSoon: false,
  search: "",
  status: "ALL",
};

const pageSize = 20;
// The "expires within 7 days" filter, the horizon of the first reminders.
export const EXPIRING_SOON_DAYS = 7;

const statuses: SubscriptionStatus[] = ["TRIALING", "ACTIVE", "EXPIRED", "CANCELED", "NO_PLAN"];
const accountTypes: AccountType[] = ["ESTABLISHMENT", "INDEPENDENT_DOCTOR"];
const selectClass = "mt-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm";

// The console for the cases the card payment does not cover. A normal purchase
// is activated by the payment itself: it is not waiting here for anyone.
export function AdminSubscriptionsPage() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<AdminSubscriptionRow | null>(null);

  // Any change to what is queried restarts from the first page.
  const updateFilters = (next: FilterState) => {
    setFilters(next);
    setPage(1);
  };

  const query = useMemo(
    () => ({
      accountType: filters.accountType === "ALL" ? undefined : filters.accountType,
      expiresWithinDays: filters.expiringSoon ? EXPIRING_SOON_DAYS : undefined,
      limit: pageSize,
      page,
      search: filters.search.trim() || undefined,
      status: filters.status === "ALL" ? undefined : filters.status,
    }),
    [filters.accountType, filters.expiringSoon, filters.search, filters.status, page],
  );
  const { data, error, isLoading } = useAdminSubscriptions(query);
  const totalPages = Math.max(1, data?.meta.totalPages ?? 1);

  return (
    <AdminShell
      breadcrumb={`${t("admin.breadcrumb.pages")} / ${t("admin.layout.nav.subscriptions")}`}
      titleKey="admin.subscriptions.page.title"
    >
      <div className="space-y-6">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {t("admin.subscriptions.page.subtitle")}
        </p>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="md:col-span-2 xl:col-span-1">
              <Label htmlFor="subscriptionSearch">{t("admin.subscriptions.filters.search")}</Label>
              <Input
                id="subscriptionSearch"
                type="search"
                placeholder={t("admin.subscriptions.filters.searchPlaceholder")}
                className="mt-2 rounded-xl border-border"
                value={filters.search}
                onChange={(event) => updateFilters({ ...filters, search: event.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="subscriptionStatus">{t("admin.subscriptions.filters.status")}</Label>
              <select
                id="subscriptionStatus"
                className={selectClass}
                value={filters.status}
                onChange={(event) => updateFilters({ ...filters, status: event.target.value as FilterState["status"] })}
              >
                <option value="ALL">{t("admin.common.all")}</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>{t(`admin.badges.subscriptionStatus.${status}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="subscriptionAccountType">{t("admin.subscriptions.filters.accountType")}</Label>
              <select
                id="subscriptionAccountType"
                className={selectClass}
                value={filters.accountType}
                onChange={(event) => updateFilters({ ...filters, accountType: event.target.value as FilterState["accountType"] })}
              >
                <option value="ALL">{t("admin.common.all")}</option>
                {accountTypes.map((type) => (
                  <option key={type} value={type}>{t(`admin.badges.type.${type}`)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex h-11 items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={filters.expiringSoon}
                  onChange={(event) => updateFilters({ ...filters, expiringSoon: event.target.checked })}
                />
                {t("admin.subscriptions.filters.expiring", { days: EXPIRING_SOON_DAYS })}
              </label>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="button" variant="outline" onClick={() => updateFilters(initialFilters)}>
              {t("admin.actions.reset")}
            </Button>
          </div>
        </section>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground shadow-sm">
            {t("admin.subscriptions.loading")}
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5 text-sm font-medium text-[var(--danger-ink)]">
            {t("admin.subscriptions.error")}
          </div>
        ) : (
          <>
            <AdminSubscriptionsTable accounts={data?.data ?? []} locale={locale} onViewDetails={setTarget} t={t} />
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {t("admin.subscriptions.pagination", { page: data?.meta.page ?? page, total: data?.meta.total ?? 0, totalPages })}
              </p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
                  {t("admin.actions.previous")}
                </Button>
                <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                  {t("admin.actions.next")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
      <AdminSubscriptionDetailDialog account={target} locale={locale} onClose={() => setTarget(null)} t={t} />
    </AdminShell>
  );
}
