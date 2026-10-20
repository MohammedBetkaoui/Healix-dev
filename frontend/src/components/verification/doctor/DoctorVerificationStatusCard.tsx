import { BadgeCheck, Clock3, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type VerificationStatus } from "@/features/verification/types/doctor-verification.types";
import { cn } from "@/lib/utils";

type DoctorVerificationStatusCardProps = {
  modeLabel: string;
  description: string;
  isPending: boolean;
  onStart?: () => void;
  startLabel?: string;
  status: VerificationStatus;
  statusLabel: string;
  statusTitle: string;
  title: string;
};

function getStatusTone(status: VerificationStatus, isPending: boolean) {
  if (status === "VERIFIED") {
    return "bg-[var(--success-soft)] text-[var(--success-ink)]";
  }

  if (status === "REJECTED" || status === "SUSPENDED") {
    return "bg-[var(--danger-soft)] text-[var(--danger-ink)]";
  }

  return isPending ? "bg-[var(--warning-soft)] text-[var(--warning-ink)]" : "bg-secondary text-[var(--accent-dark)]";
}

export function DoctorVerificationStatusCard({
  modeLabel,
  description,
  isPending,
  onStart,
  startLabel,
  status,
  statusLabel,
  statusTitle,
  title,
}: DoctorVerificationStatusCardProps) {
  return (
    <section className="surface-section surface-clinical overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-current/15",
              getStatusTone(status, isPending),
            )}
          >
            {isPending ? (
              <Clock3 className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{statusTitle}</p>
              <span className="rounded-md border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-semibold text-[var(--accent-dark)]">
                {modeLabel}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-row flex-wrap items-center gap-3 md:flex-col md:items-end">
          <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-border bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <BadgeCheck className="h-4 w-4" />
            {statusLabel || status}
          </span>
          {startLabel && onStart ? (
            <Button type="button" className="min-h-10 rounded-md px-5" onClick={onStart}>
              {startLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
