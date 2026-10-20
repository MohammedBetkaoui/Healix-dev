import { CircleCheck, CircleDashed, CircleOff, FileClock, FilePenLine } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { reportStatusKeys } from "../reports.copy";
import { type ReportStatus } from "../types/report.types";

const presentation: Record<ReportStatus, { className: string; icon: typeof CircleCheck }> = {
  AMENDED: { className: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]", icon: FilePenLine },
  CANCELED: { className: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]", icon: CircleOff },
  CORRECTED: { className: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]", icon: FilePenLine },
  DRAFT: { className: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]", icon: CircleDashed },
  FINAL: { className: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]", icon: CircleCheck },
  PRELIMINARY: { className: "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]", icon: FileClock },
};

export function ReportStatusBadge({ status, t }: { status: ReportStatus; t: TranslationFunction }) {
  const value = presentation[status];
  const Icon = value.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold", value.className)}>
      <Icon size={12} strokeWidth={2} aria-hidden="true" />
      {t(reportStatusKeys[status])}
    </span>
  );
}

