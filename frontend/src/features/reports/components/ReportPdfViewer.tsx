"use client";

import { Download, Printer, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { downloadBlob } from "@/lib/download-blob";
import { type TranslationFunction } from "@/lib/i18n";

import { useReportPdf } from "../hooks/use-report-pdf";
import { getReportErrorKey } from "../utils/report-errors";
import { ReportErrorState } from "./ReportStateViews";

type ReportPdfViewerProps = {
  canDownload: boolean;
  canPrint: boolean;
  fileName: string;
  id: string;
  onClose: () => void;
  reference: string | null;
  t: TranslationFunction;
};

// The document of a report as the API archived it (GET :id/pdf): the PDF of
// the report, of its AI analysis, or the file that was imported.
export function ReportPdfViewer({ canDownload, canPrint, fileName, id, onClose, reference, t }: ReportPdfViewerProps) {
  const pdf = useReportPdf(id);
  const frame = useRef<HTMLIFrameElement>(null);
  const url = useMemo(() => (pdf.data ? URL.createObjectURL(pdf.data) : null), [pdf.data]);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  const print = () => {
    frame.current?.contentWindow?.focus();
    frame.current?.contentWindow?.print();
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[var(--scrim)] p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={t("reports.pdf.title")}>
      <div className="mx-auto mb-3 flex w-full max-w-[900px] items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface-elevated)] p-3 text-[var(--text-primary)] shadow-[var(--shadow-raised)]">
        <h2 className="text-sm font-semibold">{t("reports.pdf.title")}{reference ? <> · <bdi dir="ltr">{reference}</bdi></> : null}</h2>
        <div className="flex gap-2">
          {canDownload ? <button type="button" className="clinical-button" onClick={() => pdf.data && downloadBlob(pdf.data, fileName)} disabled={!pdf.data}><Download size={15} aria-hidden="true" />{t("reports.actions.download")}</button> : null}
          {canPrint ? <button type="button" className="clinical-button clinical-button-primary" onClick={print} disabled={!pdf.data}><Printer size={15} aria-hidden="true" />{t("reports.actions.print")}</button> : null}
          <button type="button" className="clinical-icon-button" onClick={onClose} aria-label={t("reports.actions.close")}><X size={18} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="mx-auto min-h-0 w-full max-w-[900px] flex-1 overflow-hidden rounded-[var(--radius-md)] bg-white shadow-2xl">
        {pdf.isError ? <ReportErrorState errorKey={getReportErrorKey(pdf.error)} onRetry={() => void pdf.refetch()} t={t} /> : null}
        {pdf.isLoading ? <div className="h-full w-full animate-pulse bg-[var(--surface-muted)]" role="status" aria-busy="true" aria-label={t("reports.states.loading")} /> : null}
        {url ? <iframe ref={frame} src={url} title={t("reports.pdf.title")} className="h-full w-full border-0" /> : null}
      </div>
    </div>
  );
}
