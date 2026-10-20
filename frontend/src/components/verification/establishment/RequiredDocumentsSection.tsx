import { type FieldErrors } from "react-hook-form";
import { Files } from "lucide-react";

import {
  type DocumentUploadState,
  type EstablishmentVerificationFormInput,
  type RequiredDocumentDefinition,
} from "@/features/verification/types/verification.types";

import { DocumentUploadCard } from "./DocumentUploadCard";

type RequiredDocumentsSectionProps = {
  deletingType?: RequiredDocumentDefinition["type"] | null;
  documentStates: Record<string, DocumentUploadState>;
  documents: RequiredDocumentDefinition[];
  errors: FieldErrors<EstablishmentVerificationFormInput>;
  onFileSelect: (
    fieldName: RequiredDocumentDefinition["fieldName"],
    type: RequiredDocumentDefinition["type"],
    file: File | null,
  ) => void;
  // Omitted when deletion is not allowed (request under admin review).
  onDelete?: (type: RequiredDocumentDefinition["type"]) => void;
  t: (key: string) => string;
};

export function RequiredDocumentsSection({
  deletingType = null,
  documentStates,
  documents,
  errors,
  onDelete,
  onFileSelect,
  t,
}: RequiredDocumentsSectionProps) {
  return (
    <section className="surface-section overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border bg-[var(--surface-muted)] px-5 py-4 sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent-dark)]">
          <Files className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("verification.documents.title")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t("verification.documents.subtitle")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-2">
        {documents.map((document) => {
          const state = documentStates[document.type];
          const fieldError = errors[document.fieldName];

          return (
            <DocumentUploadCard
              key={document.type}
              acceptedFormatsText={t("verification.documents.acceptedFormats")}
              deleteLabel={t("verification.documents.deleteFile")}
              description={t(document.descriptionKey)}
              error={fieldError?.message as string | undefined}
              fileName={state?.fileName}
              isDeleting={deletingType === document.type}
              maxSizeText={t("verification.documents.maxSize")}
              // A documentId means the file is persisted server-side; a file
              // only picked locally (READY) is simply replaced or re-picked.
              onDelete={onDelete && state?.documentId ? () => onDelete(document.type) : undefined}
              onFileSelect={(file) => onFileSelect(document.fieldName, document.type, file)}
              replaceLabel={t("verification.documents.replaceFile")}
              selectLabel={t("verification.documents.selectFile")}
              status={state?.status ?? "MISSING"}
              statusLabel={t(`verification.documents.statuses.${state?.status ?? "MISSING"}`)}
              title={t(document.titleKey)}
              uploadHint={t("verification.documents.dragDrop")}
            />
          );
        })}
      </div>
    </section>
  );
}
