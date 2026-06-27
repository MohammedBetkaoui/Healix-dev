"use client";

import { Download, Eye, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type TranslationFunction } from "@/lib/i18n";
import { type VerificationDocument } from "@/types/admin";

type VerificationDocumentsListProps = {
  documents: VerificationDocument[];
  onPreview: (document: VerificationDocument) => void;
  t: TranslationFunction;
};

export function VerificationDocumentsList({
  documents,
  onPreview,
  t,
}: VerificationDocumentsListProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-950">
          {t("admin.detail.documents.title")}
        </h2>
      </div>
      <div className="divide-y divide-slate-100">
        {documents.map((document) => (
          <article
            key={document.id}
            className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-[#0b3b5f] ring-1 ring-slate-200">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-slate-950">{document.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {document.type} · {document.size} · {document.uploadedAt}
                </p>
                <span className="mt-2 inline-flex rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                  {document.required
                    ? t("admin.detail.documents.required")
                    : t("admin.detail.documents.optional")}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onPreview(document)}
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                {t("admin.actions.viewDocument")}
              </Button>
              <Button type="button" variant="ghost" size="sm">
                <Download className="h-4 w-4" aria-hidden="true" />
                {t("admin.actions.download")}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
