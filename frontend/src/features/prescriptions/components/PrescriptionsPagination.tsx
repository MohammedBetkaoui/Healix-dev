import { ChevronLeft, ChevronRight } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

import { type PrescriptionMeta } from "../types/prescription.types";

type PrescriptionsPaginationProps = {
  meta: PrescriptionMeta;
  onPageChange: (page: number) => void;
  t: TranslationFunction;
};

export function PrescriptionsPagination({ meta, onPageChange, t }: PrescriptionsPaginationProps) {
  if (meta.totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3" aria-label={t("prescriptions.pagination.label")}>
      <button type="button" className="clinical-button" disabled={meta.page <= 1} onClick={() => onPageChange(meta.page - 1)}>
        <ChevronLeft size={15} className="rtl:rotate-180" aria-hidden="true" />{t("prescriptions.pagination.previous")}
      </button>
      <span className="text-[.72rem] text-[var(--text-secondary)]">{t("prescriptions.pagination.page", { page: meta.page, total: meta.totalPages })}</span>
      <button type="button" className="clinical-button" disabled={meta.page >= meta.totalPages} onClick={() => onPageChange(meta.page + 1)}>
        {t("prescriptions.pagination.next")}<ChevronRight size={15} className="rtl:rotate-180" aria-hidden="true" />
      </button>
    </nav>
  );
}
