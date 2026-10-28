"use client";

import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { doctorNavSections, establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { useDebouncedValue } from "@/features/ai-analyses/hooks/use-debounced-value";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { getPatientDisplayName } from "@/features/prescriptions/utils/prescription-format";
import { type BuilderResult } from "@/features/prescriptions/components/NewPrescriptionDrawer";
import { usePrescriptionCapabilities } from "@/features/prescriptions/hooks/use-prescription-capabilities";
import { type ReportDraftResult } from "@/features/reports/components/CreateReportDrawer";
import { type PatientChoice } from "@/features/reports/components/ReportPatientPicker";
import { useReportCapabilities } from "@/features/reports/hooks/use-report-capabilities";
import { useAccountProfile } from "@/features/account/hooks/use-account";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { getDirection, useStoredLocale, useTranslation } from "@/lib/i18n";

import { useConsultationCapabilities, useConsultationFilterOptions, useConsultations, useConsultationStats } from "../hooks/use-consultations";
import { type ConsultationDetail } from "../types/consultation.types";
import { getConsultationErrorKey, initialConsultationFilters, toConsultationListFilters, type ConsultationFilterValue } from "../utils/consultation-utils";
import { ConsultationPrescribeDrawer, ConsultationReportDrawer } from "./ConsultationActionDrawers";
import { ConsultationDetailDrawer } from "./ConsultationDetailDrawer";
import { ConsultationEditorDrawer } from "./ConsultationEditorDrawer";
import { ConsultationErrorState, ConsultationsListSkeleton } from "./ConsultationStateViews";
import { ConsultationsFilters } from "./ConsultationsFilters";
import { ConsultationsHeader } from "./ConsultationsHeader";
import { ConsultationsStats } from "./ConsultationsStats";
import { ConsultationsTable } from "./ConsultationsTable";
import { NewConsultationPatientDialog } from "./NewConsultationPatientDialog";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

type Notice = { message: string; tone: "error" | "success" };

type ConsultationsPageProps = { accountType: "DOCTOR" | "ESTABLISHMENT" };

export function ConsultationsPage({ accountType }: ConsultationsPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const direction = getDirection(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const account = useAccountProfile();
  const initials = getAccountInitials(currentUser.data?.fullName);
  const { capabilities } = useConsultationCapabilities();
  const { capabilities: prescriptionCapabilities } = usePrescriptionCapabilities();
  const { capabilities: reportCapabilities } = useReportCapabilities();
  const [filters, setFilters] = useState<ConsultationFilterValue>(initialConsultationFilters);
  const [page, setPage] = useState(1);
  // A link from another page (a prescription, a report) opens a consultation.
  const requestedConsultation = useSearchParams()?.get("consultation") ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(requestedConsultation);
  const [choosingPatient, setChoosingPatient] = useState(false);
  const [editing, setEditing] = useState<ConsultationDetail | null>(null);
  const [creatingFor, setCreatingFor] = useState<PatientChoice | null>(null);
  const [prescribing, setPrescribing] = useState<ConsultationDetail | null>(null);
  const [reporting, setReporting] = useState<ConsultationDetail | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const query = useDebouncedValue(filters.query.trim(), SEARCH_DEBOUNCE_MS);
  const apiFilters = useMemo(() => toConsultationListFilters(filters, query, page, PAGE_SIZE), [filters, page, query]);
  const list = useConsultations(apiFilters);
  const stats = useConsultationStats();
  const options = useConsultationFilterOptions();

  const success = (message: string) => setNotice({ message, tone: "success" });
  const changeFilters = (next: ConsultationFilterValue) => {
    setFilters(next);
    setPage(1);
  };

  const finishPrescription = ({ prescription, validated }: BuilderResult) => {
    setPrescribing(null);
    if (!validated) return success(t("prescriptions.notices.draftSaved"));
    const at = new Date(prescription.validatedAt ?? Date.now());
    const tag = locale === "ar" ? "ar-DZ" : "fr-DZ";
    success(t("prescriptions.notices.validated", {
      date: new Intl.DateTimeFormat(tag).format(at),
      doctor: prescription.prescriber.fullName ?? "",
      time: new Intl.DateTimeFormat(tag, { hour: "2-digit", hourCycle: "h23", minute: "2-digit" }).format(at),
    }));
  };

  const finishReport = ({ finalized, report }: ReportDraftResult) => {
    setReporting(null);
    success(finalized ? t("reports.notices.finalized", { number: report.number ?? "" }) : t("reports.notices.draftSaved"));
  };

  // The editor closes once its work is saved: the draft keeps its content and the
  // finalization freezes the note (the list and the drawer refresh themselves).
  const finishEditing = (consultation: ConsultationDetail) => {
    setEditing(null);
    setCreatingFor(null);
    success(consultation.status === "COMPLETED" ? t("consultations.notices.finalized") : t("consultations.notices.saved"));
    if (consultation.status === "COMPLETED") setSelectedId(consultation.id);
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
    <DashboardShell {...shellProps} activeKey="consultations" breadcrumbLabel={t("consultations.page.breadcrumb")} titleKey="consultations.page.title">
      <div className="workspace-stack">
        <ConsultationsHeader canCreate={capabilities.canCreateConsultation} onCreate={() => setChoosingPatient(true)} t={t} />
        <section className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" /><div><p className="text-xs font-semibold text-[var(--accent-dark)]">{t("consultations.confidentiality.title")}</p><p className="mt-1 text-[0.7rem] leading-5 text-[var(--text-secondary)]">{t("consultations.confidentiality.description")}</p></div></section>
        <ConsultationsStats isLoading={stats.isLoading} stats={stats.data} t={t} />
        <ConsultationsFilters doctors={options.data?.doctors ?? []} filters={filters} locale={locale} onChange={changeFilters} onReset={() => changeFilters(initialConsultationFilters)} patients={options.data?.patients ?? []} resultCount={list.data?.meta.total ?? 0} t={t} />
        {list.isLoading ? <ConsultationsListSkeleton t={t} /> : list.isError && !list.data ? <ConsultationErrorState errorKey={getConsultationErrorKey(list.error)} onRetry={() => void list.refetch()} t={t} /> : (
          <>
            <ConsultationsTable consultations={list.data?.data ?? []} locale={locale} onOpen={(consultation) => setSelectedId(consultation.id)} t={t} />
            {list.data && list.data.meta.totalPages > 1 ? (
              <nav className="flex items-center justify-between gap-3" aria-label={t("consultations.pagination.label")}>
                <button type="button" className="clinical-button" disabled={list.data.meta.page <= 1} onClick={() => setPage(list.data.meta.page - 1)}><ChevronLeft size={15} className="rtl:rotate-180" aria-hidden="true" />{t("consultations.pagination.previous")}</button>
                <span className="text-[0.72rem] text-[var(--text-secondary)]">{t("consultations.pagination.page", { page: list.data.meta.page, total: list.data.meta.totalPages })}</span>
                <button type="button" className="clinical-button" disabled={list.data.meta.page >= list.data.meta.totalPages} onClick={() => setPage(list.data.meta.page + 1)}>{t("consultations.pagination.next")}<ChevronRight size={15} className="rtl:rotate-180" aria-hidden="true" /></button>
              </nav>
            ) : null}
          </>
        )}
      </div>

      {selectedId ? <ConsultationDetailDrawer accountType={accountType} canAddAddendum={capabilities.canAddAddendum} canEdit={capabilities.canEditConsultation} canPrescribe={prescriptionCapabilities.canCreatePrescription} canWriteReport={reportCapabilities.canCreateReports} closeOnEscape={!prescribing && !reporting && !editing} id={selectedId} locale={locale} onClose={() => setSelectedId(null)} onEdit={setEditing} onPrescribe={setPrescribing} onWriteReport={setReporting} t={t} /> : null}
      {editing ? <ConsultationEditorDrawer consultation={editing} direction={direction} onClose={() => setEditing(null)} onDone={finishEditing} patient={{ id: editing.patient.id, label: getPatientDisplayName(editing.patient, locale) }} t={t} /> : null}
      {creatingFor ? <ConsultationEditorDrawer consultation={null} direction={direction} onClose={() => setCreatingFor(null)} onDone={finishEditing} patient={creatingFor} t={t} /> : null}
      {prescribing ? <ConsultationPrescribeDrawer capabilities={prescriptionCapabilities} consultation={prescribing} locale={locale} onClose={() => setPrescribing(null)} onDone={finishPrescription} t={t} /> : null}
      {reporting ? <ConsultationReportDrawer capabilities={reportCapabilities} consultation={reporting} locale={locale} onClose={() => setReporting(null)} onDone={finishReport} t={t} /> : null}
      {choosingPatient ? <NewConsultationPatientDialog direction={direction} locale={locale} onCancel={() => setChoosingPatient(false)} onChoose={(patient) => { setChoosingPatient(false); setCreatingFor(patient); }} t={t} /> : null}
      {notice ? <div role={notice.tone === "error" ? "alert" : "status"} className={`fixed bottom-5 end-5 z-[90] flex max-w-sm items-start gap-2 rounded-[var(--radius-md)] border bg-[var(--surface-elevated)] px-4 py-3 text-xs font-medium text-[var(--text-primary)] shadow-[var(--shadow-raised)] ${notice.tone === "error" ? "border-[var(--danger-line)]" : "border-[var(--success-line)]"}`}>{notice.tone === "error" ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--danger-ink)]" aria-hidden="true" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--success-ink)]" aria-hidden="true" />}{notice.message}</div> : null}
    </DashboardShell>
  );
}
