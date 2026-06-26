import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type Direction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type DoctorVerificationNavigationProps = {
  direction: Direction;
  isFirstStep: boolean;
  isLastStep: boolean;
  isSubmitting: boolean;
  nextLabel: string;
  onNext: () => void;
  onPrevious: () => void;
  onSubmit: () => void;
  previousLabel: string;
  submitDisabled: boolean;
  submitLabel: string;
  submittingLabel: string;
};

export function DoctorVerificationNavigation({
  direction,
  isFirstStep,
  isLastStep,
  isSubmitting,
  nextLabel,
  onNext,
  onPrevious,
  onSubmit,
  previousLabel,
  submitDisabled,
  submitLabel,
  submittingLabel,
}: DoctorVerificationNavigationProps) {
  const PreviousIcon = direction === "rtl" ? ArrowRight : ArrowLeft;
  const NextIcon = direction === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <section className="sticky bottom-4 z-10 rounded-[24px] border border-slate-200/80 bg-white/92 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur">
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={isFirstStep}
          onClick={onPrevious}
        >
          <PreviousIcon className="h-4 w-4" />
          {previousLabel}
        </Button>
        {isLastStep ? (
          <Button
            type="button"
            className="rounded-full px-6"
            disabled={submitDisabled || isSubmitting}
            onClick={onSubmit}
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                {submittingLabel}
              </span>
            ) : (
              submitLabel
            )}
          </Button>
        ) : (
          <Button type="button" className="rounded-full px-6" onClick={onNext}>
            {nextLabel}
            <NextIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
    </section>
  );
}
