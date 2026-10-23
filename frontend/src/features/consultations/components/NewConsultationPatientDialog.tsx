"use client";

import { ClipboardPlus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ReportPatientPicker, type PatientChoice } from "@/features/reports/components/ReportPatientPicker";
import { type Locale } from "@/i18n";
import { type Direction, type TranslationFunction } from "@/lib/i18n";

type NewConsultationPatientDialogProps = {
  direction: Direction;
  locale: Locale;
  onCancel: () => void;
  onChoose: (patient: PatientChoice) => void;
  t: TranslationFunction;
};

// Step before the consultation form when the page has no patient in context.
export function NewConsultationPatientDialog({ direction, locale, onCancel, onChoose, t }: NewConsultationPatientDialogProps) {
  const [patient, setPatient] = useState<PatientChoice | null>(null);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel(); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--scrim)] p-4 sm:items-center" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="surface-section surface-raised w-full max-w-md overflow-hidden" dir={direction} role="dialog" aria-modal="true" aria-labelledby="consultation-patient-title">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
          <div><h2 id="consultation-patient-title" className="text-base font-semibold">{t("consultations.patientDialog.title")}</h2><p className="clinical-caption mt-0.5">{t("consultations.patientDialog.subtitle")}</p></div>
          <button type="button" className="clinical-icon-button shrink-0" onClick={onCancel} aria-label={t("consultations.actions.close")}><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="px-5 py-5"><ReportPatientPicker locale={locale} onChange={setPatient} t={t} value={patient} /></div>
        <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" className="clinical-button" onClick={onCancel}>{t("consultations.actions.cancel")}</button>
          <button type="button" className="clinical-button clinical-button-primary" disabled={!patient} onClick={() => patient && onChoose(patient)}><ClipboardPlus size={16} aria-hidden="true" />{t("consultations.patientDialog.continue")}</button>
        </footer>
      </div>
    </div>
  );
}
