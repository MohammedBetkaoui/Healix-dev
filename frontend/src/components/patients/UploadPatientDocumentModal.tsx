"use client";

import { FileUp, TriangleAlert, UploadCloud, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useUploadPatientDocument } from "@/features/patients/hooks/use-upload-patient-document";
import { getServerErrorMessage } from "@/lib/api/get-server-error-message";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { type PatientDocumentType } from "@/types/patient";

type UploadPatientDocumentModalProps = {
  direction: Direction;
  isOpen: boolean;
  onClose: () => void;
  onUploaded: () => void;
  patientId: string;
  t: TranslationFunction;
};

const documentTypes: PatientDocumentType[] = ["PRESCRIPTION", "MEDICAL_REPORT", "MEDICAL_IMAGE", "DICOM"];

const fieldClass = "h-[42px] rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const labelClass = "text-[.8rem] font-medium text-[var(--text-primary)]";

function RequiredMark() {
  return <span aria-hidden="true" className="text-[var(--danger-ink)]"> *</span>;
}

export function UploadPatientDocumentModal({
  isOpen,
  ...dialogProps
}: UploadPatientDocumentModalProps) {
  // Mounting the dialog only while open gives every opening fresh state
  // (no stale file, type or error) without resetting it in an effect.
  if (!isOpen) return null;

  return <UploadPatientDocumentDialog {...dialogProps} />;
}

function UploadPatientDocumentDialog({
  direction,
  onClose,
  onUploaded,
  patientId,
  t,
}: Omit<UploadPatientDocumentModalProps, "isOpen">) {
  const baseId = useId();
  const ids = {
    file: `${baseId}-file`,
    subtitle: `${baseId}-subtitle`,
    title: `${baseId}-title`,
    type: `${baseId}-type`,
  };
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadDocumentMutation = useUploadPatientDocument();
  const [documentType, setDocumentType] = useState<PatientDocumentType | "">("");
  const [file, setFile] = useState<File | null>(null);
  const isLocked = uploadDocumentMutation.isPending;
  const missingRequirement = !documentType
    ? t("patients.modal.uploadDocument.typeRequired")
    : !file
      ? t("patients.modal.uploadDocument.fileRequired")
      : undefined;

  const selectFile = (selected: File | null) => {
    if (!selected) return;
    setFile(selected);
    // A previous error (e.g. unsupported format) no longer applies to the
    // newly picked file.
    uploadDocumentMutation.reset();
  };

  const submit = () => {
    if (!documentType || !file) return;

    uploadDocumentMutation.mutate(
      { documentType, file, patientId },
      {
        onSuccess: () => {
          onUploaded();
          onClose();
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isLocked) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
        <div
          aria-describedby={ids.subtitle}
          aria-labelledby={ids.title}
          aria-modal="true"
          className="surface-section surface-raised w-full max-w-xl overflow-hidden"
          dir={direction}
          role="dialog"
        >
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="healix-mark"><FileUp size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">{t("patients.modal.uploadDocument.title")}</h2>
                <p id={ids.subtitle} className="clinical-caption mt-0.5">{t("patients.modal.uploadDocument.subtitle")}</p>
              </div>
            </div>
            {isLocked ? null : (
              <button type="button" className="clinical-icon-button -me-2 -mt-1.5 shrink-0" onClick={onClose} aria-label={t("patients.actions.close")}>
                <X size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
          </header>

          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="space-y-5 px-6 py-5">
              <div className="space-y-1.5">
                <Label htmlFor={ids.type} className={labelClass}>{t("patients.modal.uploadDocument.typeLabel")}<RequiredMark /></Label>
                <Select
                  id={ids.type}
                  className={fieldClass}
                  disabled={isLocked}
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value as PatientDocumentType | "")}
                >
                  <option value="">{t("patients.modal.uploadDocument.selectType")}</option>
                  {documentTypes.map((type) => (
                    <option key={type} value={type}>{t(`patients.documents.${type}`)}</option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={ids.file} className={labelClass}>{t("patients.modal.uploadDocument.fileLabel")}<RequiredMark /></Label>
                <div
                  className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-4 py-5 transition hover:border-[var(--accent-line)]"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!isLocked) selectFile(event.dataTransfer.files.item(0));
                  }}
                >
                  <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-muted)] shadow-sm">
                        {file ? <FileUp size={20} strokeWidth={1.8} aria-hidden="true" /> : <UploadCloud size={20} strokeWidth={1.8} aria-hidden="true" />}
                      </span>
                      <div className="min-w-0">
                        <p className="break-all text-sm font-medium text-[var(--text-primary)]">
                          {file ? <bdi>{file.name}</bdi> : t("patients.modal.uploadDocument.dragHint")}
                        </p>
                        <p className="clinical-caption mt-1">{t("patients.modal.uploadDocument.acceptedFormats")}</p>
                        <p className="clinical-caption mt-1">{t("patients.modal.uploadDocument.maxSize")}</p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <input
                        ref={inputRef}
                        id={ids.file}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.dcm"
                        className="hidden"
                        onChange={(event) => selectFile(event.target.files?.item(0) ?? null)}
                      />
                      <button type="button" className="clinical-button disabled:cursor-not-allowed disabled:opacity-60" disabled={isLocked} onClick={() => inputRef.current?.click()}>
                        {file ? t("patients.modal.uploadDocument.changeFile") : t("patients.modal.uploadDocument.selectFile")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {uploadDocumentMutation.isError ? (
                <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                  <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                  {getServerErrorMessage(uploadDocumentMutation.error) ?? t("patients.modal.uploadDocument.submitError")}
                </p>
              ) : null}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 sm:flex-row sm:justify-end">
              <button type="button" className="clinical-button disabled:cursor-not-allowed disabled:opacity-60" onClick={onClose} disabled={isLocked}>{t("patients.actions.cancel")}</button>
              <button
                type="submit"
                className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLocked || missingRequirement !== undefined}
                title={missingRequirement}
              >
                <FileUp size={16} strokeWidth={1.8} aria-hidden="true" />
                {isLocked ? t("patients.modal.uploadDocument.submitting") : t("patients.modal.uploadDocument.submit")}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
