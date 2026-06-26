import {
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";

import { FormErrorMessage } from "@/components/auth/register/FormErrorMessage";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { type TranslationFunction } from "@/lib/i18n";
import {
  type DoctorDocumentType,
  type DoctorDocumentDefinition,
  type DoctorDocumentUploadState,
  type DoctorVerificationFormInput,
} from "@/features/verification/types/doctor-verification.types";

import { DoctorDocumentUploadCard } from "../DoctorDocumentUploadCard";

type DoctorSubmissionStepProps = {
  documentStates: Record<DoctorDocumentType, DoctorDocumentUploadState>;
  documents: DoctorDocumentDefinition[];
  errors: FieldErrors<DoctorVerificationFormInput>;
  missingRequiredDocuments: DoctorDocumentDefinition[];
  onFileSelect: (
    fieldName: DoctorDocumentDefinition["fieldName"],
    type: DoctorDocumentDefinition["type"],
    file: File | null,
  ) => void;
  register: UseFormRegister<DoctorVerificationFormInput>;
  sectionCompletion: {
    fiscalSocial: boolean;
    identity: boolean;
    practiceLocation: boolean;
    professionalRegistration: boolean;
    qualification: boolean;
  };
  t: TranslationFunction;
};

function completionLabel(done: boolean) {
  return done ? "BASIC_ACCOUNT" : "INCOMPLETE";
}

export function DoctorSubmissionStep({
  documentStates,
  documents,
  errors,
  missingRequiredDocuments,
  onFileSelect,
  register,
  sectionCompletion,
  t,
}: DoctorSubmissionStepProps) {
  const addedDocumentsCount = Object.values(documentStates).filter(
    (state) => state.status === "READY" || state.status === "UPLOADED",
  ).length;
  const confirmError = errors.confirmAuthenticity?.message;

  return (
    <section className="space-y-6">
      <div className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-950">
            {t("doctorVerification.submission.summaryTitle")}
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              done: sectionCompletion.identity,
              label: t("doctorVerification.submission.identity"),
            },
            {
              done: sectionCompletion.qualification,
              label: t("doctorVerification.submission.qualification"),
            },
            {
              done: sectionCompletion.professionalRegistration,
              label: t("doctorVerification.submission.professionalRegistration"),
            },
            {
              done: sectionCompletion.practiceLocation,
              label: t("doctorVerification.submission.practiceLocation"),
            },
            {
              done: sectionCompletion.fiscalSocial,
              label: t("doctorVerification.submission.fiscalSocial"),
            },
            {
              done: missingRequiredDocuments.length === 0,
              label: t("doctorVerification.submission.documentsAdded"),
              value: `${addedDocumentsCount}/${documents.length}`,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[18px] border border-slate-200 bg-slate-50/70 p-4"
            >
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {item.value ?? completionLabel(item.done)}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-[18px] border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-slate-950">
            {t("doctorVerification.submission.missingDocuments")}
          </p>
          {missingRequiredDocuments.length > 0 ? (
            <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-500">
              {missingRequiredDocuments.map((document) => (
                <li key={document.type}>{t(document.titleKey)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-emerald-700">
              {t("doctorVerification.submission.noneMissing")}
            </p>
          )}
        </div>
      </div>

      <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-950">
            {t("doctorVerification.documents.title")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {t("doctorVerification.documents.subtitle")}
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {documents.map((document) => {
            const state = documentStates[document.type];
            const fieldError = errors[document.fieldName]?.message as
              | string
              | undefined;

            return (
              <DoctorDocumentUploadCard
                key={document.type}
                acceptedFormatsText={t("doctorVerification.documents.acceptedFormats")}
                description={t(document.descriptionKey)}
                error={fieldError}
                fileName={state?.fileName}
                maxSizeText={t("doctorVerification.documents.maxSize")}
                onFileSelect={(file) =>
                  onFileSelect(document.fieldName, document.type, file)
                }
                replaceLabel={t("doctorVerification.documents.replaceFile")}
                requirementLabel={
                  document.required
                    ? t("doctorVerification.documents.requiredBadge")
                    : t("doctorVerification.documents.optionalBadge")
                }
                requirementTone={document.required ? "warning" : "neutral"}
                selectLabel={t("doctorVerification.documents.selectFile")}
                status={state?.status ?? "MISSING"}
                statusLabel={t(
                  `doctorVerification.documents.statuses.${state?.status ?? "MISSING"}`,
                )}
                title={t(document.titleKey)}
                uploadHint={t("doctorVerification.documents.dragDrop")}
              />
            );
          })}
        </div>

        <div className="mt-5 rounded-[18px] border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="confirmAuthenticity"
              aria-invalid={Boolean(confirmError)}
              aria-describedby="confirmAuthenticity-error"
              {...register("confirmAuthenticity")}
            />
            <Label
              htmlFor="confirmAuthenticity"
              className="text-sm font-medium leading-6 text-slate-700"
            >
              {t("doctorVerification.submission.confirm")}
            </Label>
          </div>
          <FormErrorMessage
            id="confirmAuthenticity-error"
            message={confirmError}
          />
        </div>
      </section>
    </section>
  );
}
