"use client";

import { Check } from "lucide-react";

import { type TranslationFunction } from "@/lib/i18n";

type WizardStepperProps = {
  current: number;
  /** Step label keys under aiAnalyses.wizard.steps. */
  steps: readonly string[];
  /** Go back to a completed step. */
  onSelect: (index: number) => void;
  t: TranslationFunction;
};

// Progress of the wizard. The state of each step is given by its marker
// (number or check), by aria-current on the current one, and in text for
// screen readers; color only reinforces it. Completed steps can be reopened.
export function WizardStepper({ current, onSelect, steps, t }: WizardStepperProps) {
  return (
    <nav aria-label={t("aiAnalyses.wizard.stepsLabel")}>
      <ol className="ai-stepper">
        {steps.map((step, index) => {
          const state = index < current ? "done" : index === current ? "current" : "upcoming";
          const content = (
            <>
              <span className="ai-step-marker" aria-hidden="true">
                {state === "done" ? <Check size={14} strokeWidth={2.2} /> : index + 1}
              </span>
              <span className="min-w-0 truncate">{t(`aiAnalyses.wizard.steps.${step}`)}</span>
              <span className="sr-only"> ({t(`aiAnalyses.wizard.stepStates.${state}`)})</span>
            </>
          );

          return (
            <li key={step} className="min-w-0">
              {state === "done" ? (
                <button type="button" className="ai-step w-full" data-state="done" onClick={() => onSelect(index)}>
                  {content}
                </button>
              ) : (
                <div className="ai-step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
