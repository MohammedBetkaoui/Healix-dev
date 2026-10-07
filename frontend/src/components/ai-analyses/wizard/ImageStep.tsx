"use client";

import { FileImage, ImagePlus, Loader2 } from "lucide-react";
import { useId } from "react";

import { formatPatientDate } from "@/features/patients/patient-registry";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type PatientDocument } from "@/types/patient";

type ImageStepProps = {
  documents: PatientDocument[];
  isError: boolean;
  isLoading: boolean;
  locale: Locale;
  onImport: () => void;
  onSelect: (documentId: string) => void;
  patientName: string;
  selectedId: string | null;
  t: TranslationFunction;
};

export function ImageStep({
  documents,
  isError,
  isLoading,
  locale,
  onImport,
  onSelect,
  patientName,
  selectedId,
  t,
}: ImageStepProps) {
  const id = useId();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-secondary)]">
          {t("aiAnalyses.wizard.image.hint", { patient: patientName })}
        </p>
        <button type="button" className="clinical-button" onClick={onImport}>
          <ImagePlus size={16} strokeWidth={1.8} aria-hidden="true" />
          {t("aiAnalyses.wizard.image.import")}
        </button>
      </div>

      <fieldset>
        <legend className="mb-2 text-[.8rem] font-medium text-[var(--text-primary)]">
          {t("aiAnalyses.wizard.image.listLabel")}
        </legend>
        {isLoading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {t("aiAnalyses.wizard.image.loading")}
          </p>
        ) : isError ? (
          <p role="alert" className="text-sm text-[var(--danger-ink)]">{t("aiAnalyses.wizard.image.error")}</p>
        ) : documents.length === 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
            {t("aiAnalyses.wizard.image.empty")}
          </p>
        ) : (
          <ul className="grid gap-2">
            {documents.map((document) => {
              const isSelected = document.id === selectedId;

              return (
                <li key={document.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5",
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${id}-document`}
                      className="accent-[var(--accent)]"
                      checked={isSelected}
                      onChange={() => onSelect(document.id)}
                    />
                    <FileImage size={18} strokeWidth={1.7} aria-hidden="true" className="shrink-0 text-[var(--text-secondary)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                        <bdi>{document.fileName}</bdi>
                      </span>
                      <span className="block text-xs text-[var(--text-secondary)]">
                        {t(`patients.documents.${document.type}`)}
                        {" · "}
                        {formatPatientDate(document.date, locale)}
                        {" · "}
                        <bdi dir="ltr">{document.size}</bdi>
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
    </div>
  );
}
