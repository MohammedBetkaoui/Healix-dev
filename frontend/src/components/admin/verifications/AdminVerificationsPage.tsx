"use client";

import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { useAdminVerifications } from "@/features/admin/hooks/use-admin-verifications";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import {
  type AdminVerificationListItem,
  type VerificationPriority,
} from "@/types/admin";

import {
  type VerificationFilterState,
  VerificationFilters,
} from "./VerificationFilters";
import { VerificationsTable } from "./VerificationsTable";

const initialFilters: VerificationFilterState = {
  documentsComplete: "ALL",
  priority: "ALL",
  search: "",
  status: "ALL",
  submittedFrom: "",
  submittedTo: "",
  type: "ALL",
  wilaya: "",
};

const verificationsPageSize = 20;

function getDerivedPriority(
  request: AdminVerificationListItem,
): VerificationPriority {
  if (request.completenessScore < 75) {
    return "URGENT";
  }

  if (request.completenessScore < 90) {
    return "REVIEW";
  }

  return "NORMAL";
}

export function AdminVerificationsPage() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const [filters, setFilters] = useState<VerificationFilterState>(initialFilters);
  const [page, setPage] = useState(1);

  const updateFilters = (nextFilters: VerificationFilterState) => {
    setFilters(nextFilters);
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(initialFilters);
    setPage(1);
  };

  const query = useMemo(
    () => ({
      limit: verificationsPageSize,
      page,
      search: filters.search.trim() || undefined,
      sortBy: "submittedAt" as const,
      sortOrder: "desc" as const,
      status: filters.status === "ALL" ? undefined : filters.status,
      submittedFrom: filters.submittedFrom || undefined,
      submittedTo: filters.submittedTo || undefined,
      type: filters.type === "ALL" ? undefined : filters.type,
      wilaya: filters.wilaya.trim() || undefined,
    }),
    [
      filters.search,
      filters.status,
      filters.submittedFrom,
      filters.submittedTo,
      filters.type,
      filters.wilaya,
      page,
    ],
  );

  const { data, error, isLoading } = useAdminVerifications(query);

  const filteredRequests = useMemo(() => {
    return (data?.data ?? []).filter((request) => {
      const documentsAreComplete =
        request.documentsCount >= request.requiredDocumentsCount;
      const matchesDocuments =
        filters.documentsComplete === "ALL" ||
        (filters.documentsComplete === "YES" && documentsAreComplete) ||
        (filters.documentsComplete === "NO" && !documentsAreComplete);
      const matchesPriority =
        filters.priority === "ALL" ||
        getDerivedPriority(request) === filters.priority;

      return matchesPriority && matchesDocuments;
    });
  }, [data?.data, filters.documentsComplete, filters.priority]);

  const totalPages = Math.max(1, data?.meta.totalPages ?? 1);
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  return (
    <AdminShell
      breadcrumb={`${t("admin.breadcrumb.pages")} / ${t("admin.layout.nav.verifications")}`}
      titleKey="admin.verifications.page.title"
    >
      <div className="space-y-6">
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          {t("admin.verifications.page.subtitle")}
        </p>
        <VerificationFilters
          filters={filters}
          onChange={updateFilters}
          onReset={resetFilters}
          t={t}
        />
        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-600 shadow-sm">
            {t("admin.verifications.loading")}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm font-medium text-red-700">
            {t("admin.verifications.error")}
          </div>
        ) : (
          <>
            <VerificationsTable requests={filteredRequests} t={t} />
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                {t("admin.verifications.pagination", {
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
    </AdminShell>
  );
}
