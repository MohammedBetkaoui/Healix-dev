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
    <section className="surface-section overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{progressLabel}</p>
        <p className="tabular-nums text-sm font-semibold text-[var(--medical)]">{progressValue}%</p>
      </div>
      <div
        className="verification-progress-track mx-5 mt-4"
        role="progressbar"
        aria-label={progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressValue}
      >
        <span
          style={{ width: `${progressValue}%` }}
        />
      </div>
      <div
        className={cn(
          "grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
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
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "flex min-h-20 items-start gap-3 rounded-md border p-3 text-start transition-colors",
                isActive
                  ? "border-[var(--medical)] bg-[var(--medical-soft)] text-foreground"
                  : isCompleted
                    ? "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]"
                    : "border-border bg-[var(--surface)] text-muted-foreground hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]",
              )}
              onClick={() => onStepClick(index)}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
                  isCompleted
                    ? "border-[var(--success-line)] bg-[var(--surface)] text-[var(--success-ink)]"
                    : isActive
                      ? "border-[var(--medical)] bg-[var(--surface)] text-[var(--medical)]"
                      : "border-border bg-[var(--surface-muted)] text-muted-foreground",
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
