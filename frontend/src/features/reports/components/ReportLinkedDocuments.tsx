import { FileImage, FileText, Waves } from "lucide-react";

import { type Locale } from "@/i18n";
import { formatFileSize } from "@/lib/format/format-file-size";
import { type TranslationFunction } from "@/lib/i18n";

import { type ClinicalReport } from "../types/report.types";

export function ReportLinkedDocuments({ locale, report, t }: { locale: Locale; report: ClinicalReport; t: TranslationFunction }) {
  const documents = [report.presentedForm, ...report.linkedDocuments].filter(Boolean);
  if (!documents.length) return <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--text-secondary)]">{t("reports.documents.empty")}</p>;

  return (
    <div className="divide-y divide-[var(--line-soft)] rounded-[var(--radius-md)] border border-[var(--border)]">
      {documents.map((document) => {
        const Icon = document!.kind === "ECG_TRACE" ? Waves : document!.mimeType.startsWith("image/") || document!.kind === "MASK" || document!.kind === "OVERLAY" ? FileImage : FileText;
        return <article key={document!.id} className="flex items-center gap-3 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]"><Icon size={16} strokeWidth={1.8} aria-hidden="true" /></span><div className="min-w-0"><p className="truncate text-xs font-semibold">{document!.label[locale]}</p><p className="clinical-figure mt-1 truncate text-[0.65rem] text-[var(--text-muted)]" dir="ltr">{document!.fileName}{document!.sizeBytes ? ` · ${formatFileSize(document!.sizeBytes)}` : ""}</p></div></article>;
      })}
    </div>
  );
}

