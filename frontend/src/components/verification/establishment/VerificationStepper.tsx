import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type VerificationStepperProps = {
  activeStep: number;
  direction: "ltr" | "rtl";
  steps: string[];
};

export function VerificationStepper({
  activeStep,
  direction,
  steps,
}: VerificationStepperProps) {
  return (
    <section className="surface-section overflow-hidden" aria-label={steps.join(", ")}>
      <div
        className={cn(
          "grid gap-px bg-[var(--border)] sm:grid-cols-2 lg:grid-cols-4",
          direction === "rtl" && "text-right",
        )}
      >
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === activeStep;
          const isCompleted = stepNumber < activeStep;

          return (
            <div
              key={step}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "relative flex min-h-20 items-center gap-3 bg-[var(--surface)] px-4 py-3",
                isActive && "bg-[var(--medical-soft)]",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-xs font-semibold",
                  isCompleted
                    ? "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]"
                    : isActive
                      ? "border-[var(--medical)] bg-[var(--surface)] text-[var(--medical)]"
                      : "border-border bg-[var(--surface-muted)] text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : stepNumber}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {String(stepNumber).padStart(2, "0")}
                </p>
                <p
                  className={cn(
                    "mt-1 text-sm font-medium leading-5",
                    isActive || isCompleted ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
