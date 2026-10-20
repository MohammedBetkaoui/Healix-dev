"use client";

import { FileUp, UploadCloud } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type DocumentUploadStatus } from "@/features/verification/types/verification.types";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";

type DocumentUploadCardProps = {
  acceptedFormatsText: string;
  deleteLabel: string;
  description: string;
  error?: string;
  fileName?: string;
  isDeleting?: boolean;
  maxSizeText: string;
  onDelete?: () => void;
  onFileSelect: (file: File | null) => void;
  replaceLabel: string;
  selectLabel: string;
  status: DocumentUploadStatus;
  statusLabel: string;
  title: string;
  uploadHint: string;
};

function mapStatusTone(status: DocumentUploadStatus) {
  if (status === "READY") {
    return "info";
  }

  if (status === "UPLOADED") {
    return "success";
  }

  if (status === "REJECTED") {
    return "warning";
  }

  return "neutral";
}

export function DocumentUploadCard({
  acceptedFormatsText,
  deleteLabel,
  description,
  error,
  fileName,
  isDeleting = false,
  maxSizeText,
  onDelete,
  onFileSelect,
  replaceLabel,
  selectLabel,
  status,
  statusLabel,
  title,
  uploadHint,
}: DocumentUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-border bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <StatusBadge label={statusLabel} tone={mapStatusTone(status)} />
      </div>

      <div
        className={cn(
          "mt-4 flex flex-1 rounded-md border border-dashed px-4 py-4 transition-colors",
          error
            ? "border-[var(--danger-line)] bg-[var(--danger-soft)]/50"
            : "border-[var(--border-strong)] bg-[var(--surface-muted)] hover:border-[var(--medical)] hover:bg-[var(--medical-soft)]",
        )}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files.item(0);
          onFileSelect(file);
        }}
      >
        <div className="flex w-full flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-[var(--surface)] text-[var(--medical)]">
              {fileName ? <FileUp className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className="break-all text-sm font-medium text-foreground">
                {fileName ?? uploadHint}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{acceptedFormatsText}</p>
              <p className="mt-1 text-xs text-muted-foreground">{maxSizeText}</p>
              {error ? <p className="mt-2 text-sm font-medium text-[var(--danger-ink)]">{error}</p> : null}
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(event) => {
                onFileSelect(event.target.files?.item(0) ?? null);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-9 flex-1 rounded-md px-4 sm:flex-none"
              onClick={() => inputRef.current?.click()}
            >
              {fileName ? replaceLabel : selectLabel}
            </Button>
            {/* Only for a document already persisted on the backend. */}
            {onDelete ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-9 flex-1 rounded-md px-4 sm:flex-none"
                disabled={isDeleting}
                onClick={onDelete}
              >
                {deleteLabel}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
