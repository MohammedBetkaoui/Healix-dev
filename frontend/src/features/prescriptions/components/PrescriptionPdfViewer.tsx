import { Download, Printer, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { type TranslationFunction } from "@/lib/i18n";
import { downloadBlob } from "@/lib/download-blob";

import { useMarkPrescriptionPrinted } from "../hooks/use-prescription-mutations";
import { usePrescriptionPdf } from "../hooks/use-prescription-pdf";
import { getPrescriptionErrorKey } from "../utils/prescription-errors";
import { PrescriptionErrorState } from "./PrescriptionStateViews";

type PrescriptionPdfViewerProps = {
  id: string;
  number: string | null;
  onClose: () => void;
  onNotice: (message: string) => void;
  /** Reports a failed "printed" mark (the document itself was shown or saved). */
  onError: (errorKey: string) => void;
  t: TranslationFunction;
};

// The archived PDF of the prescription (GET :id/pdf), shown as the API
// produced it. Printing or saving it records the fact (POST :id/printed), which
// the list shows as "Imprimée / exportée".
export function PrescriptionPdfViewer({ id, number, onClose, onError, onNotice, t }: PrescriptionPdfViewerProps) {
  const pdf = usePrescriptionPdf(id);
  const markPrinted = useMarkPrescriptionPrinted();
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

  const record = () => markPrinted.mutate(id, {
    onError: (error) => onError(getPrescriptionErrorKey(error)),
    onSuccess: () => onNotice(t("prescriptions.notices.printed")),
  });
  const print = () => {
    frame.current?.contentWindow?.focus();
    frame.current?.contentWindow?.print();
    record();
  };
  const save = () => {
    if (!pdf.data) return;
    downloadBlob(pdf.data, `${number ?? "ordonnance"}.pdf`);
    record();
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-[var(--scrim)] p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={t("prescriptions.preview.title")}>
      <div className="mx-auto mb-3 flex w-full max-w-[900px] items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface-elevated)] p-3 text-[var(--text-primary)] shadow-[var(--shadow-raised)]">
        <h2 className="text-sm font-semibold">{t("prescriptions.preview.title")}{number ? <> · <bdi dir="ltr">{number}</bdi></> : null}</h2>
        <div className="flex gap-2">
          <button type="button" className="clinical-button" onClick={save} disabled={!pdf.data}><Download size={15} aria-hidden="true" />{t("prescriptions.actions.download")}</button>
          <button type="button" className="clinical-button clinical-button-primary" onClick={print} disabled={!pdf.data}><Printer size={15} aria-hidden="true" />{t("prescriptions.actions.print")}</button>
          <button type="button" className="clinical-icon-button" onClick={onClose} aria-label={t("prescriptions.actions.close")}><X size={18} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="mx-auto min-h-0 w-full max-w-[900px] flex-1 overflow-hidden rounded-[var(--radius-md)] bg-white shadow-2xl">
        {pdf.isError ? <PrescriptionErrorState errorKey={getPrescriptionErrorKey(pdf.error)} onRetry={() => void pdf.refetch()} t={t} /> : null}
        {pdf.isLoading ? <div className="h-full w-full animate-pulse bg-[var(--surface-muted)]" role="status" aria-busy="true" aria-label={t("prescriptions.states.loading")} /> : null}
        {url ? <iframe ref={frame} src={url} title={t("prescriptions.preview.title")} className="h-full w-full border-0" /> : null}
      </div>
    </div>
  );
}
