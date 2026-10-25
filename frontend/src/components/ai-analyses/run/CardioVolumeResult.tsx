"use client";

import { Info, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";

import { type AiAnalysisRun, type AiVolumetry } from "@/features/ai-analyses/ai-analyses.types";
import { isolate } from "@/features/ai-analyses/evaluation-presentation";
import { useCardioVolumeEvaluation } from "@/features/ai-analyses/hooks/use-ai-analysis-run";
import {
  draftFromVolumetry,
  LVEF_CLASS_SOURCE,
  phaseNumber,
  sliceNumber,
  visibleVolumeRows,
  volumetryNotices,
} from "@/features/ai-analyses/volumetry";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { VolumeMetricsTable } from "../VolumeMetricsTable";
import { VolumeCorrectionForm } from "./VolumeCorrectionForm";
import { VolumeCurveChart } from "./VolumeCurveChart";
import { VolumeImages } from "./VolumeImages";

type CardioVolumeResultProps = {
  locale: Locale;
  patientId: string;
  run: AiAnalysisRun;
  t: TranslationFunction;
};

const classTones = {
  mildlyReduced: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  preserved: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  reduced: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
} as const;

function Section({ children, id, title }: { children: ReactNode; id: string; title: string }) {
  return (
    <section aria-labelledby={id} className="surface-section min-w-0 p-5">
      <h2 id={id} className="text-base font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * A cardiac cine volumetry: the ejection fraction and its ESC class, the measures in force next to the
 * model's proposal, the volume curve, the correction of the phases and slices, the segmented slices,
 * and the figures measured on the test patients. A measurement aid, never a diagnosis.
 */
export function CardioVolumeResult({ locale, patientId, run, t }: CardioVolumeResultProps) {
  const volumetry = run.volumetry ?? null;

  if (!volumetry) {
    return (
      <section className="surface-section p-5 text-sm text-[var(--text-secondary)]">
        {t("aiAnalyses.run.none")}
      </section>
    );
  }
  return <CardioVolumeContent locale={locale} patientId={patientId} run={run} t={t} volumetry={volumetry} />;
}

function CardioVolumeContent({
  locale,
  patientId,
  run,
  t,
  volumetry,
}: CardioVolumeResultProps & { volumetry: AiVolumetry }) {
  // The form restarts from what is in force each time the server recalculates.
  const formKey = `${volumetry.corrected?.correctedAt ?? "model"}`;
  const [draft, setDraft] = useState(() => draftFromVolumetry(volumetry));
  const [loadedKey, setLoadedKey] = useState(formKey);
  if (loadedKey !== formKey) {
    setLoadedKey(formKey);
    setDraft(draftFromVolumetry(volumetry));
  }

  const evaluation = useCardioVolumeEvaluation(run.segmentationWeightsSha256);
  const evaluationData = evaluation.data;
  const intl = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const number = (digits: number) => new Intl.NumberFormat(intl, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const { effective, auto, modified } = volumetry;
  const measures = effective.measures;
  const indexed = measures.indexed !== null;
  const fraction = measures.lv.efPercent;
  const lvefClass = measures.lvefClass;
  const rows = visibleVolumeRows(measures);
  const notices = volumetryNotices(volumetry);
  const pixelRow = number(2).format(volumetry.pixelSpacingMm[0]);
  const pixelColumn = number(2).format(volumetry.pixelSpacingMm[1]);

  const withUnit = (value: number | null | undefined, digits: number, unitKey: string) =>
    value === null || value === undefined ? "—" : `${number(digits).format(value)} ${t(`aiAnalyses.run.volumetry.units.${unitKey}`)}`;

  const bsaSource =
    effective.bsaSource === "manual"
      ? t("aiAnalyses.run.volumetry.acquisition.bsaManual")
      : t("aiAnalyses.run.volumetry.acquisition.bsaDicom");

  return (
    <div className="ai-result space-y-5" data-module="cardiology">
      <section aria-labelledby="ai-run-volumetry-summary" className="surface-section border-t-2 border-t-[color:var(--ai-module-color)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="ai-run-volumetry-summary" className="text-base font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.volumetry.title")}
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--text-secondary)]">
              {t("aiAnalyses.run.volumetry.subtitle", { phases: volumetry.phases, slices: volumetry.slices.length })}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[.68rem] font-semibold",
              modified
                ? "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]"
                : "border-[var(--ai-line)] bg-[var(--ai-soft)] text-[var(--ai)]",
            )}
          >
            {modified ? t("aiAnalyses.run.volumetry.summary.corrected") : t("aiAnalyses.run.volumetry.summary.byModel")}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <p className="text-xs font-medium text-[var(--text-secondary)]">{t("aiAnalyses.run.volumetry.summary.lvef")}</p>
            <p className="mt-0.5 text-4xl font-semibold leading-none text-[var(--text-primary)]" data-lvef="true">
              {fraction === null ? (
                t("aiAnalyses.run.volumetry.summary.notMeasurable")
              ) : (
                <bdi dir="ltr">{withUnit(fraction, 0, "percent")}</bdi>
              )}
            </p>
            {modified ? (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {t("aiAnalyses.run.volumetry.summary.proposal", { value: isolate(withUnit(auto.measures.lv.efPercent, 0, "percent")) })}
              </p>
            ) : null}
          </div>
          {lvefClass ? (
            <p
              className={cn("rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-medium", classTones[lvefClass])}
              data-lvef-class={lvefClass}
            >
              {t("aiAnalyses.run.volumetry.classLine", { class: t(`aiAnalyses.run.volumetry.classes.${lvefClass}`) })}
            </p>
          ) : null}
        </div>
        {lvefClass ? (
          <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--text-secondary)]">
            {t("aiAnalyses.run.volumetry.classSource", {
              authors: LVEF_CLASS_SOURCE.authors,
              doi: LVEF_CLASS_SOURCE.doi,
              reference: LVEF_CLASS_SOURCE.reference,
            })}
          </p>
        ) : null}
        <p className="mt-3 flex items-start gap-2 text-xs font-medium text-[var(--text-primary)]">
          <Info size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t("aiAnalyses.run.volumetry.aid")}
        </p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.8fr)]">
        <Section id="ai-run-volumetry-table" title={t("aiAnalyses.run.volumetry.table.caption")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <caption className="sr-only">{t("aiAnalyses.run.volumetry.table.caption")}</caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                  <th scope="col" className="pb-1 pe-3 text-start font-medium">{t("aiAnalyses.run.volumetry.table.measure")}</th>
                  <th scope="col" className="pb-1 pe-3 text-end font-medium">{t("aiAnalyses.run.volumetry.table.retained")}</th>
                  {indexed ? <th scope="col" className="pb-1 pe-3 text-end font-medium">{t("aiAnalyses.run.volumetry.table.indexed")}</th> : null}
                  {modified ? <th scope="col" className="pb-1 text-end font-medium">{t("aiAnalyses.run.volumetry.table.proposal")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className={cn("border-b border-[var(--line-soft)]", row.key === "lvEf" && "font-semibold")}>
                    <th scope="row" className="py-2 pe-3 text-start font-normal">
                      {t(`aiAnalyses.run.volumetry.rows.${row.key}`)}
                    </th>
                    <td className="py-2 pe-3 text-end font-[family-name:var(--font-auth-mono)] tabular-nums">
                      <bdi dir="ltr">{withUnit(row.of(measures), row.digits, row.unit)}</bdi>
                    </td>
                    {indexed ? (
                      <td className="py-2 pe-3 text-end font-[family-name:var(--font-auth-mono)] tabular-nums">
                        <bdi dir="ltr">{row.indexed ? withUnit(row.indexed.of(measures), row.indexed.digits, row.indexed.unit) : "—"}</bdi>
                      </td>
                    ) : null}
                    {modified ? (
                      <td className="py-2 text-end font-[family-name:var(--font-auth-mono)] tabular-nums text-[var(--text-secondary)]">
                        <bdi dir="ltr">{withUnit(row.of(auto.measures), row.digits, row.unit)}</bdi>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{t("aiAnalyses.run.volumetry.table.rounded")}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
            {t("aiAnalyses.run.volumetry.phases.inForce", {
              ed: phaseNumber(effective.edPhase),
              es: phaseNumber(effective.esPhase),
              total: volumetry.phases,
            })}{" "}
            {modified
              ? t("aiAnalyses.run.volumetry.phases.proposed", { ed: phaseNumber(auto.edPhase), es: phaseNumber(auto.esPhase) })
              : t("aiAnalyses.run.volumetry.phases.byModel")}
            {effective.excludedSlices.length > 0 ? (
              <>
                {" "}
                {t("aiAnalyses.run.volumetry.phases.excluded", { slices: effective.excludedSlices.map(sliceNumber).join(", ") })}
              </>
            ) : null}
          </p>
        </Section>

        <Section id="ai-run-volumetry-acquisition" title={t("aiAnalyses.run.volumetry.acquisition.title")}>
          <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.volumetry.acquisition.step")}</dt>
            <dd>
              <bdi dir="ltr">{t("aiAnalyses.run.volumetry.acquisition.stepValue", { value: number(2).format(volumetry.sliceGapMm) })}</bdi>
            </dd>
            <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.volumetry.acquisition.pixels")}</dt>
            <dd>
              <bdi dir="ltr">{t("aiAnalyses.run.volumetry.acquisition.pixelsValue", { column: pixelColumn, row: pixelRow })}</bdi>
            </dd>
            <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.volumetry.acquisition.bsa")}</dt>
            <dd>
              {effective.bsaM2 === null
                ? t("aiAnalyses.run.volumetry.acquisition.bsaNone")
                : t("aiAnalyses.run.volumetry.acquisition.bsaValue", { source: bsaSource, value: isolate(number(2).format(effective.bsaM2)) })}
            </dd>
            <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.volumetry.acquisition.heartRate")}</dt>
            <dd>
              {volumetry.heartRateBpm === null
                ? t("aiAnalyses.run.volumetry.acquisition.heartRateNone")
                : t("aiAnalyses.run.volumetry.acquisition.heartRateValue", { value: isolate(number(0).format(volumetry.heartRateBpm)) })}
            </dd>
          </dl>
          {notices.length > 0 ? (
            <div role="note" className="mt-4 rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-3 py-2.5 text-xs leading-5 text-[var(--warning-ink)]">
              <p className="flex items-center gap-2 font-semibold">
                <TriangleAlert size={14} aria-hidden="true" />
                {t("aiAnalyses.run.volumetry.notices.title")}
              </p>
              <ul className="mt-1 list-disc space-y-1 ps-5">
                {notices.map((notice, index) => (
                  <li key={`${notice.key}-${index}`}>{t(`aiAnalyses.run.volumetry.notices.${notice.key}`, notice.params)}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      </div>

      <Section id="ai-run-volumetry-curve" title={t("aiAnalyses.run.volumetry.curve.title")}>
        <p className="mb-3 max-w-3xl text-xs leading-5 text-[var(--text-secondary)]">{t("aiAnalyses.run.volumetry.curve.hint")}</p>
        <VolumeCurveChart
          curve={effective.lvVolumeCurveMl}
          edPhase={draft.edPhase}
          esPhase={draft.esPhase}
          locale={locale}
          proposed={{ edPhase: auto.edPhase, esPhase: auto.esPhase }}
          t={t}
        />
        <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{t("aiAnalyses.run.volumetry.curve.modelMarkers")}</p>
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section id="ai-run-volumetry-correction" title={t("aiAnalyses.run.volumetry.correction.title")}>
          <VolumeCorrectionForm
            draft={draft}
            locale={locale}
            onDraftChange={setDraft}
            patientId={patientId}
            run={run}
            t={t}
            volumetry={volumetry}
          />
        </Section>
        <Section id="ai-run-volumetry-images" title={t("aiAnalyses.run.volumetry.images.title")}>
          <VolumeImages patientId={patientId} run={run} t={t} volumetry={volumetry} />
        </Section>
      </div>

      <Section id="ai-run-volumetry-metrics" title={t("aiAnalyses.run.volumetry.metrics.title")}>
        <VolumeMetricsTable evaluation={evaluationData} loading={evaluation.isLoading} locale={locale} t={t} />
        <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{t("aiAnalyses.run.volumetry.aid")}</p>
      </Section>
    </div>
  );
}
