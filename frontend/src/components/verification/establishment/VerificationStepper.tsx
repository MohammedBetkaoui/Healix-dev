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
    <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
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
                    "absolute top-5 hidden h-px bg-slate-200 md:block",
                    direction === "rtl" ? "left-0 right-12" : "left-12 right-0",
                  )}
                  aria-hidden="true"
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                  isCompleted
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : isActive
                      ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                      : "border-slate-200 bg-white text-slate-400",
                )}
              >
                {stepNumber}
              </span>
              <div>
                <p
                  className={cn(
                    "text-sm font-medium",
                    isActive || isCompleted ? "text-slate-950" : "text-slate-500",
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
