"use client";

import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useDebouncedValue } from "@/features/ai-analyses/hooks/use-debounced-value";
import { useAccountProfile } from "@/features/account/hooks/use-account";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { useMedicationOptions } from "../hooks/use-medication-search";
import { usePrescriptionCapabilities } from "../hooks/use-prescription-capabilities";
import { useRenewPrescription } from "../hooks/use-prescription-mutations";
import { usePrescriptionFilterOptions, usePrescriptions, usePrescriptionStats } from "../hooks/use-prescriptions";
import { type Prescription, type PrescriptionListFilters } from "../types/prescription.types";
import { getPrescriptionErrorKey } from "../utils/prescription-errors";
import { periodStart } from "../utils/prescription-format";
import { matchesDisplayStatus, toStoredStatusFilter } from "../utils/prescription-status";
import { type BuilderResult, NewPrescriptionDrawer } from "./NewPrescriptionDrawer";
import { PrescriptionDetail } from "./PrescriptionDetail";
import { PrescriptionFilters, type PrescriptionFilterState } from "./PrescriptionFilters";
import { PrescriptionErrorState, PrescriptionsListSkeleton } from "./PrescriptionStateViews";
import { PrescriptionStats } from "./PrescriptionStats";
import { PrescriptionsHeader } from "./PrescriptionsHeader";
import { PrescriptionsPagination } from "./PrescriptionsPagination";
import { PrescriptionsTable } from "./PrescriptionsTable";

type PrescriptionsPageProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
};

type DetailState = {
  action?: "cancel" | "preview";
  id: string;
};

type BuilderState = {
  /** A draft to continue; absent for a new prescription. */
  draft?: Prescription;
};

type Notice = { message: string; tone: "error" | "success" };

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const initialFilters: PrescriptionFilterState = {
  medicationId: "",
  patientId: "",
  period: "",
  prescriberId: "",
  query: "",
  status: "",
  type: "",
};

export function PrescriptionsPage({ accountType }: PrescriptionsPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const account = useAccountProfile();
  const initials = getAccountInitials(currentUser.data?.fullName);
  const { capabilities } = usePrescriptionCapabilities();
  const [filters, setFilters] = useState<PrescriptionFilterState>(initialFilters);
  const [page, setPage] = useState(1);
  // A link from another page (a consultation, a notification) opens a prescription.
  const requestedPrescription = useSearchParams()?.get("prescription") ?? null;
  const [detail, setDetail] = useState<DetailState | null>(requestedPrescription ? { id: requestedPrescription } : null);
  const [builder, setBuilder] = useState<BuilderState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const renew = useRenewPrescription();

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const query = useDebouncedValue(filters.query.trim(), SEARCH_DEBOUNCE_MS);
  // Computed once per period: a date taken at every render would change the
  // request (and refetch) forever.
  const from = useMemo(() => (filters.period ? periodStart(Number(filters.period)) : undefined), [filters.period]);
  const apiFilters = useMemo<PrescriptionListFilters>(() => ({
    from,
    limit: PAGE_SIZE,
    medicationId: filters.medicationId || undefined,
    page,
    patientId: filters.patientId || undefined,
    prescriberId: filters.prescriberId || undefined,
    query: query || undefined,
    status: toStoredStatusFilter(filters.status),
    type: filters.type || undefined,
  }), [filters.medicationId, filters.patientId, filters.prescriberId, filters.status, filters.type, from, page, query]);

  const list = usePrescriptions(apiFilters);
  const stats = usePrescriptionStats();
  const medications = useMedicationOptions();
  const options = usePrescriptionFilterOptions();

  // PRINTED and EXPIRED are VALIDATED in storage: the page requested them as
  // VALIDATED, the rows are narrowed here.
  const rows = useMemo(() => (list.data?.data ?? []).filter((row) => matchesDisplayStatus(row, filters.status)), [filters.status, list.data]);
  const narrowed = filters.status === "PRINTED" || filters.status === "EXPIRED";

  const shellProps = accountType === "ESTABLISHMENT"
    ? {
        accountType: "ESTABLISHMENT" as const,
        navSections: establishmentNavSections,
        titleKey: "dashboard.sidebar.establishment.prescriptions",
        user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: account.data?.establishment?.name || t("dashboard.clinical.workspace") },
      }
    : {
        accountType: "INDEPENDENT_DOCTOR" as const,
        navSections: doctorNavSections,
        titleKey: "dashboard.sidebar.doctor.prescriptions",
        user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: t("dashboard.clinical.doctor.practice"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace"), roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: t("dashboard.clinical.doctor.workspace") },
      };

  const changeFilters = (next: PrescriptionFilterState) => {
    setFilters(next);
    setPage(1);
  };
  const success = (message: string) => setNotice({ message, tone: "success" });
  const failure = (error: unknown) => setNotice({ message: t(`prescriptions.errors.${getPrescriptionErrorKey(error)}`), tone: "error" });

  // Renewing creates a new draft on the API; the original stays unchanged.
  const startRenewal = (id: string) => {
    renew.mutate(id, {
      onError: failure,
      onSuccess: (draft) => {
        setDetail(null);
        setBuilder({ draft });
        success(t("prescriptions.notices.renewal"));
      },
    });
  };

  const finishBuilder = ({ prescription, validated }: BuilderResult) => {
    setBuilder(null);
    if (!validated) {
      success(t("prescriptions.notices.draftSaved"));
      return;
    }
    const at = new Date(prescription.validatedAt ?? Date.now());
    const tag = locale === "ar" ? "ar-DZ" : "fr-DZ";
    success(t("prescriptions.notices.validated", {
      date: new Intl.DateTimeFormat(tag).format(at),
      doctor: prescription.prescriber.fullName ?? "",
      time: new Intl.DateTimeFormat(tag, { hour: "2-digit", hourCycle: "h23", minute: "2-digit" }).format(at),
    }));
  };

  return (
    <DashboardShell {...shellProps} activeKey="prescriptions" breadcrumbLabel={t("prescriptions.page.breadcrumb")}>
      <div className="workspace-stack">
        <PrescriptionsHeader capabilities={capabilities} onNew={() => { setBuilder({}); setDetail(null); }} onTemplates={() => success(t("prescriptions.notices.templates"))} t={t} />

        <section className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-3 text-[var(--accent-dark)]">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} strokeWidth={1.8} aria-hidden="true" />
          <div><h2 className="text-sm font-semibold">{t("prescriptions.security.title")}</h2><p className="mt-1 text-[.72rem] leading-5">{t("prescriptions.security.description")}</p></div>
        </section>

        <PrescriptionStats isLoading={stats.isLoading} stats={stats.data} t={t} />
        <PrescriptionFilters filters={filters} locale={locale} medications={medications.data ?? []} onChange={changeFilters} onReset={() => changeFilters(initialFilters)} patients={options.data?.patients ?? []} practitioners={options.data?.prescribers ?? []} resultCount={narrowed ? rows.length : (list.data?.meta.total ?? 0)} t={t} />

        {list.isLoading ? <PrescriptionsListSkeleton t={t} /> : list.isError && !list.data ? <PrescriptionErrorState errorKey={getPrescriptionErrorKey(list.error)} onRetry={() => void list.refetch()} t={t} /> : (
          <>
            <PrescriptionsTable capabilities={capabilities} locale={locale} onCancel={(prescription) => setDetail({ id: prescription.id, action: "cancel" })} onOpen={(prescription) => setDetail({ id: prescription.id })} onPrint={(prescription) => setDetail({ id: prescription.id, action: "preview" })} onRenew={(prescription) => startRenewal(prescription.id)} prescriptions={rows} t={t} />
            {list.data ? <PrescriptionsPagination meta={list.data.meta} onPageChange={setPage} t={t} /> : null}
          </>
        )}
      </div>

      {notice ? <div className={`surface-raised fixed bottom-6 end-6 z-[80] flex max-w-[min(420px,calc(100vw-32px))] items-center gap-2.5 px-4 py-3 text-sm font-medium text-[var(--text-primary)] ${notice.tone === "error" ? "border-[var(--danger-line)]" : "border-[var(--success-line)]"}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.tone === "error" ? <AlertTriangle size={17} className="shrink-0 text-[var(--danger-ink)]" aria-hidden="true" /> : <CheckCircle2 size={17} className="shrink-0 text-[var(--success-ink)]" aria-hidden="true" />}{notice.message}</div> : null}

      {builder ? <NewPrescriptionDrawer capabilities={capabilities} draft={builder.draft} locale={locale} onClose={() => setBuilder(null)} onDone={finishBuilder} t={t} /> : null}
      {detail ? <PrescriptionDetail capabilities={capabilities} id={detail.id} initialAction={detail.action} locale={locale} onClose={() => setDetail(null)} onEdit={(draft) => { setDetail(null); setBuilder({ draft }); }} onNotice={success} onRenew={startRenewal} t={t} /> : null}
    </DashboardShell>
  );
}
