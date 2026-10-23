import { BrainCircuit, FileHeart, FileText, FlaskConical, Images, Paperclip } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

import { reportCategoryKeys } from "../reports.copy";
import { type ReportCategory } from "../types/report.types";

const icons: Record<ReportCategory, typeof FileText> = {
  AI_BRAIN: BrainCircuit,
  AI_CARDIAC_MRI: BrainCircuit,
  AI_ECG: FileHeart,
  AI_PATHOLOGY: BrainCircuit,
  CONSULTATION_NOTE: FileText,
  EXTERNAL_MEDICAL: Paperclip,
  LABORATORY_RESULT: FlaskConical,
  OTHER_CLINICAL: FileText,
  RADIOLOGY: Images,
};

export function ReportTypeBadge({ category, t }: { category: ReportCategory; t: TranslationFunction }) {
  const Icon = icons[category];
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-1 text-[0.66rem] font-medium text-[var(--text-primary)]">
      <Icon size={12} className="shrink-0 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
      <span className="truncate">{t(reportCategoryKeys[category])}</span>
    </span>
  );
}
