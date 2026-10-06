"use client";

import { Download, FileText, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/http-client";
import { downloadBlob } from "@/lib/download-blob";
import { formatFileSize } from "@/lib/format/format-file-size";
import { type TranslationFunction } from "@/lib/i18n";
import { type AdminPaymentProof } from "@/types/admin";

type PaymentProofModalProps = {
  onClose: () => void;
  paymentId: string;
  proof: AdminPaymentProof | null;
  t: TranslationFunction;
};

type ViewerState =
  | { status: "idle" }
  | { proofId: string; status: "error" }
  | { blobUrl: string; proofId: string; status: "ready" };

function isImageMime(mime: string) {
  return mime.startsWith("image/");
}

function isPdfMime(mime: string) {
  return mime === "application/pdf";
}

function canPreviewInline(mime: string) {
  return isImageMime(mime) || isPdfMime(mime);
}

// Same viewer as VerificationDocumentModal, except the MIME type comes from
// the proof metadata (AdminPaymentProof.mimeType) instead of the response,
// so a format that cannot be shown inline is not fetched at all.
export function PaymentProofModal({
  onClose,
  paymentId,
  proof,
  t,
}: PaymentProofModalProps) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [viewer, setViewer] = useState<ViewerState>({ status: "idle" });
  const [downloadErrorProofId, setDownloadErrorProofId] = useState<string | null>(null);

  useEffect(() => {
    if (!proof || !canPreviewInline(proof.mimeType)) {
      return;
    }

    let cancelled = false;
    let blobUrl: string | null = null;

    apiClient
      .get<Blob>(`/admin/payments/${paymentId}/proof/view`, { responseType: "blob" })
      .then((response) => {
        if (cancelled) return;
        // Typed from the metadata so the <img>/<iframe> render matches the
        // branch chosen below.
        blobUrl = URL.createObjectURL(new Blob([response.data], { type: proof.mimeType }));
        setViewer({ blobUrl, proofId: proof.id, status: "ready" });
      })
      .catch(() => {
        if (!cancelled) {
          setViewer({ proofId: proof.id, status: "error" });
        }
      });

    return () => {
      cancelled = true;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [paymentId, proof]);

  // Rendered above the payment dialog: take focus so Escape closes this
  // viewer only, then hand focus back to the button that opened it.
  useEffect(() => {
    if (!proof) {
      return;
    }

    const opener = window.document.activeElement;
    closeButtonRef.current?.focus();

    return () => {
      if (opener instanceof HTMLElement) {
        opener.focus();
      }
    };
  }, [proof]);

  const handleDownload = async () => {
    if (!proof) return;
    setDownloadErrorProofId(null);

    try {
      const response = await apiClient.get<Blob>(
        `/admin/payments/${paymentId}/proof/download`,
        { responseType: "blob" },
      );
      downloadBlob(response.data, proof.originalName);
    } catch {
      setDownloadErrorProofId(proof.id);
    }
  };

  if (!proof) return null;

  const canPreview = canPreviewInline(proof.mimeType);
  const isCurrentViewer = viewer.status !== "idle" && viewer.proofId === proof.id;
  const isLoading = canPreview && !isCurrentViewer;

  const downloadButton = (className?: string) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={() => void handleDownload()}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {t("admin.actions.download")}
    </Button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <button
        type="button"
        aria-label={t("admin.actions.close")}
        className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
        role="dialog"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-[var(--accent-dark)]">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-semibold text-foreground">
              {t("admin.payments.detail.fields.proof")}
            </h2>
            <p className="truncate text-xs italic text-muted-foreground">
              {proof.originalName} · <bdi dir="ltr">{formatFileSize(proof.size)}</bdi>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {downloadButton()}
            <Button
              ref={closeButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("admin.actions.close")}
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {downloadErrorProofId === proof.id ? (
          <p role="alert" className="shrink-0 border-b border-[var(--danger-line)] bg-[var(--danger-soft)] px-6 py-2 text-sm font-medium text-[var(--danger-ink)]">
            {t("admin.detail.modal.error")}
          </p>
        ) : null}

        {/* Viewer body */}
        <div className="flex min-h-120 flex-1 items-center justify-center overflow-auto bg-muted">
          {isLoading && (
            <div role="status" className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-dark)]" aria-hidden="true" />
              <span className="text-sm">{t("admin.detail.modal.loading")}</span>
            </div>
          )}

          {isCurrentViewer && viewer.status === "error" && (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--danger-soft)] px-8 py-10 text-center">
              <p className="font-semibold text-[var(--danger-ink)]">
                {t("admin.detail.modal.error")}
              </p>
            </div>
          )}

          {isCurrentViewer &&
            viewer.status === "ready" &&
            (isImageMime(proof.mimeType) ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob: URL, next/image cannot optimize it
              <img
                src={viewer.blobUrl}
                alt={proof.originalName}
                className="max-h-[70vh] max-w-full rounded-lg object-contain p-4 shadow"
              />
            ) : (
              <iframe
                src={viewer.blobUrl}
                title={proof.originalName}
                className="h-[70vh] w-full border-0"
              />
            ))}

          {!canPreview && (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted px-10 py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
              <p className="font-semibold text-foreground">
                {t("admin.detail.modal.unsupportedFormat")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("admin.detail.modal.unsupportedFormatHint")}
              </p>
              {downloadButton("mt-2")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
