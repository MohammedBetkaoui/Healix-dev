import { Clock3, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";

type PendingVerificationNoticeProps = {
  buttonLabel: string;
  description: string;
  onEdit: () => void;
  title: string;
};

export function PendingVerificationNotice({
  buttonLabel,
  description,
  onEdit,
  title,
}: PendingVerificationNoticeProps) {
  return (
    <section className="verification-warning surface-section overflow-hidden bg-[var(--warning-soft)] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--warning-line)] bg-[var(--surface)] text-[var(--warning-ink)]">
            <Clock3 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="w-full rounded-md px-5 lg:w-auto"
          onClick={onEdit}
        >
          <PencilLine className="h-4 w-4" />
          {buttonLabel}
        </Button>
      </div>
    </section>
  );
}
