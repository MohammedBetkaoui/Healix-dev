import { FileImage, FileText } from "lucide-react";

import { formatFileSize } from "@/lib/format/format-file-size";
import { type TranslationFunction } from "@/lib/i18n";

import { type ClinicalReport } from "../types/report.types";

// The file behind the report: its PDF, the PDF of its AI analysis, or the
// document that was imported.
export function ReportLinkedDocuments({ report, t }: { report: ClinicalReport; t: TranslationFunction }) {
  const document = report.presentedForm;
  if (!document) return <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--text-secondary)]">{t("reports.documents.empty")}</p>;
  const Icon = document.mimeType.startsWith("image/") ? FileImage : FileText;
  return (
    <div className="divide-y divide-[var(--line-soft)] rounded-[var(--radius-md)] border border-[var(--border)]">
      <article className="flex items-center gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]"><Icon size={16} strokeWidth={1.8} aria-hidden="true" /></span>
        <div className="min-w-0"><p className="truncate text-xs font-semibold">{t(`reports.documents.kinds.${document.kind}`)}</p><p className="clinical-figure mt-1 truncate text-[0.65rem] text-[var(--text-muted)]" dir="ltr">{document.fileName} · {formatFileSize(document.sizeBytes)}</p></div>
      </article>
    </div>
  );
}
