"use client";

import { Download, Eye, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api/http-client";
import { type TranslationFunction } from "@/lib/i18n";
import { type VerificationDocument } from "@/types/admin";

type VerificationDocumentsListProps = {
  documents: VerificationDocument[];
  onPreview: (document: VerificationDocument) => void;
  t: TranslationFunction;
  verificationId: string;
};

async function downloadDocument(
  verificationId: string,
  document: VerificationDocument,
) {
  const response = await apiClient.get(
    `/admin/verifications/${verificationId}/documents/${document.id}/download`,
    { responseType: "blob" },
  );
  const url = URL.createObjectURL(response.data as Blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = document.originalName ?? document.title;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function VerificationDocumentsList({
  documents,
  onPreview,
  t,
  verificationId,
}: VerificationDocumentsListProps) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-6">
        <h2 className="text-lg font-semibold text-foreground">
          {t("admin.detail.documents.title")}
        </h2>
      </div>
      <div className="divide-y divide-border">
        {documents.map((document) => (
          <article
            key={document.id}
            className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-[var(--accent-dark)] ring-1 ring-border">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-semibold text-foreground">{document.title}</p>
                {document.originalName ? (
                  <p className="mt-0.5 text-xs text-muted-foreground italic">
                    {document.originalName}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {document.size} · {document.uploadedAt}
                </p>
                <span className="mt-2 inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-[var(--accent-dark)]">
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void downloadDocument(verificationId, document)}
              >
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
