"use client";

import { useId } from "react";

import {
  aiMagnifications,
  ECG_MAX_SAMPLING_RATE,
  ECG_MIN_SAMPLING_RATE,
  ecgSamplingRatePresets,
  ecgUnits,
  type AiMagnification,
  type AiPipelineId,
  type EcgUnit,
} from "@/features/ai-analyses/ai-analyses.types";
import { type TranslationFunction } from "@/lib/i18n";

export type EcgReadingInput = {
  isArchive: boolean;
  rateChoice: number | "other" | null;
  otherRate: string;
  samplingRate: number | null;
  unit: EcgUnit;
  onRateChoiceChange: (choice: number | "other") => void;
  onOtherRateChange: (value: string) => void;
  onUnitChange: (unit: EcgUnit) => void;
};

type AcquisitionSettingsProps = {
  pipelineId: AiPipelineId;
  ecg?: EcgReadingInput;
  magnification: AiMagnification | null;
  he40xConfirmed: boolean;
  shortAxisConfirmed: boolean;
  onMagnificationChange: (value: AiMagnification) => void;
  onHe40xChange: (confirmed: boolean) => void;
  onShortAxisChange: (confirmed: boolean) => void;
  t: TranslationFunction;
};

export function AcquisitionSettings({ pipelineId, ecg, magnification, he40xConfirmed, shortAxisConfirmed, onMagnificationChange, onHe40xChange, onShortAxisChange, t }: AcquisitionSettingsProps) {
  const id = useId();
  if (pipelineId === "brain") return null;

  return (
    <section className="ai-acquisition" aria-labelledby={`${id}-title`}>
      <div className="ai-wizard-subheading"><span aria-hidden="true">02</span><div><h3 id={`${id}-title`}>{t("aiAnalyses.wizard.workspace.acquisitionTitle")}</h3><p>{t("aiAnalyses.wizard.workspace.acquisitionHint")}</p></div></div>
      {pipelineId === "pathology-breast" ? (
        <fieldset aria-describedby={`${id}-magnification-hint`}>
          <legend>{t("aiAnalyses.wizard.reading.magnification.legend")}</legend>
          <p id={`${id}-magnification-hint`} className="ai-wizard-field-hint">{t("aiAnalyses.wizard.reading.magnification.hint")}</p>
          <div className="ai-acquisition-choices">
            {aiMagnifications.map((value) => (
              <label key={value} className="ai-acquisition-choice" data-selected={magnification === value}>
                <input type="radio" name={`${id}-magnification`} required checked={magnification === value} onChange={() => onMagnificationChange(value)} />
                <bdi dir="ltr">{t("aiAnalyses.wizard.reading.magnification.option", { value })}</bdi>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {pipelineId === "pathology-nuclei" ? (
        <div>
          <label className="ai-acquisition-confirmation" data-selected={he40xConfirmed}>
            <input type="checkbox" required checked={he40xConfirmed} aria-describedby={`${id}-he-hint`} onChange={(event) => onHe40xChange(event.target.checked)} />
            <span>{t("aiAnalyses.wizard.reading.he40x.label")}</span>
          </label>
          <p id={`${id}-he-hint`} className="ai-wizard-field-hint">{t("aiAnalyses.wizard.reading.he40x.hint")}</p>
        </div>
      ) : null}
      {pipelineId === "cardio-seg-mri" ? (
        <div>
          <label className="ai-acquisition-confirmation" data-selected={shortAxisConfirmed}>
            <input
              type="checkbox"
              required
              checked={shortAxisConfirmed}
              aria-describedby={`${id}-short-axis-hint`}
              onChange={(event) => onShortAxisChange(event.target.checked)}
            />
            <span>{t("aiAnalyses.wizard.reading.shortAxis.label")}</span>
          </label>
          <p id={`${id}-short-axis-hint`} className="ai-wizard-field-hint">
            {t("aiAnalyses.wizard.reading.shortAxis.hint")}
          </p>
        </div>
      ) : null}
      {pipelineId === "cardio-ecg" && ecg ? (
        ecg.isArchive ? <p className="ai-acquisition-archive">{t("aiAnalyses.wizard.ecg.archive")}</p> : (
          <div className="ai-acquisition-ecg">
            <fieldset aria-describedby={`${id}-rate-hint`}>
              <legend>{t("aiAnalyses.wizard.ecg.samplingRate.legend")}</legend>
              <p id={`${id}-rate-hint`} className="ai-wizard-field-hint">{t("aiAnalyses.wizard.ecg.samplingRate.hint")}</p>
              <div className="ai-acquisition-choices">
                {ecgSamplingRatePresets.map((value) => (
                  <label key={value} className="ai-acquisition-choice" data-selected={ecg.rateChoice === value}>
                    <input type="radio" name={`${id}-rate`} required checked={ecg.rateChoice === value} onChange={() => ecg.onRateChoiceChange(value)} />
                    <bdi dir="ltr">{t("aiAnalyses.wizard.ecg.samplingRate.option", { value })}</bdi>
                  </label>
                ))}
                <label className="ai-acquisition-choice" data-selected={ecg.rateChoice === "other"}>
                  <input type="radio" name={`${id}-rate`} checked={ecg.rateChoice === "other"} onChange={() => ecg.onRateChoiceChange("other")} />
                  {t("aiAnalyses.wizard.ecg.samplingRate.other")}
                </label>
              </div>
              {ecg.rateChoice === "other" ? (
                <div className="ai-acquisition-other-rate">
                  <label htmlFor={`${id}-other-rate`}>{t("aiAnalyses.wizard.ecg.samplingRate.otherLabel", { min: ECG_MIN_SAMPLING_RATE, max: ECG_MAX_SAMPLING_RATE })}</label>
                  <input id={`${id}-other-rate`} type="number" inputMode="numeric" min={ECG_MIN_SAMPLING_RATE} max={ECG_MAX_SAMPLING_RATE} step={1} dir="ltr" value={ecg.otherRate} aria-invalid={ecg.otherRate.trim() !== "" && ecg.samplingRate === null ? true : undefined} aria-describedby={ecg.otherRate.trim() !== "" && ecg.samplingRate === null ? `${id}-rate-error` : `${id}-rate-hint`} onChange={(event) => ecg.onOtherRateChange(event.target.value)} />
                  {ecg.otherRate.trim() !== "" && ecg.samplingRate === null ? <p id={`${id}-rate-error`} className="ai-acquisition-error">{t("aiAnalyses.wizard.ecg.samplingRate.invalid", { min: ECG_MIN_SAMPLING_RATE, max: ECG_MAX_SAMPLING_RATE })}</p> : null}
                </div>
              ) : null}
            </fieldset>
            <fieldset aria-describedby={`${id}-unit-hint`}>
              <legend>{t("aiAnalyses.wizard.ecg.unit.legend")}</legend>
              <p id={`${id}-unit-hint`} className="ai-wizard-field-hint">{t("aiAnalyses.wizard.ecg.unit.hint")}</p>
              <div className="ai-acquisition-choices">
                {ecgUnits.map((unit) => (
                  <label key={unit} className="ai-acquisition-choice" data-selected={ecg.unit === unit}>
                    <input type="radio" name={`${id}-unit`} checked={ecg.unit === unit} onChange={() => ecg.onUnitChange(unit)} />
                    {t(`aiAnalyses.wizard.ecg.unit.${unit}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )
      ) : null}
    </section>
  );
}
