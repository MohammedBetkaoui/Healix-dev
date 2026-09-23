"use client";

import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/layout/AdminShell";
import { useAdminUsers } from "@/features/admin/hooks/use-admin-users";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import {
  type AdminUserFilterState,
  AdminUserFilters,
} from "./AdminUserFilters";
import { AdminUsersTable } from "./AdminUsersTable";

const initialFilters: AdminUserFilterState = {
  role: "ALL",
  search: "",
  status: "ALL",
  wilaya: "",
};

export function AdminUsersPage() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const [filters, setFilters] = useState<AdminUserFilterState>(initialFilters);

  const query = useMemo(
    () => ({
      accountStatus: filters.status === "ALL" ? undefined : filters.status,
      limit: 20,
      page: 1,
      role: filters.role === "ALL" ? undefined : filters.role,
      search: filters.search.trim() || undefined,
      sortBy: "createdAt" as const,
      sortOrder: "desc" as const,
      wilaya: filters.wilaya.trim() || undefined,
    }),
    [filters.role, filters.search, filters.status, filters.wilaya],
  );

  const { data, error, isLoading } = useAdminUsers(query);

  return (
    <AdminShell
      breadcrumb={`${t("admin.breadcrumb.pages")} / ${t("admin.layout.nav.users")}`}
      titleKey="admin.users.page.title"
    >
      <div className="space-y-6">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {t("admin.users.page.subtitle")}
        </p>
        <AdminUserFilters
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters(initialFilters)}
          t={t}
        />
        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground shadow-sm">
            {t("admin.users.loading")}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5 text-sm font-medium text-[var(--danger-ink)]">
            {t("admin.users.error")}
          </div>
        ) : (
          <>
            <AdminUsersTable locale={locale} t={t} users={data?.data ?? []} />
            <p className="text-sm text-muted-foreground">
              {t("admin.users.pagination", {
                page: data?.meta.page ?? 1,
                total: data?.meta.total ?? 0,
                totalPages: data?.meta.totalPages ?? 1,
              })}
            </p>
          </>
        )}
      </div>
    </AdminShell>
  );
}
