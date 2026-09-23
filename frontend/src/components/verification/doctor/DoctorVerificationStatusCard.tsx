import { BadgeCheck, Clock3, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type VerificationStatus } from "@/features/verification/types/doctor-verification.types";
import { cn } from "@/lib/utils";

type DoctorVerificationStatusCardProps = {
  demoBadgeLabel: string;
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
  demoBadgeLabel,
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
    <section className="rounded-xl border border-border/80 bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
              getStatusTone(status, isPending),
            )}
          >
            {isPending ? (
              <Clock3 className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-muted-foreground">{statusTitle}</p>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-[var(--accent-dark)]">
                {demoBadgeLabel}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <BadgeCheck className="h-4 w-4" />
            {statusLabel || status}
          </span>
          {startLabel && onStart ? (
            <Button type="button" className="rounded-full px-5" onClick={onStart}>
              {startLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
