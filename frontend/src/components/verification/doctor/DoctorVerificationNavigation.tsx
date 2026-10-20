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
    <section className="surface-section sticky bottom-4 z-10 bg-[var(--surface)]/95 p-4 backdrop-blur">
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <Button
          type="button"
          variant="outline"
          className="min-h-10 w-full rounded-md sm:w-auto"
          disabled={isFirstStep}
          onClick={onPrevious}
        >
          <PreviousIcon className="h-4 w-4" />
          {previousLabel}
        </Button>
        {isLastStep ? (
          <Button
            type="button"
            className="min-h-10 w-full rounded-md px-6 sm:w-auto"
            disabled={submitDisabled || isSubmitting}
            onClick={onSubmit}
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-card/40 border-t-white" />
                {submittingLabel}
              </span>
            ) : (
              submitLabel
            )}
          </Button>
        ) : (
          <Button type="button" className="min-h-10 w-full rounded-md px-6 sm:w-auto" onClick={onNext}>
            {nextLabel}
            <NextIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
    </section>
  );
}
