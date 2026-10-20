"use client";

import { AlertTriangle, CheckCircle2, Clock3, FileX2, ShieldCheck } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import { establishmentNavSections } from "@/components/dashboard/layout/navigation";
import { useAiRunsOverview } from "@/features/ai-analyses/hooks/use-ai-runs-overview";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { hasPatientPermission } from "@/lib/permissions";

import { mockClinicalReports, mockReportPatients } from "../mock-data/reports.mock";
import { type ClinicalReport, type ReportContentSection, type ReportStatus } from "../types/report.types";
import { mockEstablishmentReportGrants, resolveReportCapabilities } from "../utils/report-permissions";
import { mapAiRunToClinicalReport, matchesReportFilters, summarizeAiReportAvailability, type ReportFilterValue } from "../utils/report-utils";
import { type CreateReportInput } from "./CreateReportDrawer";
import { type ImportReportInput } from "./ImportReportDrawer";
import { ReportsFilters } from "./ReportsFilters";
import { ReportsHeader } from "./ReportsHeader";
import { ReportsStats } from "./ReportsStats";
import { ReportsTable } from "./ReportsTable";

const ReportDetailDrawer = dynamic(() => import("./ReportDetailDrawer").then((module) => module.ReportDetailDrawer), { ssr: false });
const ImportReportDrawer = dynamic(() => import("./ImportReportDrawer").then((module) => module.ImportReportDrawer), { ssr: false });
const CreateReportDrawer = dynamic(() => import("./CreateReportDrawer").then((module) => module.CreateReportDrawer), { ssr: false });

const initialFilters: ReportFilterValue = { author: "", category: "", from: "", patient: "", query: "", service: "", source: "", status: "", to: "" };

function localized(value: string) { return { ar: value, fr: value }; }

export function ReportsPage() {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill({ enabled: true });
  const initials = getAccountInitials(currentUser.data?.fullName);
  const hasLegacyViewGrant = hasPatientPermission("ESTABLISHMENT", "VIEW_REPORTS");
  const capabilities = resolveReportCapabilities(hasLegacyViewGrant ? mockEstablishmentReportGrants : []);
  const aiRuns = useAiRunsOverview({ limit: 100, page: 1 });
  const [localReports, setLocalReports] = useState<ClinicalReport[]>(mockClinicalReports);
  const [filters, setFilters] = useState<ReportFilterValue>(initialFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState("");

  const liveAiReports = useMemo(() => (aiRuns.data?.items ?? []).map(mapAiRunToClinicalReport).filter((report): report is ClinicalReport => report !== null), [aiRuns.data?.items]);
  const reports = useMemo(() => [...liveAiReports, ...localReports], [liveAiReports, localReports]);
  const filtered = useMemo(() => reports.filter((report) => matchesReportFilters(report, filters, locale)), [filters, locale, reports]);
  const selected = selectedId ? reports.find((report) => report.id === selectedId) : undefined;
  const availability = useMemo(() => summarizeAiReportAvailability(aiRuns.data?.items ?? []), [aiRuns.data?.items]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4200);
  };

  const nextReference = (prefix: string) => `${prefix}-2026-${String(localReports.length + 1042).padStart(6, "0")}`;
  const baseOrganization = mockClinicalReports[0].organization;
  const currentPractitioner = { displayName: localized(currentUser.data?.fullName || t("dashboard.clinical.administration")), id: "current-user" };

  const importReport = (input: ImportReportInput) => {
    const patient = mockReportPatients.find((candidate) => candidate.id === input.patientId) ?? mockReportPatients[0];
    const now = "2026-10-20T14:20:00+01:00";
    const report: ClinicalReport = {
      author: { displayName: localized(input.author), id: `external-${Date.now()}`, specialty: input.specialty ? localized(input.specialty) : undefined },
      category: input.type,
      createdAt: now,
      effectiveDate: `${input.date}T12:00:00+01:00`,
      id: `import-${Date.now()}`,
      identifier: nextReference("DOC-EXT"),
      isDemo: true,
      isImported: true,
      linkedDocuments: [],
      organization: baseOrganization,
      presentedForm: { fileName: input.fileName, id: `file-${Date.now()}`, kind: "PRESENTED_FORM", label: { ar: "مستند خارجي", fr: "Document externe" }, mimeType: "application/pdf" },
      sections: input.notes ? [{ body: localized(input.notes), id: "notes", title: { ar: "ملاحظات", fr: "Notes" } }] : [],
      service: input.specialty ? localized(input.specialty) : { ar: "وثيقة خارجية", fr: "Document externe" },
      sourceLabel: { ar: "مستورد [تجريبي]", fr: "Importé [démo]" },
      sourceType: "EXTERNAL_DOCUMENT",
      status: "FINAL",
      subject: patient,
      timeline: [{ action: "CREATED", actor: currentUser.data?.fullName ?? "HealixDz", at: now, detail: { ar: "تم استيراد التقرير الخارجي", fr: "Rapport externe importé" }, id: `event-${Date.now()}` }],
      title: localized(input.title),
      version: 1,
      versions: [{ issuedAt: now, status: "FINAL", version: 1 }],
    };
    setLocalReports((current) => [report, ...current]);
    setImportOpen(false);
    showNotice(t("reports.notices.importedDemo"));
  };

  const createReport = (input: CreateReportInput) => {
    const patient = mockReportPatients.find((candidate) => candidate.id === input.patientId) ?? mockReportPatients[0];
    const now = "2026-10-20T14:26:00+01:00";
    const sectionLabels: Record<keyof Omit<CreateReportInput, "patientId" | "status" | "title">, { ar: string; fr: string }> = {
      conclusion: { ar: "الخلاصة", fr: "Conclusion" }, context: { ar: "السياق", fr: "Contexte" }, findings: { ar: "المعاينات", fr: "Constatations" }, interpretation: { ar: "التفسير", fr: "Interprétation" }, reason: { ar: "السبب", fr: "Motif" }, recommendations: { ar: "التوصيات", fr: "Recommandations" }, results: { ar: "النتائج", fr: "Résultats" },
    };
    const sections = (Object.keys(sectionLabels) as Array<keyof typeof sectionLabels>).flatMap<ReportContentSection>((key) => input[key].trim() ? [{ body: localized(input[key].trim()), id: key, title: sectionLabels[key] }] : []);
    const report: ClinicalReport = {
      author: currentPractitioner,
      category: "CONSULTATION_NOTE",
      conclusion: input.conclusion ? localized(input.conclusion) : undefined,
      createdAt: now,
      effectiveDate: now,
      finalizedAt: input.status === "FINAL" ? now : undefined,
      id: `manual-${Date.now()}`,
      identifier: nextReference("CR-CLIN"),
      isDemo: true,
      isImported: false,
      issuedAt: input.status === "FINAL" ? now : undefined,
      linkedDocuments: [],
      organization: baseOrganization,
      sections,
      service: { ar: "تقرير سريري سردي", fr: "Rapport clinique narratif" },
      sourceLabel: { ar: "إنشاء يدوي [تجريبي]", fr: "Création manuelle [démo]" },
      sourceType: "CONSULTATION",
      status: input.status,
      subject: patient,
      timeline: [{ action: input.status === "FINAL" ? "VALIDATED" : "CREATED", actor: currentUser.data?.fullName ?? "HealixDz", at: now, detail: input.status === "FINAL" ? { ar: "تم إنهاء التقرير", fr: "Rapport finalisé" } : { ar: "تم حفظ المسودة", fr: "Brouillon enregistré" }, id: `event-${Date.now()}` }],
      title: localized(input.title),
      validator: input.status === "FINAL" ? currentPractitioner : undefined,
      version: 1,
      versions: [{ issuedAt: now, status: input.status, version: 1 }],
    };
    setLocalReports((current) => [report, ...current]);
    setCreateOpen(false);
    showNotice(t(input.status === "FINAL" ? "reports.notices.finalizedDemo" : "reports.notices.draftSaved"));
  };

  const cancelReport = (report: ClinicalReport, reason: string) => {
    const at = "2026-10-20T14:32:00+01:00";
    setLocalReports((current) => current.map((candidate) => candidate.id === report.id ? { ...candidate, canceledAt: at, canceledBy: currentUser.data?.fullName ?? "HealixDz", cancellationReason: reason, status: "CANCELED", timeline: [...candidate.timeline, { action: "CANCELED", actor: currentUser.data?.fullName ?? "HealixDz", at, detail: localized(reason), id: `cancel-${Date.now()}` }] } : candidate));
    setSelectedId(null);
    showNotice(t("reports.notices.canceled"));
  };

  const amendReport = (report: ClinicalReport) => {
    const at = "2026-10-20T14:36:00+01:00";
    const nextVersion = report.version + 1;
    const status: ReportStatus = "AMENDED";
    setLocalReports((current) => current.map((candidate) => candidate.id === report.id ? { ...candidate, finalizedAt: at, issuedAt: at, replacesVersion: candidate.version, status, version: nextVersion, versions: [...candidate.versions, { issuedAt: at, note: { ar: "نسخة تعديل تجريبية أُنشئت للمراجعة", fr: "Version amendée de démonstration créée pour revue" }, replacesVersion: candidate.version, status, version: nextVersion }], timeline: [...candidate.timeline, { action: "CORRECTED", actor: currentUser.data?.fullName ?? "HealixDz", at, detail: { ar: `تم إنشاء التعديل — الإصدار ${nextVersion}`, fr: `Amendement créé — v${nextVersion}` }, id: `amend-${Date.now()}` }, { action: "REPLACED", actor: "HealixDz", at, detail: { ar: `الإصدار ${nextVersion} يعوض الإصدار ${candidate.version}`, fr: `Version v${candidate.version} remplacée par v${nextVersion}` }, id: `replace-${Date.now()}` }] } : candidate));
    showNotice(t("reports.notices.amended"));
  };

  return (
    <DashboardShell accountType="ESTABLISHMENT" activeKey="reports" breadcrumbLabel={t("reports.page.breadcrumb")} navSections={establishmentNavSections} titleKey="reports.page.title" user={{ accountType: "ESTABLISHMENT", footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace") }}>
      <div className="workspace-stack">
        <ReportsHeader capabilities={capabilities} onCreate={() => setCreateOpen(true)} onImport={() => setImportOpen(true)} t={t} />
        <section className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" /><div><p className="text-xs font-semibold text-[var(--accent-dark)]">{t("reports.confidentiality.title")}</p><p className="mt-1 text-[0.7rem] leading-5 text-[var(--text-secondary)]">{t("reports.confidentiality.description")}</p></div></section>
        <ReportsStats reports={reports} t={t} />
        <AiAvailabilityPanel availability={availability} error={aiRuns.isError} loading={aiRuns.isLoading} t={t} />
        <ReportsFilters filters={filters} locale={locale} onChange={setFilters} onReset={() => setFilters(initialFilters)} reports={reports} resultCount={filtered.length} t={t} />
        <ReportsTable locale={locale} onOpen={(report) => setSelectedId(report.id)} reports={filtered} t={t} />
      </div>
      {selected ? <ReportDetailDrawer capabilities={capabilities} locale={locale} onAmend={amendReport} onCancel={cancelReport} onClose={() => setSelectedId(null)} onNotice={showNotice} report={selected} t={t} /> : null}
      {importOpen ? <ImportReportDrawer locale={locale} onClose={() => setImportOpen(false)} onImport={importReport} patients={mockReportPatients} t={t} /> : null}
      {createOpen ? <CreateReportDrawer capabilities={capabilities} locale={locale} onClose={() => setCreateOpen(false)} onCreate={createReport} patients={mockReportPatients} t={t} /> : null}
      {notice ? <div role="status" className="fixed bottom-5 end-5 z-[90] flex max-w-sm items-start gap-2 rounded-[var(--radius-md)] border border-[var(--success-line)] bg-[var(--surface-elevated)] px-4 py-3 text-xs font-medium text-[var(--text-primary)] shadow-[var(--shadow-raised)]"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[var(--success-ink)]" aria-hidden="true" />{notice}</div> : null}
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

