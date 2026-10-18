"use client";

import { Activity, Check, FileImage, FileUp, Loader2, Search } from "lucide-react";
import { useId, useState } from "react";

import { formatPatientDate } from "@/features/patients/patient-registry";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { type PatientDocument } from "@/types/patient";

type ImageStepProps = {
  /** "signal" for the ECG chain: its documents are signals, not images. */
  copy?: "image" | "signal";
  acceptedFormats: readonly string[] | null;
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
  copy = "image",
  acceptedFormats,
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
  const [search, setSearch] = useState("");
  const filtered = documents.filter((document) => document.fileName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const DocumentIcon = copy === "signal" ? Activity : FileImage;
  const text = (key: string, params?: Record<string, string>) => t(`aiAnalyses.wizard.${copy}.${key}`, params);

  return (
    <div className="ai-document-step">
      <button type="button" className="ai-document-import" onClick={onImport}>
        <span className="ai-document-import-icon"><FileUp size={23} strokeWidth={1.5} aria-hidden="true" /></span>
        <span><strong>{text("import")}</strong><span>{t("aiAnalyses.wizard.workspace.importHint")}</span></span>
        {acceptedFormats ? <bdi dir="ltr">{acceptedFormats.join(" / ").toUpperCase()}</bdi> : null}
      </button>

      <p className="ai-document-record-hint">{text("hint", { patient: patientName })}</p>
      {documents.length > 5 ? <div className="ai-document-search"><label htmlFor={`${id}-search`}>{t("aiAnalyses.wizard.workspace.documentSearch")}</label><div><Search size={16} aria-hidden="true" /><input id={`${id}-search`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("aiAnalyses.wizard.workspace.documentSearchPlaceholder")} /></div></div> : null}
      <fieldset className="ai-document-results">
        <legend className="mb-2 text-[.8rem] font-medium text-[var(--text-primary)]">
          {text("listLabel")}
        </legend>
        {isLoading ? (
          <p role="status" className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            {text("loading")}
          </p>
        ) : isError ? (
          <p role="alert" className="text-sm text-[var(--danger-ink)]">{text("error")}</p>
        ) : documents.length === 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
            {text("empty")}
          </p>
        ) : filtered.length === 0 ? <p className="ai-document-empty">{t("aiAnalyses.wizard.workspace.noDocumentsMatch")}</p> : (
          <ul className="ai-document-list">
            {filtered.map((document) => {
              const isSelected = document.id === selectedId;

              return (
                <li key={document.id}>
                  <label className="ai-document-option" data-selected={isSelected}>
                    <input
                      type="radio"
                      name={`${id}-document`}
                      className="accent-[var(--medical)]"
                      checked={isSelected}
                      onChange={() => onSelect(document.id)}
                    />
                    <span className="ai-document-file-icon"><DocumentIcon size={20} strokeWidth={1.5} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--text-primary)]" title={document.fileName}>
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
                    {isSelected ? <Check size={16} aria-hidden="true" className="ai-document-selected" /> : null}
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
