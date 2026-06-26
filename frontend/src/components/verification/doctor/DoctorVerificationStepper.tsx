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
    <section className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.04)]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-950">{progressLabel}</p>
        <p className="text-sm font-semibold text-cyan-700">{progressValue}%</p>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-cyan-500 transition-all"
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
                "flex min-h-20 items-start gap-3 rounded-[18px] border p-3 text-start transition",
                isActive
                  ? "border-cyan-200 bg-cyan-50 text-cyan-900"
                  : isCompleted
                    ? "border-emerald-100 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
              )}
              onClick={() => onStepClick(index)}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  isCompleted
                    ? "border-emerald-200 bg-white text-emerald-700"
                    : isActive
                      ? "border-cyan-200 bg-white text-cyan-700"
                      : "border-slate-200 bg-slate-50 text-slate-400",
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
