import { cn } from "@/lib/utils";
import { type TranslationFunction } from "@/lib/i18n";

import { prescriptionStatusTranslationKeys } from "../prescriptions.copy";
import { type PrescriptionStatus } from "../types/prescription.types";

const statusClasses: Record<PrescriptionStatus, string> = {
  CANCELED: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  DRAFT: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]",
  EXPIRED: "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-secondary)]",
  PENDING_VALIDATION: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  PRINTED: "border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]",
  VALIDATED: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
};

export function PrescriptionStatusBadge({ status, t }: { status: PrescriptionStatus; t: TranslationFunction }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[.68rem] font-semibold", statusClasses[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {t(prescriptionStatusTranslationKeys[status])}
    </span>
  );
}

