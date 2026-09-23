import { CheckCircle2, Files, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";

type VerificationSubmitPanelProps = {
  completedInfoCount: number;
  documentsAddedCount: number;
  infoTotalCount: number;
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
  infoTotalCount,
  isLoading,
  isReady,
  onSubmit,
  statusLabel,
  submitLabel,
  submittingLabel,
  title,
}: VerificationSubmitPanelProps) {
  return (
    <section className="rounded-xl border border-border/80 bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/70 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm">
              <FileText className="h-4 w-4" />
            </span>
            <p className="mt-4 text-sm text-muted-foreground">{title}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {completedInfoCount}/{infoTotalCount}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/70 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm">
              <Files className="h-4 w-4" />
            </span>
            <p className="mt-4 text-sm text-muted-foreground">Documents</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {documentsAddedCount}/5
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/70 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <p className="mt-4 text-sm text-muted-foreground">Statut</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{statusLabel}</p>
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
