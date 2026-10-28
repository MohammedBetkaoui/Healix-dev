"use client";

import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock3, FileX2, ShieldCheck } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { useAiRunsOverview } from "@/features/ai-analyses/hooks/use-ai-runs-overview";
import { useDebouncedValue } from "@/features/ai-analyses/hooks/use-debounced-value";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useAccountProfile } from "@/features/account/hooks/use-account";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { useReportCapabilities } from "../hooks/use-report-capabilities";
import { useReportFilterOptions, useReports, useReportStats } from "../hooks/use-reports";
import { type ClinicalReport } from "../types/report.types";
import { getReportErrorKey } from "../utils/report-errors";
import { initialReportFilters, summarizeAiReportAvailability, toReportListFilters, type ReportFilterValue } from "../utils/report-utils";
import { type ReportDraftResult } from "./CreateReportDrawer";
import { ReportErrorState, ReportsListSkeleton } from "./ReportStateViews";
import { ReportsFilters } from "./ReportsFilters";
import { ReportsHeader } from "./ReportsHeader";
import { ReportsStats } from "./ReportsStats";
import { ReportsTable } from "./ReportsTable";

const ReportDetailDrawer = dynamic(() => import("./ReportDetailDrawer").then((module) => module.ReportDetailDrawer), { ssr: false });
const ImportReportDrawer = dynamic(() => import("./ImportReportDrawer").then((module) => module.ImportReportDrawer), { ssr: false });
const CreateReportDrawer = dynamic(() => import("./CreateReportDrawer").then((module) => module.CreateReportDrawer), { ssr: false });

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type Notice = { message: string; tone: "error" | "success" };

type ReportsPageProps = { accountType: "DOCTOR" | "ESTABLISHMENT" };

export function ReportsPage({ accountType }: ReportsPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const account = useAccountProfile();
  const initials = getAccountInitials(currentUser.data?.fullName);
  const { capabilities } = useReportCapabilities();
  // 50 is the most the overview returns per page (a larger limit answers 400).
  const aiRuns = useAiRunsOverview({ limit: 50, page: 1 });
  const requestedReport = useSearchParams()?.get("report") ?? null;
  const [filters, setFilters] = useState<ReportFilterValue>(initialReportFilters);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(requestedReport);
  const [importOpen, setImportOpen] = useState(false);
  const [editor, setEditor] = useState<{ draft?: ClinicalReport } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const query = useDebouncedValue(filters.query.trim(), SEARCH_DEBOUNCE_MS);
  const apiFilters = useMemo(() => toReportListFilters(filters, query, page, PAGE_SIZE), [filters, page, query]);
  const list = useReports(apiFilters);
  const stats = useReportStats();
  const options = useReportFilterOptions();
  const availability = useMemo(() => summarizeAiReportAvailability(aiRuns.data?.items ?? []), [aiRuns.data?.items]);

  const success = (message: string) => setNotice({ message, tone: "success" });
  const changeFilters = (next: ReportFilterValue) => {
    setFilters(next);
    setPage(1);
  };

  const finishEditor = ({ finalized, report }: ReportDraftResult) => {
    setEditor(null);
    setSelectedId(report.id);
    success(finalized ? t("reports.notices.finalized", { number: report.number ?? "" }) : t("reports.notices.draftSaved"));
  };

  const shellProps = accountType === "ESTABLISHMENT"
    ? {
        accountType: "ESTABLISHMENT" as const,
        navSections: establishmentNavSections,
        user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: account.data?.establishment?.name || t("dashboard.clinical.workspace") },
      }
    : {
        accountType: "INDEPENDENT_DOCTOR" as const,
        navSections: doctorNavSections,
        user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: t("dashboard.clinical.doctor.practice"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace"), roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: t("dashboard.clinical.doctor.workspace") },
      };

  return (
    <DashboardShell {...shellProps} activeKey="reports" breadcrumbLabel={t("reports.page.breadcrumb")} titleKey="reports.page.title">
      <div className="workspace-stack">
        <ReportsHeader capabilities={capabilities} onCreate={() => setEditor({})} onImport={() => setImportOpen(true)} t={t} />
        <section className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" /><div><p className="text-xs font-semibold text-[var(--accent-dark)]">{t("reports.confidentiality.title")}</p><p className="mt-1 text-[0.7rem] leading-5 text-[var(--text-secondary)]">{t("reports.confidentiality.description")}</p></div></section>
        <ReportsStats isLoading={stats.isLoading} stats={stats.data} t={t} />
        <AiAvailabilityPanel availability={availability} error={aiRuns.isError} loading={aiRuns.isLoading} t={t} />
        <ReportsFilters authors={options.data?.authors ?? []} filters={filters} locale={locale} onChange={changeFilters} onReset={() => changeFilters(initialReportFilters)} patients={options.data?.patients ?? []} resultCount={list.data?.meta.total ?? 0} t={t} />
        {list.isLoading ? <ReportsListSkeleton t={t} /> : list.isError && !list.data ? <ReportErrorState errorKey={getReportErrorKey(list.error)} onRetry={() => void list.refetch()} t={t} /> : (
          <>
            <ReportsTable accountType={accountType} locale={locale} onOpen={(report) => setSelectedId(report.id)} reports={list.data?.data ?? []} t={t} />
            {list.data && list.data.meta.totalPages > 1 ? (
              <nav className="flex items-center justify-between gap-3" aria-label={t("reports.pagination.label")}>
                <button type="button" className="clinical-button" disabled={list.data.meta.page <= 1} onClick={() => setPage(list.data.meta.page - 1)}><ChevronLeft size={15} className="rtl:rotate-180" aria-hidden="true" />{t("reports.pagination.previous")}</button>
                <span className="text-[0.72rem] text-[var(--text-secondary)]">{t("reports.pagination.page", { page: list.data.meta.page, total: list.data.meta.totalPages })}</span>
                <button type="button" className="clinical-button" disabled={list.data.meta.page >= list.data.meta.totalPages} onClick={() => setPage(list.data.meta.page + 1)}>{t("reports.pagination.next")}<ChevronRight size={15} className="rtl:rotate-180" aria-hidden="true" /></button>
              </nav>
            ) : null}
          </>
        )}
      </div>
      {selectedId && !editor ? <ReportDetailDrawer key={selectedId} accountType={accountType} capabilities={capabilities} id={selectedId} locale={locale} onClose={() => setSelectedId(null)} onEdit={(draft) => { setSelectedId(null); setEditor({ draft }); }} onNotice={success} onOpenReport={setSelectedId} t={t} /> : null}
      {importOpen ? <ImportReportDrawer locale={locale} onClose={() => setImportOpen(false)} onDone={(report) => { setImportOpen(false); setSelectedId(report.id); success(t("reports.notices.imported", { number: report.number ?? "" })); }} t={t} /> : null}
      {editor ? <CreateReportDrawer capabilities={capabilities} draft={editor.draft} locale={locale} onClose={() => setEditor(null)} onDone={finishEditor} t={t} /> : null}
      {notice ? <div role={notice.tone === "error" ? "alert" : "status"} className={`fixed bottom-5 end-5 z-[90] flex max-w-sm items-start gap-2 rounded-[var(--radius-md)] border bg-[var(--surface-elevated)] px-4 py-3 text-xs font-medium text-[var(--text-primary)] shadow-[var(--shadow-raised)] ${notice.tone === "error" ? "border-[var(--danger-line)]" : "border-[var(--success-line)]"}`}>{notice.tone === "error" ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--danger-ink)]" aria-hidden="true" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--success-ink)]" aria-hidden="true" />}{notice.message}</div> : null}
    </DashboardShell>
  );
}

function AiAvailabilityPanel({ availability, error, loading, t }: { availability: ReturnType<typeof summarizeAiReportAvailability>; error: boolean; loading: boolean; t: ReturnType<typeof useTranslation>["t"] }) {
  if (loading) return <section className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-secondary)]"><Clock3 size={16} className="animate-pulse text-[var(--medical)]" aria-hidden="true" />{t("reports.ai.loading")}</section>;
  if (error) return <section className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-4 py-3 text-xs text-[var(--warning-ink)]"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><div><p className="font-semibold">{t("reports.ai.liveUnavailable")}</p><p className="mt-1 text-[0.68rem] leading-5">{t("reports.ai.liveUnavailableHelp")}</p></div></section>;
  if (!availability.notDecided && !availability.rejected && !availability.notSucceeded) return null;
  const items = [
    { count: availability.notDecided, icon: Clock3, key: "notDecided" },
    { count: availability.rejected, icon: FileX2, key: "rejected" },
    { count: availability.notSucceeded, icon: AlertTriangle, key: "notSucceeded" },
  ].filter((item) => item.count > 0);
  return <section className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4"><h2 className="text-xs font-semibold">{t("reports.ai.availabilityTitle")}</h2><div className="mt-3 grid gap-2 sm:grid-cols-3">{items.map(({ count, icon: Icon, key }) => <div key={key} className="flex items-start gap-2 rounded-[var(--radius-sm)] bg-[var(--surface-muted)] p-3"><Icon size={15} className="mt-0.5 shrink-0 text-[var(--text-secondary)]" aria-hidden="true" /><p className="text-[0.68rem] leading-5"><strong className="clinical-figure me-1">{count}</strong>{t(`reports.ai.blockers.${key}`)}</p></div>)}</div></section>;
}
