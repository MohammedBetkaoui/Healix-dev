import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { type Direction } from "@/lib/i18n";
import { type DoctorVerificationStep } from "@/features/verification/types/doctor-verification.types";

type DoctorVerificationStepperProps = {
  activeStepIndex: number;
  completedStepIds: Set<string>;
  direction: Direction;
  onStepClick: (index: number) => void;
  progressLabel: string;
  progressValue: number;
  steps: DoctorVerificationStep[];
  t: (key: string) => string;
};

export function DoctorVerificationStepper({
  activeStepIndex,
  completedStepIds,
  direction,
  onStepClick,
  progressLabel,
  progressValue,
  steps,
  t,
}: DoctorVerificationStepperProps) {
  return (
    <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{progressLabel}</p>
        <p className="text-sm font-semibold text-[var(--accent-dark)]">{progressValue}%</p>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progressValue}%` }}
        />
      </div>
      <div
        className={cn(
          "mt-5 grid gap-3 lg:grid-cols-6",
          direction === "rtl" && "text-right",
        )}
      >
        {steps.map((step, index) => {
          const isActive = index === activeStepIndex;
          const isCompleted = completedStepIds.has(step.id);

          return (
            <button
              key={step.id}
              type="button"
              className={cn(
                "flex min-h-20 items-start gap-3 rounded-xl border p-3 text-start transition",
                isActive
                  ? "border-[var(--accent-line)] bg-secondary text-[var(--accent-dark)]"
                  : isCompleted
                    ? "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
              onClick={() => onStepClick(index)}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  isCompleted
                    ? "border-[var(--success-line)] bg-card text-[var(--success-ink)]"
                    : isActive
                      ? "border-[var(--accent-line)] bg-card text-[var(--accent-dark)]"
                      : "border-border bg-muted text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span>
                <span className="block text-sm font-semibold">
                  {t(step.shortLabelKey)}
                </span>
                <span className="mt-1 block text-xs opacity-75">
                  {isCompleted
                    ? t("doctorVerification.steps.completed")
                    : t(step.labelKey)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
