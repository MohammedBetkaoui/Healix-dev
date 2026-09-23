"use client";

import { Download, FileText, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/http-client";
import { type TranslationFunction } from "@/lib/i18n";
import { type VerificationDocument } from "@/types/admin";

type VerificationDocumentModalProps = {
  document: VerificationDocument | null;
  onClose: () => void;
  t: TranslationFunction;
  verificationId: string;
};

type ViewerState =
  | { status: "idle" }
  | { documentId: string; status: "error" }
  | { documentId: string; status: "ready"; blobUrl: string; mimeType: string };

function isImageMime(mime: string) {
  return mime.startsWith("image/");
}

function isPdfMime(mime: string) {
  return mime === "application/pdf";
}

export function VerificationDocumentModal({
  document,
  onClose,
  t,
  verificationId,
}: VerificationDocumentModalProps) {
  const [viewer, setViewer] = useState<ViewerState>({ status: "idle" });
  const prevBlobUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!document) {
      return;
    }

    let cancelled = false;

    apiClient
      .get<Blob>(
        `/admin/verifications/${verificationId}/documents/${document.id}/view`,
        { responseType: "blob" },
      )
      .then((response) => {
        if (cancelled) return;
        const mime =
          (response.headers["content-type"] as string | undefined) ??
          "application/octet-stream";
        const blobUrl = URL.createObjectURL(response.data);
        prevBlobUrl.current = blobUrl;
        setViewer({
          status: "ready",
          blobUrl,
          documentId: document.id,
          mimeType: mime,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setViewer({ status: "error", documentId: document.id });
        }
      });

    return () => {
      cancelled = true;
      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current);
        prevBlobUrl.current = null;
      }
    };
  }, [document, verificationId]);

  const handleDownload = async () => {
    if (!document) return;
    const response = await apiClient.get<Blob>(
      `/admin/verifications/${verificationId}/documents/${document.id}/download`,
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(response.data);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = document.originalName ?? document.title;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!document) return null;

  const isCurrentViewer =
    viewer.status !== "idle" && viewer.documentId === document.id;
  const isLoading = !isCurrentViewer;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("admin.actions.close")}
        className="absolute inset-0 bg-[#0f172a]/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative flex w-full max-w-4xl flex-col rounded-3xl border border-border bg-card shadow-2xl overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-4 shrink-0">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-[var(--accent-dark)] shrink-0">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-foreground">
              {document.title}
            </h2>
            <p className="truncate text-xs text-muted-foreground italic">
              {document.originalName ? `${document.originalName} · ` : ""}
              {document.size}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleDownload()}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("admin.actions.download")}
            </Button>
            <Button
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

        {/* Viewer body */}
        <div className="flex min-h-120 flex-1 items-center justify-center overflow-auto bg-muted">
          {isLoading && (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-dark)]" />
              <span className="text-sm">{t("admin.detail.modal.loading")}</span>
            </div>
          )}

          {isCurrentViewer && viewer.status === "error" && (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--danger-soft)] px-8 py-10 text-center">
              <p className="font-semibold text-[var(--danger-ink)]">
                {t("admin.detail.modal.error")}
              </p>
            </div>
          )}

          {isCurrentViewer &&
            viewer.status === "ready" &&
            (isImageMime(viewer.mimeType) ? (
              <img
                src={viewer.blobUrl}
                alt={document.title}
                className="max-h-[70vh] max-w-full rounded-lg object-contain p-4 shadow"
              />
            ) : isPdfMime(viewer.mimeType) ? (
              <iframe
                src={viewer.blobUrl}
                title={document.title}
                className="h-[70vh] w-full border-0"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-muted px-10 py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground" />
                <p className="font-semibold text-foreground">
                  {t("admin.detail.modal.unsupportedFormat")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("admin.detail.modal.unsupportedFormatHint")}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => void handleDownload()}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {t("admin.actions.download")}
                </Button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
