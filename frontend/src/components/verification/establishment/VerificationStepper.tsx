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
    <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
      <div
        className={cn(
          "grid gap-4 md:grid-cols-4",
          direction === "rtl" && "text-right",
        )}
      >
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isActive = stepNumber === activeStep;
          const isCompleted = stepNumber < activeStep;

          return (
            <div key={step} className="relative flex items-center gap-3">
              {index < steps.length - 1 ? (
                <span
                  className={cn(
                    "absolute top-5 hidden h-px bg-border md:block",
                    direction === "rtl" ? "left-0 right-12" : "left-12 right-0",
                  )}
                  aria-hidden="true"
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                  isCompleted
                    ? "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]"
                    : isActive
                      ? "border-[var(--accent-line)] bg-secondary text-[var(--accent-dark)]"
                      : "border-border bg-card text-muted-foreground",
                )}
              >
                {stepNumber}
              </span>
              <div>
                <p
                  className={cn(
                    "text-sm font-medium",
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
