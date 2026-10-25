"use client";

import { Lock, RefreshCw, RotateCcw } from "lucide-react";
import { useId } from "react";

import { type AiAnalysisRun, type AiVolumetry } from "@/features/ai-analyses/ai-analyses.types";
import { useCorrectVolumetry } from "@/features/ai-analyses/hooks/use-correct-volumetry";
import {
  draftChanges,
  draftFromVolumetry,
  getCorrectionErrorKey,
  HEIGHT_RANGE_CM,
  phaseNumber,
  sliceNumber,
  toAutomaticPayload,
  toCorrectionPayload,
  toggleExcludedSlice,
  validateVolumetryDraft,
  WEIGHT_RANGE_KG,
  type VolumetryDraft,
} from "@/features/ai-analyses/volumetry";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type VolumeCorrectionFormProps = {
  draft: VolumetryDraft;
  locale: Locale;
  onDraftChange: (draft: VolumetryDraft) => void;
  patientId: string;
  run: AiAnalysisRun;
  t: TranslationFunction;
  volumetry: AiVolumetry;
};

const fieldClass =
  "min-h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)]";

/**
 * The physician's changes to the measures before the decision: the end-diastole and end-systole phases, the
 * slices counted, the height and the weight (for the body surface area). Saving recalculates the measures
 * on the server from the areas it already holds: the model is not run again.
 */
export function VolumeCorrectionForm({ draft, locale, onDraftChange, patientId, run, t, volumetry }: VolumeCorrectionFormProps) {
  const id = useId();
  const correct = useCorrectVolumetry(patientId, run.id);
  const decided = run.decisionStatus !== null;
  const errors = validateVolumetryDraft(draft, volumetry);
  const changes = draftChanges(draft, volumetry);
  const payload = toCorrectionPayload(draft, volumetry);
  const pendingChanges = (["phases", "slices", "body"] as const).filter((key) => changes[key]);
  const intl = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const decimal = new Intl.NumberFormat(intl, { maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat(intl);
  const lastSlice = volumetry.slices.length - 1;

  if (decided) {
    return (
      <p className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
        <Lock size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        {t("aiAnalyses.run.volumetry.correction.decided")}
      </p>
    );
  }

  const send = (body: NonNullable<typeof payload>) => correct.mutate(body);
  const phaseOptions = Array.from({ length: volumetry.phases }, (_, phase) => (
    <option key={phase} value={phase}>
      {t("aiAnalyses.run.volumetry.correction.phaseOption", { phase: phaseNumber(phase) })}
    </option>
  ));

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (payload) send(payload);
      }}
    >
      <p className="text-xs leading-5 text-[var(--text-secondary)]">{t("aiAnalyses.run.volumetry.correction.hint")}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-ed`} className="text-sm font-medium text-[var(--text-primary)]">
            {t("aiAnalyses.run.volumetry.correction.edLabel")}
          </label>
          <select
            id={`${id}-ed`}
            className={cn(fieldClass, "mt-1")}
            disabled={correct.isPending}
            value={draft.edPhase}
            onChange={(event) => onDraftChange({ ...draft, edPhase: Number(event.target.value) })}
          >
            {phaseOptions}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-es`} className="text-sm font-medium text-[var(--text-primary)]">
            {t("aiAnalyses.run.volumetry.correction.esLabel")}
          </label>
          <select
            id={`${id}-es`}
            className={cn(fieldClass, "mt-1")}
            disabled={correct.isPending}
            value={draft.esPhase}
            onChange={(event) => onDraftChange({ ...draft, esPhase: Number(event.target.value) })}
          >
            {phaseOptions}
          </select>
        </div>
      </div>

      <fieldset aria-describedby={`${id}-slices-hint`} className="min-w-0" disabled={correct.isPending}>
        <legend className="text-sm font-semibold text-[var(--text-primary)]">{t("aiAnalyses.run.volumetry.correction.slicesTitle")}</legend>
        <p id={`${id}-slices-hint`} className="mt-1 text-xs text-[var(--text-secondary)]">
          {t("aiAnalyses.run.volumetry.correction.slicesHint")}
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <caption className="sr-only">{t("aiAnalyses.run.volumetry.correction.slicesCaption")}</caption>
            <thead>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                <th scope="col" className="pb-1 pe-3 text-start font-medium">{t("aiAnalyses.run.volumetry.correction.slice")}</th>
                <th scope="col" className="pb-1 pe-3 text-end font-medium">{t("aiAnalyses.run.volumetry.correction.position")}</th>
                <th scope="col" className="pb-1 pe-3 text-end font-medium">{t("aiAnalyses.run.volumetry.correction.areaEd")}</th>
                <th scope="col" className="pb-1 pe-3 text-end font-medium">{t("aiAnalyses.run.volumetry.correction.areaEs")}</th>
                <th scope="col" className="pb-1 text-center font-medium">{t("aiAnalyses.run.volumetry.correction.included")}</th>
              </tr>
            </thead>
            <tbody>
              {volumetry.slices.map((slice, index) => {
                const excluded = draft.excludedSlices.includes(index);
                const edArea = volumetry.areas.ed[index]?.LV;
                const esArea = volumetry.areas.es[index]?.LV;
                return (
                  <tr key={index} className={cn("border-b border-[var(--line-soft)]", excluded && "text-[var(--text-secondary)] line-through")}>
                    <th scope="row" className="py-1.5 pe-3 text-start font-normal">
                      {sliceNumber(index)}
                      {index === 0 ? <span className="ms-2 text-xs no-underline">({t("aiAnalyses.run.volumetry.correction.base")})</span> : null}
                      {index === lastSlice && lastSlice > 0 ? (
                        <span className="ms-2 text-xs">({t("aiAnalyses.run.volumetry.correction.apex")})</span>
                      ) : null}
                    </th>
                    <td className="py-1.5 pe-3 text-end font-[family-name:var(--font-auth-mono)] tabular-nums">
                      <bdi dir="ltr">{t("aiAnalyses.run.volumetry.correction.positionValue", { value: decimal.format(slice.positionMm) })}</bdi>
                    </td>
                    <td className="py-1.5 pe-3 text-end font-[family-name:var(--font-auth-mono)] tabular-nums">
                      <bdi dir="ltr">{edArea === undefined ? "—" : t("aiAnalyses.run.volumetry.correction.areaValue", { value: integer.format(Math.round(edArea)) })}</bdi>
                    </td>
                    <td className="py-1.5 pe-3 text-end font-[family-name:var(--font-auth-mono)] tabular-nums">
                      <bdi dir="ltr">{esArea === undefined ? "—" : t("aiAnalyses.run.volumetry.correction.areaValue", { value: integer.format(Math.round(esArea)) })}</bdi>
                    </td>
                    <td className="py-1.5 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--accent)]"
                        aria-label={t("aiAnalyses.run.volumetry.correction.includeSlice", { slice: sliceNumber(index) })}
                        checked={!excluded}
                        onChange={() => onDraftChange(toggleExcludedSlice(draft, index))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {errors.slices ? (
          <p role="alert" className="mt-2 text-xs text-[var(--danger-ink)]">
            {t("aiAnalyses.run.volumetry.correction.validation.slices")}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="min-w-0" disabled={correct.isPending} aria-describedby={`${id}-body-hint`}>
        <legend className="text-sm font-semibold text-[var(--text-primary)]">{t("aiAnalyses.run.volumetry.correction.bodyTitle")}</legend>
        <p id={`${id}-body-hint`} className="mt-1 text-xs text-[var(--text-secondary)]">
          {t("aiAnalyses.run.volumetry.correction.bodyHint")}
        </p>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-height`} className="text-sm text-[var(--text-primary)]">
              {t("aiAnalyses.run.volumetry.correction.height")}
            </label>
            <input
              id={`${id}-height`}
              className={cn(fieldClass, "mt-1")}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={errors.body === "invalidHeight" || errors.body === "both" ? true : undefined}
              value={draft.heightCm}
              onChange={(event) => onDraftChange({ ...draft, heightCm: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${id}-weight`} className="text-sm text-[var(--text-primary)]">
              {t("aiAnalyses.run.volumetry.correction.weight")}
            </label>
            <input
              id={`${id}-weight`}
              className={cn(fieldClass, "mt-1")}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={errors.body === "invalidWeight" || errors.body === "both" ? true : undefined}
              value={draft.weightKg}
              onChange={(event) => onDraftChange({ ...draft, weightKg: event.target.value })}
            />
          </div>
        </div>
        {errors.body ? (
          <p role="alert" className="mt-2 text-xs text-[var(--danger-ink)]">
            {errors.body === "both"
              ? t("aiAnalyses.run.volumetry.correction.validation.bodyBoth")
              : errors.body === "invalidHeight"
                ? t("aiAnalyses.run.volumetry.correction.validation.invalidHeight", { max: HEIGHT_RANGE_CM.max, min: HEIGHT_RANGE_CM.min })
                : t("aiAnalyses.run.volumetry.correction.validation.invalidWeight", { max: WEIGHT_RANGE_KG.max, min: WEIGHT_RANGE_KG.min })}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={!payload || correct.isPending}>
          {correct.isPending ? <RefreshCw size={16} className="animate-spin" aria-hidden="true" /> : null}
          {correct.isPending ? t("aiAnalyses.run.volumetry.correction.saving") : t("aiAnalyses.run.volumetry.correction.save")}
        </button>
        <button
          type="button"
          className="clinical-button disabled:cursor-not-allowed disabled:opacity-60"
          disabled={correct.isPending || errors.slices !== undefined}
          onClick={() => send(toAutomaticPayload(draft))}
        >
          {t("aiAnalyses.run.volumetry.correction.automatic")}
        </button>
        <button
          type="button"
          className="clinical-button disabled:cursor-not-allowed disabled:opacity-60"
          disabled={correct.isPending || (pendingChanges.length === 0)}
          onClick={() => onDraftChange(draftFromVolumetry(volumetry))}
        >
          <RotateCcw size={15} aria-hidden="true" />
          {t("aiAnalyses.run.volumetry.correction.reset")}
        </button>
      </div>

      <div aria-live="polite" className="min-h-5 text-xs">
        {correct.isError ? (
          <p role="alert" className="text-[var(--danger-ink)]">
            {t(`aiAnalyses.run.volumetry.errors.${getCorrectionErrorKey(correct.error)}`)}
          </p>
        ) : correct.isSuccess && pendingChanges.length === 0 ? (
          <p className="text-[var(--success-ink)]">{t("aiAnalyses.run.volumetry.correction.saved")}</p>
        ) : pendingChanges.length > 0 ? (
          <p className="text-[var(--text-secondary)]">
            {t("aiAnalyses.run.volumetry.correction.pending", {
              changes: pendingChanges.map((key) => t(`aiAnalyses.run.volumetry.correction.changes.${key}`)).join(", "),
            })}
          </p>
        ) : null}
      </div>
    </form>
  );
}
