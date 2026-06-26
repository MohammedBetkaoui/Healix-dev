"use client";

import { FileUp, UploadCloud } from "lucide-react";
import { useRef } from "react";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type DoctorDocumentStatus } from "@/features/verification/types/doctor-verification.types";

type DoctorDocumentUploadCardProps = {
  acceptedFormatsText: string;
  description: string;
  error?: string;
  fileName?: string;
  maxSizeText: string;
  onFileSelect: (file: File | null) => void;
  replaceLabel: string;
  requirementLabel: string;
  requirementTone: "neutral" | "warning";
  selectLabel: string;
  status: DoctorDocumentStatus;
  statusLabel: string;
  title: string;
  uploadHint: string;
};

function statusTone(status: DoctorDocumentStatus) {
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

export function DoctorDocumentUploadCard({
  acceptedFormatsText,
  description,
  error,
  fileName,
  maxSizeText,
  onFileSelect,
  replaceLabel,
  requirementLabel,
  requirementTone,
  selectLabel,
  status,
  statusLabel,
  title,
  uploadHint,
}: DoctorDocumentUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <article className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">{title}</h3>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                requirementTone === "warning"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-slate-100 text-slate-600",
              )}
            >
              {requirementLabel}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <StatusBadge label={statusLabel} tone={statusTone(status)} />
      </div>

      <div
        className={cn(
          "mt-4 rounded-[18px] border border-dashed px-4 py-5 transition",
          error
            ? "border-red-300 bg-red-50/50"
            : "border-slate-200 bg-slate-50/60 hover:border-cyan-200 hover:bg-cyan-50/40",
        )}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          onFileSelect(event.dataTransfer.files.item(0));
        }}
      >
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
              {fileName ? (
                <FileUp className="h-5 w-5" />
              ) : (
                <UploadCloud className="h-5 w-5" />
              )}
            </span>
            <div>
              <p className="break-all text-sm font-medium text-slate-900">
                {fileName ?? uploadHint}
              </p>
              <p className="mt-1 text-xs text-slate-500">{acceptedFormatsText}</p>
              <p className="mt-1 text-xs text-slate-500">{maxSizeText}</p>
              {error ? (
                <p className="mt-2 text-sm font-medium text-red-600">{error}</p>
              ) : null}
            </div>
          </div>
          <div className="shrink-0">
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
              className="rounded-full px-4"
              onClick={() => inputRef.current?.click()}
            >
              {fileName ? replaceLabel : selectLabel}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
