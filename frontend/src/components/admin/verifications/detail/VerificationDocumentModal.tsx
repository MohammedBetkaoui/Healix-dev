"use client";

import { FileText, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type TranslationFunction } from "@/lib/i18n";
import { type VerificationDocument } from "@/types/admin";

type VerificationDocumentModalProps = {
  document: VerificationDocument | null;
  onClose: () => void;
  t: TranslationFunction;
};

export function VerificationDocumentModal({
  document,
  onClose,
  t,
}: VerificationDocumentModalProps) {
  if (!document) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("admin.actions.close")}
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4"
          aria-label={t("admin.actions.close")}
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
            <FileText className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {t("admin.detail.modal.title")}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {t("admin.detail.modal.text")}
            </p>
            <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm font-medium text-slate-800">
              {document.title} · {document.size}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
