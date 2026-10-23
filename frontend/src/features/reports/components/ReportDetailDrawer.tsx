"use client";

import { CheckCircle2, Download, ExternalLink, FilePenLine, FolderOpen, Pencil, Printer, Trash2, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Textarea } from "@/components/ui/textarea";
import { type Locale } from "@/i18n";
import { downloadBlob } from "@/lib/download-blob";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { getReportPdf } from "../api/reports.api";
import { useReport, useReportHistory } from "../hooks/use-report";
import { useAmendReport, useCancelReport, useDeleteReportDraft, useFinalizeReport } from "../hooks/use-report-mutations";
import { type ClinicalReport, type ReportCapabilities } from "../types/report.types";
import { getReportErrorKey } from "../utils/report-errors";
import { getReportActions } from "../utils/report-utils";
import { ReportAiDetails } from "./ReportAiDetails";
import { ReportLinkedDocuments } from "./ReportLinkedDocuments";
import { ReportMetadataPanel } from "./ReportMetadataPanel";
import { ReportPdfViewer } from "./ReportPdfViewer";
import { ReportPreview } from "./ReportPreview";
import { ReportActionError, ReportErrorState, ReportsBlockSkeleton } from "./ReportStateViews";
import { ReportStatusBadge } from "./ReportStatusBadge";
import { ReportTimeline } from "./ReportTimeline";
import { ReportTypeBadge } from "./ReportTypeBadge";
import { ReportVersionHistory } from "./ReportVersionHistory";

type DetailTab = "preview" | "clinical" | "documents" | "history";

type ReportDetailDrawerProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  capabilities: ReportCapabilities;
  id: string;
  locale: Locale;
  onClose: () => void;
  /** Continue a draft (or the amendment just started) in the editor. */
  onEdit: (report: ClinicalReport) => void;
  onNotice: (message: string) => void;
  /** Show another version of the same report. */
  onOpenReport: (id: string) => void;
  t: TranslationFunction;
};

export function ReportDetailDrawer({ accountType, capabilities, id, locale, onClose, onEdit, onNotice, onOpenReport, t }: ReportDetailDrawerProps) {
  const query = useReport(id);
  const history = useReportHistory(id);
  const finalize = useFinalizeReport();
  const amend = useAmendReport();
  const cancel = useCancelReport();
  const remove = useDeleteReportDraft();
  const [tab, setTab] = useState<DetailTab>("preview");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const report = query.data;

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !pdfOpen) onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, pdfOpen]);

  const fail = (error: unknown) => setActionError(getReportErrorKey(error));
  const busy = finalize.isPending || amend.isPending || cancel.isPending || remove.isPending;
  const actions = report ? getReportActions(report, capabilities) : null;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onNotice(t("reports.notices.copied"));
    } catch {
      onNotice(t("reports.notices.copyFailed"));
    }
  };

  const download = async () => {
    if (!report?.presentedForm) return;
    setDownloading(true);
    setActionError(null);
    try {
      downloadBlob(await getReportPdf(report.id), report.presentedForm.fileName);
    } catch (error) {
      fail(error);
    } finally {
      setDownloading(false);
    }
  };

  const run = <Result,>(mutation: { mutate: (variables: never, options: { onError: (error: unknown) => void; onSuccess: (result: Result) => void }) => void }, variables: unknown, onSuccess: (result: Result) => void) => {
    setActionError(null);
    mutation.mutate(variables as never, { onError: fail, onSuccess });
  };

  const tabs: DetailTab[] = ["preview", "clinical", "documents", "history"];
  const patientHref = report ? `${accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor"}/patients/${encodeURIComponent(report.patient.id)}?tab=reports` : "#";

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-[var(--scrim)]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <aside className="absolute inset-y-0 end-0 flex w-full max-w-[1240px] flex-col overflow-hidden border-s border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-raised)]" role="dialog" aria-modal="true" aria-labelledby="report-detail-title">
          <header className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="clinical-figure text-[0.68rem] font-semibold text-[var(--medical)]" dir="ltr">{report ? (report.number ?? t("reports.common.pendingReference")) : "…"}</p>
                <h2 id="report-detail-title" className="mt-1 truncate text-lg font-semibold">{report ? (report.sourceType === "AI_ANALYSIS" ? t(`reports.categories.${report.category}`) : report.title) : t("reports.detail.title")}</h2>
                {report ? <div className="mt-2 flex flex-wrap items-center gap-2"><ReportStatusBadge status={report.status} t={t} /><ReportTypeBadge category={report.category} t={t} /><span className="clinical-figure text-[0.68rem] font-semibold text-[var(--text-secondary)]" dir="ltr">v{report.version}</span>{!report.isCurrent ? <span className="rounded-full border border-[var(--warning-line)] bg-[var(--warning-soft)] px-2 py-0.5 text-[0.64rem] font-semibold text-[var(--warning-ink)]">{t("reports.versions.superseded")}</span> : null}</div> : null}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {actions?.canDownload ? <button type="button" className="clinical-button" disabled={downloading} onClick={() => void download()}><Download size={15} aria-hidden="true" />{downloading ? t("reports.actions.downloading") : t("reports.actions.download")}</button> : null}
                {actions?.canPrint ? <button type="button" className="clinical-button" onClick={() => setPdfOpen(true)}><Printer size={15} aria-hidden="true" />{t("reports.actions.print")}</button> : null}
                <button type="button" className="clinical-icon-button" onClick={onClose} aria-label={t("reports.actions.close")}><X size={19} aria-hidden="true" /></button>
              </div>
            </div>
            <nav aria-label={t("reports.detail.tabsLabel")} className="mt-4 flex gap-1 overflow-x-auto border-t border-[var(--line-soft)] pt-3">
              {tabs.map((value) => <button key={value} type="button" aria-current={tab === value ? "page" : undefined} className={cn("whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-2 text-xs font-semibold transition", tab === value ? "bg-[var(--accent-soft)] text-[var(--accent-dark)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]")} onClick={() => setTab(value)}>{t(`reports.detail.tabs.${value}`)}</button>)}
            </nav>
          </header>

          <div className="flex-1 overflow-y-auto p-4 pb-32 sm:p-6 sm:pb-32">
            {query.isLoading ? <ReportsBlockSkeleton t={t} /> : null}
            {query.isError ? <ReportErrorState errorKey={getReportErrorKey(query.error)} onRetry={() => void query.refetch()} t={t} /> : null}
            {report ? (
              <>
                <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-3 text-[0.7rem] leading-5 text-[var(--accent-dark)]"><span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--accent-line)] bg-[var(--surface)] text-[var(--medical)]" aria-hidden="true">!</span>{t("reports.confidentiality.detail")}</div>
                {report.status === "CANCELED" ? <section className="mb-5 rounded-[var(--radius-md)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4 text-[var(--danger-ink)]"><h3 className="text-sm font-semibold">{t("reports.cancel.canceledTitle")}</h3>{report.cancellationReason ? <p className="mt-2 text-xs leading-5">{report.cancellationReason}</p> : null}<p className="mt-2 text-[0.66rem]">{t("reports.cancel.canceledBy", { actor: report.canceledByName ?? t("reports.common.notProvided"), date: report.canceledAt ? new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.canceledAt)) : "" })}</p></section> : null}
                {report.replacedBy ? <p className="mb-5 rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-3 py-2 text-[0.72rem] text-[var(--warning-ink)]">{t("reports.versions.replacedBy", { version: report.replacedBy.version })} <button type="button" className="clinical-link font-semibold" onClick={() => onOpenReport(report.replacedBy!.id)}>{t("reports.versions.open")}</button></p> : null}
                {tab === "preview" ? <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(290px,3fr)]"><div className="overflow-x-auto rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 sm:p-5"><ReportPreview locale={locale} report={report} t={t} /></div><ReportMetadataPanel locale={locale} onCopy={copy} report={report} t={t} /></div> : null}
                {tab === "clinical" ? <div className="mx-auto max-w-4xl space-y-5">{report.ai ? <ReportAiDetails accountType={accountType} locale={locale} onCopy={copy} report={report} t={t} /> : null}{report.sections.map((section) => <section key={section.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="text-sm font-semibold">{t(`reports.create.fields.${section.id}`)}</h3><p className="mt-2 whitespace-pre-line text-xs leading-6 text-[var(--text-secondary)]">{section.body}</p></section>)}{report.conclusion ? <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="text-sm font-semibold">{t("reports.create.fields.conclusion")}</h3><p className="mt-2 whitespace-pre-line text-xs leading-6 text-[var(--text-secondary)]">{report.conclusion}</p></section> : null}{report.external?.notes ? <section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="text-sm font-semibold">{t("reports.import.notes")}</h3><p className="mt-2 whitespace-pre-line text-xs leading-6 text-[var(--text-secondary)]">{report.external.notes}</p></section> : null}{!report.ai && !report.sections.length && !report.conclusion && !report.external?.notes ? <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--text-secondary)]">{t("reports.detail.noContent")}</p> : null}</div> : null}
                {tab === "documents" ? <div className="mx-auto max-w-4xl"><ReportLinkedDocuments report={report} t={t} /></div> : null}
                {tab === "history" ? <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]"><section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="mb-4 text-sm font-semibold">{t("reports.timeline.title")}</h3><ReportTimeline events={history.data} isError={history.isError} isLoading={history.isLoading} locale={locale} onRetry={() => void history.refetch()} t={t} /></section><ReportVersionHistory currentId={report.id} locale={locale} onOpen={onOpenReport} t={t} versions={report.versions} /></div> : null}

                {cancelOpen && actions?.canCancel ? <section className="mx-auto mt-5 max-w-4xl rounded-[var(--radius-md)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4"><h3 className="text-sm font-semibold text-[var(--danger-ink)]">{t("reports.cancel.title")}</h3><p className="mt-1 text-[0.7rem] leading-5 text-[var(--text-secondary)]">{t("reports.cancel.help")}</p><label className="mt-3 block"><span className="mb-1.5 block text-[0.68rem] font-semibold">{t("reports.cancel.reason")}</span><Textarea className="bg-[var(--surface)]" maxLength={1000} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder={t("reports.cancel.placeholder")} /></label><p className="mt-1 text-[0.64rem] text-[var(--text-secondary)]">{t("reports.cancel.minimum")}</p><div className="mt-3 flex justify-end gap-2"><button type="button" className="clinical-button" onClick={() => setCancelOpen(false)}>{t("reports.actions.back")}</button><button type="button" className="clinical-button border-[var(--danger-line)] text-[var(--danger-ink)]" disabled={cancelReason.trim().length < 5 || busy} onClick={() => run(cancel, { id: report.id, reason: cancelReason.trim() }, () => { setCancelOpen(false); setCancelReason(""); onNotice(t("reports.notices.canceled")); })}><XCircle size={15} aria-hidden="true" />{t("reports.cancel.confirm")}</button></div></section> : null}
                {actionError ? <div className="mx-auto mt-5 max-w-4xl"><ReportActionError errorKey={actionError} t={t} /></div> : null}
              </>
            ) : null}
          </div>

          {report && actions ? (
            <footer className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface)] p-3 sm:px-6">
              <div className="flex flex-wrap gap-2">
                {actions.canDeleteDraft ? <button type="button" className="clinical-button text-[var(--danger-ink)]" disabled={busy} onClick={() => confirmDelete ? run(remove, report.id, () => { onNotice(t("reports.notices.draftDeleted")); onClose(); }) : setConfirmDelete(true)}><Trash2 size={15} aria-hidden="true" />{confirmDelete ? t("reports.actions.confirmDeleteDraft") : t("reports.actions.deleteDraft")}</button> : null}
                {actions.canCancel ? <button type="button" className="clinical-button text-[var(--danger-ink)]" disabled={busy} onClick={() => setCancelOpen((value) => !value)}><XCircle size={15} aria-hidden="true" />{t("reports.actions.cancelReport")}</button> : null}
                {actions.canAmend ? <button type="button" className="clinical-button" disabled={busy} onClick={() => run(amend, report.id, (draft: ClinicalReport) => { onNotice(t("reports.notices.amended")); onEdit(draft); })}><FilePenLine size={15} aria-hidden="true" />{t("reports.actions.createAmendment")}</button> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={patientHref} className="clinical-button"><FolderOpen size={15} aria-hidden="true" />{t("reports.actions.patientFile")}</Link>
                {actions.canEditDraft ? <button type="button" className="clinical-button" disabled={busy} onClick={() => onEdit(report)}><Pencil size={15} aria-hidden="true" />{t("reports.actions.edit")}</button> : null}
                {actions.canFinalize ? <button type="button" className="clinical-button clinical-button-primary" disabled={busy || (!report.sections.length && !report.conclusion)} onClick={() => run(finalize, report.id, (done: ClinicalReport) => onNotice(t("reports.notices.finalized", { number: done.number ?? "" })))}><CheckCircle2 size={15} aria-hidden="true" />{finalize.isPending ? t("reports.actions.finalizing") : t("reports.create.finalize")}</button> : null}
                {report.documentAvailable && capabilities.canDownloadReports ? <button type="button" className="clinical-button clinical-button-primary" onClick={() => setPdfOpen(true)}><ExternalLink size={15} aria-hidden="true" />{t("reports.actions.openPdf")}</button> : null}
              </div>
            </footer>
          ) : null}
        </aside>
      </div>
      {pdfOpen && report?.presentedForm ? <ReportPdfViewer canDownload={capabilities.canDownloadReports} canPrint={capabilities.canPrintReports} fileName={report.presentedForm.fileName} id={report.id} onClose={() => setPdfOpen(false)} reference={report.number} t={t} /> : null}
    </>
  );
}
