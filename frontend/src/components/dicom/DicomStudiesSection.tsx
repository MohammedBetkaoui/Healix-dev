"use client";

import { ScanLine, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/messaging/messaging-ui";
import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { type DicomStudy } from "@/features/dicom/dicom.types";
import { useDeleteDicomStudy, useDicomStudies } from "@/features/dicom/hooks/use-dicom-studies";
import { useReadOnlyAction } from "@/features/subscriptions/hooks/use-read-only-action";
import { type Locale } from "@/i18n";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { getMutationErrorMessage } from "@/lib/api/get-mutation-error-message";
import { type TranslationFunction } from "@/lib/i18n";

import { DicomImportPanel } from "./DicomImportPanel";
import { DicomStudiesTable } from "./DicomStudiesTable";

type DicomStudiesSectionProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  locale: Locale;
  patientId: string;
  t: TranslationFunction;
};

// The DICOM studies of a patient record (imaging tab, above the AI analyses):
// the list, the import, the deletion. Importing and deleting are writes, so a
// read-only account (no live subscription) sees the studies and opens them,
// but the buttons are off.
export function DicomStudiesSection({ accountType, locale, patientId, t }: DicomStudiesSectionProps) {
  const studiesQuery = useDicomStudies(patientId);
  const write = useReadOnlyAction(t);
  const deleteMutation = useDeleteDicomStudy();
  const [toDelete, setToDelete] = useState<DicomStudy | null>(null);
  const studies = studiesQuery.data ?? [];

  const close = () => {
    setToDelete(null);
    deleteMutation.reset();
  };
  const confirmDelete = () => {
    if (!toDelete) return;
    deleteMutation.mutate({ patientId, studyId: toDelete.id }, { onSuccess: close });
  };

  return (
    <section aria-labelledby="patient-dicom-studies" className="mb-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex items-start gap-3">
        <ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent-dark)]" strokeWidth={1.7} aria-hidden="true" />
        <div>
          <h2 id="patient-dicom-studies" className="font-[var(--font-auth-display)] text-xl font-medium text-[var(--ink)]">{t("dicom.studies.title")}</h2>
          <p className="clinical-caption mt-0.5">{t("dicom.studies.subtitle")}</p>
        </div>
      </div>

      <DicomImportPanel disabled={write.disabled} disabledTitle={write.title} patientId={patientId} t={t} />

      {isVerificationRequiredError(studiesQuery.error) ? (
        <div className="mt-5"><VerificationRequiredNotice accountType={accountType} t={t} /></div>
      ) : studiesQuery.isLoading ? (
        <p className="mt-5 text-sm text-[var(--ink-faint)]" aria-live="polite">{t("dicom.studies.loading")}</p>
      ) : studiesQuery.isError ? (
        <p role="alert" className="mt-5 text-sm text-[var(--danger-ink)]">{t("dicom.studies.error")}</p>
      ) : studies.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--ink-faint)]">{t("dicom.studies.empty")}</p>
      ) : (
        <DicomStudiesTable
          accountType={accountType}
          canDelete={!write.disabled && !deleteMutation.isPending}
          deleteTitle={write.title}
          locale={locale}
          onDelete={setToDelete}
          patientId={patientId}
          studies={studies}
          t={t}
        />
      )}

      <ConfirmDialog
        busy={deleteMutation.isPending}
        body={
          <>
            <p>{t("dicom.delete.body")}</p>
            {deleteMutation.isError ? (
              <p role="alert" className="mt-2 flex items-start gap-2 text-[var(--danger-ink)]">
                <TriangleAlert size={14} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                {getMutationErrorMessage(deleteMutation.error, t, t("dicom.delete.error"))}
              </p>
            ) : null}
          </>
        }
        cancelLabel={t("dicom.delete.cancel")}
        confirmLabel={t("dicom.delete.confirm")}
        danger
        onCancel={close}
        onConfirm={confirmDelete}
        open={toDelete !== null}
        title={t("dicom.delete.title")}
      />
    </section>
  );
}
