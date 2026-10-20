"use client";

import { Download, ExternalLink, FolderOpen, Printer, Share2, X, XCircle, FilePenLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getAiAnalysisReport } from "@/features/ai-analyses/ai-analysis-runs.api";
import { useDownloadAiReport } from "@/features/ai-analyses/hooks/use-download-ai-report";
import { getReportErrorKey } from "@/features/ai-analyses/run-report";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { localizeReport } from "../reports.copy";
import { type ClinicalReport, type ReportCapabilities } from "../types/report.types";
import { ReportAiDetails } from "./ReportAiDetails";
import { ReportLinkedDocuments } from "./ReportLinkedDocuments";
import { ReportMetadataPanel } from "./ReportMetadataPanel";
import { ReportPreview } from "./ReportPreview";
import { ReportStatusBadge } from "./ReportStatusBadge";
import { ReportTimeline } from "./ReportTimeline";
import { ReportTypeBadge } from "./ReportTypeBadge";

type DetailTab = "preview" | "clinical" | "documents" | "history";

type ReportDetailDrawerProps = {
  capabilities: ReportCapabilities;
  locale: Locale;
  onAmend: (report: ClinicalReport) => void;
  onCancel: (report: ClinicalReport, reason: string) => void;
  onClose: () => void;
  onNotice: (message: string) => void;
  report: ClinicalReport;
  t: TranslationFunction;
};

export function ReportDetailDrawer({ capabilities, locale, onAmend, onCancel, onClose, onNotice, report, t }: ReportDetailDrawerProps) {
  const [tab, setTab] = useState<DetailTab>("preview");
  const [shareOpen, setShareOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const aiPatientId = report.aiContext?.patientId ?? "";
  const aiRunId = report.aiContext?.runId ?? "";
  const download = useDownloadAiReport(aiPatientId, aiRunId);
  const hasBackendPdf = report.aiContext?.isBackendBacked === true;
  const hasDocument = Boolean(report.presentedForm || report.aiContext);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const demoAction = () => onNotice(t("reports.notices.demoAction"));
  const reportError = (error: unknown) => onNotice(t(`aiAnalyses.report.errors.${getReportErrorKey(error)}`));

  const openPdf = async () => {
    if (!hasBackendPdf) return demoAction();
    try {
      const blob = await getAiAnalysisReport(aiPatientId, aiRunId);
      const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      reportError(error);
    }
  };

  const downloadPdf = () => {
    if (!hasBackendPdf) return demoAction();
    download.mutate(undefined, { onError: reportError });
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onNotice(t("reports.notices.copied"));
    } catch {
      onNotice(t("reports.notices.copyFailed"));
    }
  };

  const tabs: DetailTab[] = ["preview", "clinical", "documents", "history"];
  // No generic report mutation API exists yet. Mutating actions stay limited
  // to the clearly labelled in-memory demonstration records.
  const canCancel = capabilities.canCancelReports && report.isDemo && report.status !== "CANCELED";
  const canAmend = capabilities.canAmendReports && report.isDemo && report.status === "FINAL";

  return (
    <div className="fixed inset-0 z-[70] bg-[var(--scrim)]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="absolute inset-y-0 end-0 flex w-full max-w-[1240px] flex-col overflow-hidden border-s border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-[var(--shadow-raised)]" role="dialog" aria-modal="true" aria-labelledby="report-detail-title">
        <header className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0"><p className="clinical-figure text-[0.68rem] font-semibold text-[var(--medical)]" dir="ltr">{report.identifier ?? t("reports.common.pendingReference")}</p><h2 id="report-detail-title" className="mt-1 truncate text-lg font-semibold">{localizeReport(report.title, locale)}</h2><div className="mt-2 flex flex-wrap items-center gap-2"><ReportStatusBadge status={report.status} t={t} /><ReportTypeBadge report={report} t={t} /><span className="clinical-figure text-[0.68rem] font-semibold text-[var(--text-secondary)]" dir="ltr">v{report.version}</span></div></div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {capabilities.canDownloadReports && hasDocument ? <button type="button" className="clinical-button" disabled={download.isPending} onClick={downloadPdf}><Download size={15} aria-hidden="true" />{download.isPending ? t("reports.actions.downloading") : t("reports.actions.download")}</button> : null}
              {capabilities.canPrintReports ? <button type="button" className="clinical-button" onClick={() => window.print()}><Printer size={15} aria-hidden="true" />{t("reports.actions.print")}</button> : null}
              <button type="button" className="clinical-icon-button" onClick={onClose} aria-label={t("reports.actions.close")}><X size={19} aria-hidden="true" /></button>
            </div>
          </div>
          <nav aria-label={t("reports.detail.tabsLabel")} className="mt-4 flex gap-1 overflow-x-auto border-t border-[var(--line-soft)] pt-3">
            {tabs.map((value) => <button key={value} type="button" aria-current={tab === value ? "page" : undefined} className={cn("whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-2 text-xs font-semibold transition", tab === value ? "bg-[var(--accent-soft)] text-[var(--accent-dark)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]")} onClick={() => setTab(value)}>{t(`reports.detail.tabs.${value}`)}</button>)}
          </nav>
        </header>

        <div className="flex-1 overflow-y-auto p-4 pb-32 sm:p-6 sm:pb-32">
          <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-3 text-[0.7rem] leading-5 text-[var(--accent-dark)]"><ShieldDocumentIcon />{t("reports.confidentiality.detail")}</div>
          {tab === "preview" ? <div className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(290px,3fr)]"><div className="overflow-x-auto rounded-[var(--radius-md)] bg-[var(--surface-muted)] p-3 sm:p-5"><ReportPreview locale={locale} report={report} t={t} /></div><ReportMetadataPanel locale={locale} onCopy={copy} report={report} t={t} /></div> : null}
          {tab === "clinical" ? <div className="mx-auto max-w-4xl space-y-5">{report.aiContext ? <ReportAiDetails locale={locale} onCopy={copy} report={report} t={t} /> : report.sections.map((section) => <section key={section.id} className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="text-sm font-semibold">{localizeReport(section.title, locale)}</h3><p className="mt-2 whitespace-pre-line text-xs leading-6 text-[var(--text-secondary)]">{localizeReport(section.body, locale)}</p></section>)}</div> : null}
          {tab === "documents" ? <div className="mx-auto max-w-4xl"><ReportLinkedDocuments locale={locale} report={report} t={t} /></div> : null}
          {tab === "history" ? <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]"><section className="rounded-[var(--radius-md)] border border-[var(--border)] p-4"><h3 className="mb-4 text-sm font-semibold">{t("reports.timeline.title")}</h3><ReportTimeline locale={locale} report={report} t={t} /></section><ReportMetadataPanel locale={locale} onCopy={copy} report={report} t={t} /></div> : null}

          {shareOpen ? <InternalSharePanel onClose={() => setShareOpen(false)} onNotice={onNotice} t={t} /> : null}
          {cancelOpen ? <section className="mx-auto mt-5 max-w-4xl rounded-[var(--radius-md)] border border-[var(--danger-line)] bg-[var(--danger-soft)] p-4"><h3 className="text-sm font-semibold text-[var(--danger-ink)]">{t("reports.cancel.title")}</h3><p className="mt-1 text-[0.7rem] leading-5 text-[var(--text-secondary)]">{t("reports.cancel.help")}</p><label className="mt-3 block"><span className="mb-1.5 block text-[0.68rem] font-semibold">{t("reports.cancel.reason")}</span><Textarea className="bg-[var(--surface)]" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder={t("reports.cancel.placeholder")} /></label><div className="mt-3 flex justify-end gap-2"><button type="button" className="clinical-button" onClick={() => setCancelOpen(false)}>{t("reports.actions.back")}</button><button type="button" className="clinical-button border-[var(--danger-line)] text-[var(--danger-ink)]" disabled={!cancelReason.trim()} onClick={() => onCancel(report, cancelReason.trim())}><XCircle size={15} aria-hidden="true" />{t("reports.cancel.confirm")}</button></div></section> : null}
        </div>

        <footer className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface)] p-3 sm:px-6">
          <div className="flex flex-wrap gap-2">{canCancel ? <button type="button" className="clinical-button text-[var(--danger-ink)]" onClick={() => setCancelOpen((value) => !value)}><XCircle size={15} aria-hidden="true" />{t("reports.actions.cancelReport")}</button> : null}{canAmend ? <button type="button" className="clinical-button" onClick={() => onAmend(report)}><FilePenLine size={15} aria-hidden="true" />{t("reports.actions.createAmendment")}</button> : null}</div>
          <div className="flex flex-wrap gap-2">{capabilities.canShareReports ? <button type="button" className="clinical-button" onClick={() => setShareOpen((value) => !value)}><Share2 size={15} aria-hidden="true" />{t("reports.actions.shareInternal")}</button> : null}<Link href={`/establishment/patients/${encodeURIComponent(report.subject.id)}?tab=reports`} className="clinical-button"><FolderOpen size={15} aria-hidden="true" />{t("reports.actions.patientFile")}</Link>{hasDocument && capabilities.canDownloadReports ? <button type="button" className="clinical-button clinical-button-primary" onClick={openPdf}><ExternalLink size={15} aria-hidden="true" />{t("reports.actions.openPdf")}</button> : null}</div>
        </footer>
      </aside>
    </div>
  );
}

function ShieldDocumentIcon() {
  return <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--accent-line)] bg-[var(--surface)] text-[var(--medical)]" aria-hidden="true">!</span>;
}

function InternalSharePanel({ onClose, onNotice, t }: { onClose: () => void; onNotice: (message: string) => void; t: TranslationFunction }) {
  const [doctor, setDoctor] = useState("dr-sara");
  const [conversation, setConversation] = useState("cardiology-team");
  return (
    <section className="mx-auto mt-5 max-w-4xl rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] p-4"><h3 className="text-sm font-semibold">{t("reports.share.title")}</h3><p className="mt-1 text-[0.7rem] leading-5 text-[var(--text-secondary)]">{t("reports.share.help")}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-[0.68rem] font-semibold">{t("reports.share.doctor")}</span><Select className="bg-[var(--surface)]" value={doctor} onChange={(event) => setDoctor(event.target.value)}><option value="dr-sara">Dr. Sara Khelifati</option><option value="dr-amine">Dr. Amine Boucharb</option></Select></label><label><span className="mb-1.5 block text-[0.68rem] font-semibold">{t("reports.share.conversation")}</span><Select className="bg-[var(--surface)]" value={conversation} onChange={(event) => setConversation(event.target.value)}><option value="cardiology-team">{t("reports.share.cardioConversation")}</option><option value="care-team">{t("reports.share.careConversation")}</option></Select></label></div><label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" defaultChecked className="accent-[var(--medical)]" />{t("reports.share.attach")}</label><div className="mt-3 flex justify-end gap-2"><button type="button" className="clinical-button bg-[var(--surface)]" onClick={onClose}>{t("reports.actions.back")}</button><button type="button" className="clinical-button clinical-button-primary" onClick={() => { onNotice(t("reports.notices.shareDemo")); onClose(); }}><Share2 size={15} aria-hidden="true" />{t("reports.share.confirm")}</button></div></section>
  );
}

