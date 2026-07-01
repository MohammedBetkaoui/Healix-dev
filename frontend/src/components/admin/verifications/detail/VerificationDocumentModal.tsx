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
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; blobUrl: string; mimeType: string };

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
      setViewer({ status: "idle" });
      return;
    }

    setViewer({ status: "loading" });

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
        setViewer({ status: "ready", blobUrl, mimeType: mime });
      })
      .catch(() => {
        if (!cancelled) setViewer({ status: "error" });
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
    anchor.download = document.originalName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!document) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("admin.actions.close")}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative flex w-full max-w-4xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4 shrink-0">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 shrink-0">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-slate-950">
              {document.title}
            </h2>
            <p className="truncate text-xs text-slate-400 italic">
              {document.originalName} · {document.size}
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
        <div className="flex min-h-120 flex-1 items-center justify-center overflow-auto bg-slate-50">
          {viewer.status === "loading" && (
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
              <span className="text-sm">{t("admin.detail.modal.loading")}</span>
            </div>
          )}

          {viewer.status === "error" && (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-red-50 px-8 py-10 text-center">
              <p className="font-semibold text-red-700">
                {t("admin.detail.modal.error")}
              </p>
            </div>
          )}

          {viewer.status === "ready" &&
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
              <div className="flex flex-col items-center gap-3 rounded-2xl bg-slate-100 px-10 py-12 text-center">
                <FileText className="h-12 w-12 text-slate-400" />
                <p className="font-semibold text-slate-700">
                  {t("admin.detail.modal.unsupportedFormat")}
                </p>
                <p className="text-sm text-slate-500">
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
