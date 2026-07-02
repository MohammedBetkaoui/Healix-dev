import { BadgeCheck, Clock3, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type VerificationStatus } from "@/features/verification/types/verification.types";
import { cn } from "@/lib/utils";

type VerificationStatusCardProps = {
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
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "REJECTED" || status === "SUSPENDED") {
    return "bg-red-50 text-red-700";
  }

  return isPending ? "bg-amber-50 text-amber-700" : "bg-cyan-50 text-cyan-700";
}

export function VerificationStatusCard({
  demoBadgeLabel,
  description,
  isPending,
  onStart,
  startLabel,
  status,
  statusLabel,
  statusTitle,
  title,
}: VerificationStatusCardProps) {
  return (
    <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
              getStatusTone(status, isPending),
            )}
          >
            {isPending ? <Clock3 className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-500">{statusTitle}</p>
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-700">
                {demoBadgeLabel}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
              {title}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
            <BadgeCheck className="h-4 w-4" />
            {statusLabel || status}
          </span>
          {startLabel && onStart ? (
            <Button className="rounded-full px-5" onClick={onStart}>
              {startLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
