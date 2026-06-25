import { CheckCircle2, Files, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

type VerificationSubmitPanelProps = {
  completedInfoCount: number;
  documentsAddedCount: number;
  isLoading: boolean;
  isReady: boolean;
  onSubmit: () => void;
  statusLabel: string;
  submitLabel: string;
  submittingLabel: string;
  title: string;
};

export function VerificationSubmitPanel({
  completedInfoCount,
  documentsAddedCount,
  isLoading,
  isReady,
  onSubmit,
  statusLabel,
  submitLabel,
  submittingLabel,
  title,
}: VerificationSubmitPanelProps) {
  return (
    <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-4 sm:grid-cols-3">
          <div className="rounded-[18px] border border-slate-200 bg-slate-50/70 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
              <FileText className="h-4 w-4" />
            </span>
            <p className="mt-4 text-sm text-slate-500">{title}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {completedInfoCount}/8
            </p>
          </div>
          <div className="rounded-[18px] border border-slate-200 bg-slate-50/70 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
              <Files className="h-4 w-4" />
            </span>
            <p className="mt-4 text-sm text-slate-500">Documents</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {documentsAddedCount}/5
            </p>
          </div>
          <div className="rounded-[18px] border border-slate-200 bg-slate-50/70 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <p className="mt-4 text-sm text-slate-500">Statut</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{statusLabel}</p>
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          className="rounded-full px-6"
          disabled={!isReady || isLoading}
          onClick={onSubmit}
        >
          {isLoading ? submittingLabel : submitLabel}
        </Button>
      </div>
    </section>
  );
}
