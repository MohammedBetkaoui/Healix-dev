"use client";

import { FolderUp, TriangleAlert, UploadCloud, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import {
  checkDicomSelection,
  filesOfDrop,
  type DicomSelectionProblem,
} from "@/features/dicom/dicom-import";
import { useImportDicomStudies } from "@/features/dicom/hooks/use-dicom-studies";
import { type DicomImportWarning } from "@/features/dicom/dicom.types";
import { getMutationErrorMessage } from "@/lib/api/get-mutation-error-message";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type DicomImportPanelProps = {
  /** The account is read-only (no live subscription): nothing can be sent. */
  disabled: boolean;
  disabledTitle?: string;
  patientId: string;
  t: TranslationFunction;
};

// What the physician should look at after an import: a DICOM header that does
// not describe the patient of the record, or a study held by another record.
export function DicomImportWarnings({ t, warnings }: { t: TranslationFunction; warnings: readonly DicomImportWarning[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--warning-ink)]">
      <p className="flex items-center gap-2 font-medium">
        <TriangleAlert size={15} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
        {t("dicom.import.summary.warningsTitle")}
      </p>
      <ul className="mt-1.5 list-disc space-y-1 ps-6">
        {warnings.map((warning) => (
          <li key={`${warning.code}-${warning.studyInstanceUid}`}>
            {t(`dicom.import.warnings.${warning.code}`, {
              fields: (warning.fields ?? []).map((field) => t(`dicom.studies.fields.${field}`)).join(", "),
              uid: warning.studyInstanceUid,
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Drag and drop (or pick) the .dcm files, a folder, or one .zip of a study:
// the progress of the upload, then what came of it.
export function DicomImportPanel({ disabled, disabledTitle, patientId, t }: DicomImportPanelProps) {
  const baseId = useId();
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const importMutation = useImportDicomStudies();
  const [problem, setProblem] = useState<DicomSelectionProblem | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = importMutation.isPending;
  const locked = disabled || busy;

  const start = (files: File[]) => {
    const selection = checkDicomSelection(files);
    if (!selection.ok) {
      importMutation.reset();
      setProblem(selection.problem);
      return;
    }
    setProblem(null);
    importMutation.mutate({ files: selection.files, patientId });
  };

  const result = importMutation.isSuccess ? importMutation.data : null;
  const percent = Math.round(importMutation.progress * 100);

  return (
    <div className="mt-5">
      <div
        className={cn(
          "rounded-[var(--radius-sm)] border border-dashed bg-[var(--surface-muted)] px-4 py-4 transition",
          dragging && !locked ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border-strong)]",
          disabled && "opacity-70",
        )}
        data-dropzone="true"
        title={disabled ? disabledTitle : undefined}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (locked) return;
          void filesOfDrop(event.dataTransfer).then(start);
        }}
      >
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-muted)] shadow-sm">
              <UploadCloud size={20} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{t("dicom.import.dropHint")}</p>
              <p className="clinical-caption mt-1">{t("dicom.import.formats")}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <input
              ref={filesInput}
              id={`${baseId}-files`}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                start(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <input
              ref={(element) => {
                folderInput.current = element;
                element?.setAttribute("webkitdirectory", "");
              }}
              id={`${baseId}-folder`}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                start(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <button type="button" className="clinical-button disabled:cursor-not-allowed disabled:opacity-60" disabled={locked} title={disabledTitle} onClick={() => filesInput.current?.click()}>
              <UploadCloud size={16} strokeWidth={1.8} aria-hidden="true" />
              {t("dicom.import.choose")}
            </button>
            <button type="button" className="clinical-button disabled:cursor-not-allowed disabled:opacity-60" disabled={locked} title={disabledTitle} onClick={() => folderInput.current?.click()}>
              <FolderUp size={16} strokeWidth={1.8} aria-hidden="true" />
              {t("dicom.import.chooseFolder")}
            </button>
          </div>
        </div>

        {busy ? (
          <div className="mt-4" aria-live="polite">
            <div
              role="progressbar"
              aria-label={t("dicom.import.progressLabel")}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={percent}
              className="h-2 overflow-hidden rounded-full bg-[var(--line)]"
            >
              <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${percent}%` }} />
            </div>
            <p className="clinical-caption mt-1.5">
              {importMutation.progress >= 1 ? t("dicom.import.processing") : t("dicom.import.uploading", { percent })}
            </p>
          </div>
        ) : null}
      </div>

      {problem ? (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
          <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
          {t(`dicom.import.problems.${problem}`)}
        </p>
      ) : null}

      {importMutation.isError ? (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
          <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
          {getMutationErrorMessage(importMutation.error, t, t("dicom.errors.generic"))}
        </p>
      ) : null}

      {result ? (
        <section aria-label={t("dicom.import.summary.title")} className="mt-3 rounded-[var(--radius-sm)] border border-[var(--success-line)] bg-[var(--success-soft)] px-3 py-3 text-sm text-[var(--success-ink)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{t("dicom.import.summary.title")}</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                <li>{t("dicom.import.summary.imported", { count: result.imported })}</li>
                <li>{t("dicom.import.summary.studies", { count: result.studies.length })}</li>
                {result.skipped > 0 ? <li>{t("dicom.import.summary.skipped", { count: result.skipped })}</li> : null}
              </ul>
            </div>
            <button type="button" className="clinical-icon-button -me-1 -mt-1 shrink-0" onClick={importMutation.reset} aria-label={t("dicom.import.summary.dismiss")}>
              <X size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
          <DicomImportWarnings t={t} warnings={result.warnings} />
        </section>
      ) : null}
    </div>
  );
}
