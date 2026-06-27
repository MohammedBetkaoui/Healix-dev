"use client";

import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { useAdminAuditLogs } from "@/features/admin/hooks/use-admin-audit-logs";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { type AdminAuditLogItem } from "@/types/admin";

import {
  type AuditFilterState,
  AdminAuditFilters,
} from "./AdminAuditFilters";
import { AdminAuditLogDetailModal } from "./AdminAuditLogDetailModal";
import { AdminAuditLogsTable, getAuditStatus } from "./AdminAuditLogsTable";

const initialFilters: AuditFilterState = {
  action: "ALL",
  ipAddress: "",
  role: "ALL",
  search: "",
  status: "ALL",
};

const auditLogsPageSize = 20;

export function AdminAuditLogsPage() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const [filters, setFilters] = useState<AuditFilterState>(initialFilters);
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AdminAuditLogItem | null>(null);

  const updateFilters = (nextFilters: AuditFilterState) => {
    setFilters(nextFilters);
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setPage(1);
  };

  const query = useMemo(
    () => ({
      action: filters.action === "ALL" ? undefined : filters.action,
      ipAddress: filters.ipAddress.trim() || undefined,
      limit: auditLogsPageSize,
      page,
      role: filters.role === "ALL" ? undefined : filters.role,
      search: filters.search.trim() || undefined,
      sortBy: "createdAt" as const,
      sortOrder: "desc" as const,
    }),
    [filters.action, filters.ipAddress, filters.role, filters.search, page],
  );

  const { data, error, isLoading } = useAdminAuditLogs(query);

  const filteredLogs = useMemo(() => {
    return (data?.data ?? []).filter((log) => {
      const matchesStatus =
        filters.status === "ALL" || getAuditStatus(log.action) === filters.status;

      return matchesStatus;
    });
  }, [data?.data, filters.status]);

  const totalPages = Math.max(1, data?.meta.totalPages ?? 1);
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  return (
    <AdminShell
      breadcrumb={`${t("admin.breadcrumb.pages")} / ${t("admin.layout.nav.auditLogs")}`}
      titleKey="admin.audit.page.title"
    >
      <div className="space-y-6">
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          {t("admin.audit.page.subtitle")}
        </p>
        <AdminAuditFilters
          filters={filters}
          onChange={updateFilters}
          onReset={resetFilters}
          t={t}
        />
        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-600 shadow-sm">
            {t("admin.audit.loading")}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-medium text-red-700">
            {t("admin.audit.error")}
          </div>
        ) : (
          <>
            <AdminAuditLogsTable
              logs={filteredLogs}
              onViewDetails={setSelectedLog}
              t={t}
            />
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                {t("admin.audit.pagination", {
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
      <AdminAuditLogDetailModal
        log={selectedLog}
        onClose={() => setSelectedLog(null)}
        t={t}
      />
    </AdminShell>
  );
}
