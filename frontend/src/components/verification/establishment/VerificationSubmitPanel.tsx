import { CheckCircle2, Files, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

type VerificationSubmitPanelProps = {
  completedInfoCount: number;
  documentsAddedCount: number;
  documentsLabel: string;
  documentsTotalCount: number;
  infoTotalCount: number;
  isLoading: boolean;
  isReady: boolean;
  onSubmit: () => void;
  statusLabel: string;
  statusTitle: string;
  submitLabel: string;
  submittingLabel: string;
  title: string;
};

export function VerificationSubmitPanel({
  completedInfoCount,
  documentsAddedCount,
  documentsLabel,
  documentsTotalCount,
  infoTotalCount,
  isLoading,
  isReady,
  onSubmit,
  statusLabel,
  statusTitle,
  submitLabel,
  submittingLabel,
  title,
}: VerificationSubmitPanelProps) {
  return (
    <section className="surface-section sticky bottom-4 z-10 overflow-hidden bg-[var(--surface)]/95 p-4 backdrop-blur sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 gap-px overflow-hidden rounded-md border border-border bg-[var(--border)] sm:grid-cols-3">
          <div className="flex items-center gap-3 bg-[var(--surface-muted)] px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-[var(--surface)] text-[var(--medical)]">
              <FileText className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">{title}</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
                {completedInfoCount}/{infoTotalCount}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-[var(--surface-muted)] px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-[var(--surface)] text-[var(--medical)]">
              <Files className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">{documentsLabel}</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
                {documentsAddedCount}/{documentsTotalCount}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-[var(--surface-muted)] px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-[var(--surface)] text-[var(--medical)]">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">{statusTitle}</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{statusLabel}</p>
            </div>
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          className="min-h-11 w-full rounded-md px-6 lg:w-auto"
          disabled={!isReady || isLoading}
          onClick={onSubmit}
        >
          {isLoading ? submittingLabel : submitLabel}
        </Button>
      </div>
    </section>
  );
}
