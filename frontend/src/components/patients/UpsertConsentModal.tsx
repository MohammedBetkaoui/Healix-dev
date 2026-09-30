"use client";

import { ShieldCheck, TriangleAlert, X } from "lucide-react";
import { useId } from "react";
import { useForm } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useUpsertPatientConsent } from "@/features/patients/hooks/use-upsert-patient-consent";
import { getServerErrorMessage } from "@/lib/api/get-server-error-message";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { type PatientConsentStatus, type PatientConsentType } from "@/types/patient";

type UpsertConsentModalProps = {
  consentType: PatientConsentType;
  currentDocumentName?: string;
  currentStatus?: PatientConsentStatus;
  direction: Direction;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  patientId: string;
  t: TranslationFunction;
};

type ConsentFormValues = {
  documentName: string;
  status: PatientConsentStatus | "";
};

const consentStatuses: PatientConsentStatus[] = ["SIGNED", "NOT_GRANTED"];

// Mirrors backend/src/patients/dto/upsert-patient-consent.dto.ts.
const DOCUMENT_NAME_MAX_LENGTH = 255;

const fieldClass = "h-[42px] rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const labelClass = "text-[.8rem] font-medium text-[var(--text-primary)]";

function RequiredMark() {
  return <span aria-hidden="true" className="text-[var(--danger-ink)]"> *</span>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-xs text-[var(--danger-ink)]">{message}</p> : null;
}

export function UpsertConsentModal({
  isOpen,
  ...dialogProps
}: UpsertConsentModalProps) {
  // Mounting the dialog only while open gives every opening a form
  // pre-filled from the current consent, without resetting it in an effect.
  if (!isOpen) return null;

  return <UpsertConsentDialog {...dialogProps} />;
}

function UpsertConsentDialog({
  consentType,
  currentDocumentName,
  currentStatus,
  direction,
  onClose,
  onUpdated,
  patientId,
  t,
}: Omit<UpsertConsentModalProps, "isOpen">) {
  const baseId = useId();
  const ids = {
    description: `${baseId}-description`,
    documentName: `${baseId}-document-name`,
    status: `${baseId}-status`,
    title: `${baseId}-title`,
  };
  const upsertConsentMutation = useUpsertPatientConsent();
  const isLocked = upsertConsentMutation.isPending;
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ConsentFormValues>({
    defaultValues: {
      documentName: currentDocumentName ?? "",
      // A never-recorded consent has no preselected decision: recording a
      // signature must be an explicit choice, not a default.
      status: currentStatus ?? "",
    },
  });

  const submit = (values: ConsentFormValues) => {
    // Guaranteed by the `required` rule below; narrows the "" option away.
    if (!values.status) return;

    upsertConsentMutation.mutate(
      {
        patientId,
        type: consentType,
        payload: {
          // The backend overwrites documentName on every upsert (null when
          // omitted), hence the pre-filled field.
          documentName: values.documentName.trim() || undefined,
          status: values.status,
        },
      },
      {
        onSuccess: () => {
          onUpdated();
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
          aria-describedby={ids.description}
          aria-labelledby={ids.title}
          aria-modal="true"
          className="surface-section surface-raised w-full max-w-xl overflow-hidden"
          dir={direction}
          role="dialog"
        >
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="healix-mark"><ShieldCheck size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">{t("patients.modal.upsertConsent.title")}</h2>
                <p className="clinical-caption mt-0.5">{t(`patients.consents.types.${consentType}`)}</p>
              </div>
            </div>
            {isLocked ? null : (
              <button type="button" className="clinical-icon-button -me-2 -mt-1.5 shrink-0" onClick={onClose} aria-label={t("patients.actions.close")}>
                <X size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
          </header>

          <form onSubmit={handleSubmit(submit)} noValidate>
            <div className="space-y-5 px-6 py-5">
              <p id={ids.description} className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {t("patients.modal.upsertConsent.subtitle")}
              </p>

              <div className="space-y-1.5">
                <Label htmlFor={ids.status} className={labelClass}>{t("patients.modal.upsertConsent.statusLabel")}<RequiredMark /></Label>
                <Select
                  id={ids.status}
                  className={fieldClass}
                  aria-invalid={errors.status ? true : undefined}
                  aria-describedby={errors.status ? `${ids.status}-error` : undefined}
                  {...register("status", { required: true })}
                >
                  <option value="">{t("patients.modal.upsertConsent.selectStatus")}</option>
                  {consentStatuses.map((status) => (
                    <option key={status} value={status}>{t(`patients.consents.statuses.${status}`)}</option>
                  ))}
                </Select>
                <FieldError id={`${ids.status}-error`} message={errors.status ? t("patients.modal.upsertConsent.errors.status") : undefined} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={ids.documentName} className={labelClass}>{t("patients.modal.upsertConsent.documentNameLabel")}</Label>
                <Input
                  id={ids.documentName}
                  className={fieldClass}
                  maxLength={DOCUMENT_NAME_MAX_LENGTH}
                  aria-invalid={errors.documentName ? true : undefined}
                  aria-describedby={errors.documentName ? `${ids.documentName}-error` : undefined}
                  {...register("documentName", {
                    validate: (value) => value.trim().length <= DOCUMENT_NAME_MAX_LENGTH,
                  })}
                />
                <FieldError id={`${ids.documentName}-error`} message={errors.documentName ? t("patients.modal.upsertConsent.errors.documentName") : undefined} />
              </div>

              {upsertConsentMutation.isError ? (
                <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                  <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                  {getServerErrorMessage(upsertConsentMutation.error) ?? t("patients.modal.upsertConsent.submitError")}
                </p>
              ) : null}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 sm:flex-row sm:justify-end">
              <button type="button" className="clinical-button disabled:cursor-not-allowed disabled:opacity-60" onClick={onClose} disabled={isLocked}>{t("patients.actions.cancel")}</button>
              <button type="submit" className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={isLocked}>
                <ShieldCheck size={16} strokeWidth={1.8} aria-hidden="true" />
                {isLocked ? t("patients.modal.upsertConsent.submitting") : t("patients.modal.upsertConsent.submit")}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
