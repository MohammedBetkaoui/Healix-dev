"use client";

import { useMemo, useState } from "react";

import { AdminShell } from "@/components/admin/layout/AdminShell";
import { Button } from "@/components/ui/button";
import { useAdminVerifications } from "@/features/admin/hooks/use-admin-verifications";
import { formatAdminDateTime } from "@/lib/date-format";
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

// Cells starting with = + - @ (or tab/CR) are run as formulas by Excel, and
// requester names, emails and wilayas are user-supplied: prefix them with an
// apostrophe (OWASP CSV injection guidance). Purely numeric values such as
// "+213 555 12 34 56" cannot hold a formula and are left untouched.
const csvFormulaTrigger = /^[=+\-@\t\r]/;
const csvHarmlessNumeric = /^[+-]?[\d\s().-]+$/;

function toCsvCell(value: string | number) {
  let text = String(value);

  if (csvFormulaTrigger.test(text) && !csvHarmlessNumeric.test(text)) {
    text = `'${text}`;
  }

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(rows: (string | number)[][], fileName: string) {
  const csv = rows.map((row) => row.map(toCsvCell).join(",")).join("\r\n");
  // The BOM makes Excel read the file as UTF-8 (Arabic headers and names).
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: revoking synchronously can cancel the
  // download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Local date (not toISOString, which is UTC) so the file name matches the
// admin's calendar day.
function getLocalDateStamp(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
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

  // Exports exactly the rows shown in the table: the current server page
  // (verificationsPageSize) after the client-side filters, not every page.
  const exportVerificationsCsv = () => {
    const headers = [
      t("admin.verifications.table.type"),
      t("admin.verifications.table.requester"),
      t("admin.users.table.email"),
      t("admin.users.table.phone"),
      t("admin.verifications.table.wilaya"),
      t("admin.verifications.table.status"),
      t("admin.verifications.table.submittedAt"),
      t("admin.verifications.table.updatedAt"),
      t("admin.verifications.table.documents"),
      t("admin.verifications.table.completeness"),
    ];
    const rows = filteredRequests.map((request) => [
      t(`admin.badges.type.${request.type}`),
      request.requesterName,
      request.email,
      request.phone,
      request.wilaya,
      t(`admin.badges.status.${request.status}`),
      request.submittedAt ? formatAdminDateTime(request.submittedAt, locale) : "",
      formatAdminDateTime(request.updatedAt, locale),
      `${request.documentsCount}/${request.requiredDocumentsCount}`,
      `${request.completenessScore}%`,
    ]);

    downloadCsv([headers, ...rows], `verifications-${getLocalDateStamp(new Date())}.csv`);
  };

  const totalPages = Math.max(1, data?.meta.totalPages ?? 1);
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  return (
    <AdminShell
      breadcrumb={`${t("admin.breadcrumb.pages")} / ${t("admin.layout.nav.verifications")}`}
      titleKey="admin.verifications.page.title"
    >
      <div className="space-y-6">
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {t("admin.verifications.page.subtitle")}
        </p>
        <VerificationFilters
          filters={filters}
          onChange={updateFilters}
          onExport={exportVerificationsCsv}
          onReset={resetFilters}
          t={t}
        />
        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-sm text-muted-foreground shadow-sm">
            {t("admin.verifications.loading")}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-soft)] p-5 text-sm font-medium text-[var(--danger-ink)]">
            {t("admin.verifications.error")}
          </div>
        ) : (
          <>
            <VerificationsTable
              locale={locale}
              requests={filteredRequests}
              t={t}
            />
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
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
