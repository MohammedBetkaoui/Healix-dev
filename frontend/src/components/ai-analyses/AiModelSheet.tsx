"use client";

import { X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { useCardioVolumeEvaluation } from "@/features/ai-analyses/hooks/use-ai-analysis-run";
import { useAiModelsStatus } from "@/features/ai-analyses/hooks/use-ai-models-status";
import {
  aiMagnifications,
  nucleusTypes,
  type AiConfusionMatrix,
  type AiModel,
} from "@/features/ai-analyses/ai-analyses.types";
import { formatEvaluationDate, formatInterval, isolate } from "@/features/ai-analyses/evaluation-presentation";
import {
  datasetLabelParams,
  formatAiMetricInterval,
  formatAiMetricValue,
  limitationParams,
  testPatientsParams,
} from "@/features/ai-analyses/format-ai-metric";
import {
  breakhisEvaluation,
  pannukeEvaluation,
  type PannukeEvaluation,
} from "@/features/ai-analyses/pathology-evaluation";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";

import { aiModelStatusTone } from "./AiModelCard";
import { VolumeMetricsTable } from "./VolumeMetricsTable";

// The model of the cardiac MRI chains: its volumetry is measured on the service itself.
const CARDIO_SEG_ID = "cardio-seg-acdc-unet-effb4";

const tabbableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type AiModelSheetProps = {
  locale: Locale;
  model: AiModel | null;
  onClose: () => void;
  t: TranslationFunction;
};

// The cine volumetry of the cardiac MRI model: the ejection fractions it measures against the ACDC truth,
// for the weights the service has loaded (none printed when no evaluation describes them).
function CardioVolumeSection({ locale, t }: { locale: Locale; t: TranslationFunction }) {
  const status = useAiModelsStatus();
  const weights = status.data?.models.find((entry) => entry.modelId === CARDIO_SEG_ID)?.weightsSha256 ?? null;
  const evaluation = useCardioVolumeEvaluation(weights);

  return (
    <SheetSection title={t("aiAnalyses.sheet.cardioVolume")}>
      <p className="mb-2 text-xs leading-5 text-[var(--text-secondary)]">{t("aiAnalyses.sheet.cardioVolumeHint")}</p>
      <VolumeMetricsTable
        evaluation={evaluation.data}
        loading={status.isLoading || (weights !== null && evaluation.isLoading)}
        locale={locale}
        t={t}
      />
    </SheetSection>
  );
}

function SheetSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="border-t border-[var(--line-soft)] pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold text-[var(--text-secondary)]">{title}</h3>
      <div className="mt-2 text-sm text-[var(--text-primary)]">{children}</div>
    </section>
  );
}

function SheetField({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 py-1">
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

// Counts of the test set, rows = true class, columns = predicted class. The
// right results (diagonal) are told by the caption and a visually hidden
// word, and shown in bold with a frame: never by colour alone.
function ConfusionMatrixTable({
  caption,
  locale,
  matrix,
  t,
}: {
  caption: string;
  locale: Locale;
  matrix: AiConfusionMatrix;
  t: TranslationFunction;
}) {
  const integer = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-2 text-start text-xs leading-5 text-[var(--text-secondary)]">{caption}</caption>
        <thead>
          <tr className="text-xs text-[var(--text-secondary)]">
            <td className="pb-1 pe-2" />
            <th scope="colgroup" colSpan={matrix.labels.length} className="pb-1 text-start font-medium">
              {t("aiAnalyses.sheet.predictedClass")}
            </th>
          </tr>
          <tr className="text-xs text-[var(--text-secondary)]">
            <th scope="col" className="pb-1 pe-2 text-start font-medium">{t("aiAnalyses.sheet.trueClass")}</th>
            {matrix.labels.map((label) => (
              <th key={label} scope="col" className="pb-1 pe-2 text-end font-medium">
                {t(`aiAnalyses.classes.${label}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.labels.map((trueLabel, row) => (
            <tr key={trueLabel} className="border-t border-[var(--line-soft)]">
              <th scope="row" className="py-1.5 pe-2 text-start font-normal">{t(`aiAnalyses.classes.${trueLabel}`)}</th>
              {matrix.matrix[row].map((count, column) => (
                <td
                  key={matrix.labels[column]}
                  className={
                    row === column
                      ? "py-1.5 pe-2 text-end font-[family-name:var(--font-auth-mono)] font-semibold tabular-nums outline -outline-offset-2 outline-[var(--border-strong)]"
                      : "py-1.5 pe-2 text-end font-[family-name:var(--font-auth-mono)] tabular-nums"
                  }
                >
                  <bdi dir="ltr">{integer.format(count)}</bdi>
                  {row === column ? <span className="sr-only"> ({t("aiAnalyses.sheet.correct")})</span> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BREAKHIS_ID = "pathology-breakhis-classification";
const PANNUKE_ID = "pathology-unet-pannuke-segmentation";

// BreakHis on its test set, one row per image magnification, in two narrow
// tables: images, sensitivity and specificity; then the four cells of its
// matrix, each named.
function MagnificationTable({ locale, t }: { locale: Locale; t: TranslationFunction }) {
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const integer = new Intl.NumberFormat(intlLocale);
  const percent = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1, minimumFractionDigits: 1, style: "percent" });
  const cells = ["trueNegative", "falsePositive", "falseNegative", "truePositive"] as const;
  const caption = "mb-2 text-start text-xs leading-5 text-[var(--text-secondary)]";
  const head = "pb-1 pe-3 text-start align-bottom font-medium";
  const mono = "py-1.5 pe-3 font-[family-name:var(--font-auth-mono)] tabular-nums";
  const rows = aiMagnifications.map((magnification) => {
    const metrics = breakhisEvaluation.byMagnification[magnification];
    const [[trueNegative, falsePositive], [falseNegative, truePositive]] = metrics.confusionMatrix;
    return { counts: { falseNegative, falsePositive, trueNegative, truePositive }, magnification, metrics };
  });
  const rowHeader = (magnification: number) => (
    <th scope="row" className="py-1.5 pe-3 text-start font-normal">
      <bdi dir="ltr">{t("aiAnalyses.sheet.magnificationValue", { value: magnification })}</bdi>
    </th>
  );

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className={caption}>{t("aiAnalyses.sheet.byMagnificationCaption")}</caption>
          <thead>
            <tr className="text-xs text-[var(--text-secondary)]">
              <th scope="col" className={head}>{t("aiAnalyses.sheet.magnification")}</th>
              <th scope="col" className={head}>{t("aiAnalyses.sheet.images")}</th>
              <th scope="col" className={head}>{t("aiAnalyses.sheet.sensitivity")}</th>
              <th scope="col" className={head}>{t("aiAnalyses.sheet.specificity")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ magnification, metrics }) => (
              <tr key={magnification} className="border-t border-[var(--line-soft)]">
                {rowHeader(magnification)}
                <td className={mono}><bdi dir="ltr">{integer.format(metrics.n)}</bdi></td>
                <td className={mono}><bdi dir="ltr">{percent.format(metrics.sensitivity)}</bdi></td>
                <td className={mono}><bdi dir="ltr">{percent.format(metrics.specificity)}</bdi></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className={caption}>{t("aiAnalyses.sheet.byMagnificationMatrix")}</caption>
          <thead>
            <tr className="text-xs text-[var(--text-secondary)]">
              <th scope="col" className={head}>{t("aiAnalyses.sheet.magnification")}</th>
              {cells.map((cell) => (
                <th key={cell} scope="col" className={head}>{t(`aiAnalyses.sheet.matrixCells.${cell}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ counts, magnification }) => (
              <tr key={magnification} className="border-t border-[var(--line-soft)]">
                {rowHeader(magnification)}
                {cells.map((cell) => (
                  <td key={cell} className={mono}><bdi dir="ltr">{integer.format(counts[cell])}</bdi></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Dice and IoU per class of a PanNuke measure (the background first).
function PannukeTable({
  caption,
  evaluation,
  locale,
  t,
}: {
  caption: string;
  evaluation: PannukeEvaluation;
  locale: Locale;
  t: TranslationFunction;
}) {
  const decimal = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const rows = ["background", ...nucleusTypes] as const;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="mb-2 text-start text-xs font-semibold leading-5 text-[var(--text-primary)]">{caption}</caption>
        <thead>
          <tr className="text-xs text-[var(--text-secondary)]">
            <th scope="col" className="pb-1 pe-3 text-start font-medium">{t("aiAnalyses.sheet.nucleusType")}</th>
            <th scope="col" className="pb-1 pe-3 text-start font-medium">{t("aiAnalyses.sheet.dice")}</th>
            <th scope="col" className="pb-1 text-start font-medium">{t("aiAnalyses.sheet.iou")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row} className="border-t border-[var(--line-soft)]">
              <th scope="row" className="py-1.5 pe-3 text-start font-normal">
                {row === "background" ? t("aiAnalyses.sheet.background") : t(`aiAnalyses.classes.${row}`)}
              </th>
              <td className="py-1.5 pe-3 font-[family-name:var(--font-auth-mono)] tabular-nums">
                <bdi dir="ltr">{decimal.format(evaluation.perClass[row].dice)}</bdi>
              </td>
              <td className="py-1.5 font-[family-name:var(--font-auth-mono)] tabular-nums">
                <bdi dir="ltr">{decimal.format(evaluation.perClass[row].iou)}</bdi>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-[var(--text-secondary)]">
        {t("aiAnalyses.sheet.nucleiMeanDice", { value: isolate(decimal.format(evaluation.nucleiMeanDice)) })}
      </p>
    </div>
  );
}

// PanNuke: the test measure per type.
function PannukeMetrics({ locale, t }: { locale: Locale; t: TranslationFunction }) {
  return <PannukeTable caption={t("aiAnalyses.sheet.testByType")} evaluation={pannukeEvaluation} locale={locale} t={t} />;
}

// Side panel over the hub: a native modal <dialog> (the page behind is inert,
// Escape closes it), plus a Tab loop so focus never leaves it for the browser
// chrome. Focus returns to the button that opened it.
export function AiModelSheet({ locale, model, onClose, t }: AiModelSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (model && !dialog.open) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      closeButtonRef.current?.focus();
    } else if (!model && dialog.open) {
      dialog.close();
    }
  }, [model]);

  const handleClose = () => {
    onClose();
    const trigger = triggerRef.current;
    triggerRef.current = null;

    if (trigger?.isConnected) {
      trigger.focus();
    }
  };

  const keepFocusInside = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") {
      return;
    }

    const tabbables = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(tabbableSelector));

    if (tabbables.length === 0) {
      return;
    }

    const first = tabbables[0];
    const last = tabbables[tabbables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const notProvided = <span className="text-[var(--text-secondary)]">{t("aiAnalyses.card.notProvided")}</span>;
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const percent = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2, minimumFractionDigits: 2, style: "percent" });
  const decimal = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 4, minimumFractionDigits: 4 });
  // "Évaluation du <date>, rapport <name>": the source of the "evaluation" metrics.
  const evaluationParams = model?.evaluation
    ? { date: formatEvaluationDate(model.evaluation.date, locale), report: isolate(model.evaluation.report) }
    : null;
  const evaluationSource = evaluationParams
    ? model?.id === PANNUKE_ID
      ? t("aiAnalyses.evaluation.sourcePannuke", evaluationParams)
      : model?.module === "pathology"
        ? t("aiAnalyses.evaluation.sourcePathology", evaluationParams)
        : t("aiAnalyses.evaluation.source", evaluationParams)
    : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="ai-model-sheet"
      onClose={handleClose}
      onKeyDown={keepFocusInside}
      // The content fills the dialog: a click on the dialog itself is a click
      // on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.close();
        }
      }}
    >
      {model ? (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--medical)]">
                {t("aiAnalyses.sheet.eyebrow")} · {t(`aiAnalyses.modules.${model.module}.title`)}
              </p>
              <h2 id={titleId} className="mt-1 break-words text-lg font-semibold">
                {t(`aiAnalyses.models.${model.id}.name`)}
              </h2>
              <div className="mt-2">
                <StatusBadge label={t(`aiAnalyses.statuses.${model.status}`)} tone={aiModelStatusTone[model.status]} />
              </div>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              className="clinical-icon-button shrink-0"
              aria-label={t("aiAnalyses.sheet.close")}
              onClick={() => dialogRef.current?.close()}
            >
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </header>

          {/* Focusable so the sheet scrolls from the keyboard. */}
          <div
            tabIndex={0}
            role="region"
            aria-labelledby={titleId}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
          >
            <dl className="text-sm">
              <SheetField label={t("aiAnalyses.sheet.architecture")}>
                {model.architecture ? <bdi>{model.architecture}</bdi> : notProvided}
              </SheetField>
              <SheetField label={t("aiAnalyses.sheet.version")}>
                {model.version ? <bdi dir="ltr" className="font-[var(--font-auth-mono)]">v{model.version}</bdi> : notProvided}
              </SheetField>
            </dl>

            <SheetSection title={t("aiAnalyses.sheet.intendedUse")}>
              <p className="leading-6">{t(`aiAnalyses.models.${model.id}.intendedUse`)}</p>
            </SheetSection>

            <SheetSection title={t("aiAnalyses.sheet.inputs")}>
              <dl>
                <SheetField label={t("aiAnalyses.sheet.modality")}>
                  {model.inputModality ? t(`aiAnalyses.modalities.${model.inputModality}`) : notProvided}
                </SheetField>
                <SheetField label={t("aiAnalyses.sheet.formats")}>
                  {model.acceptedFormats ? <bdi>{model.acceptedFormats.join(", ")}</bdi> : notProvided}
                </SheetField>
              </dl>
            </SheetSection>

            <SheetSection title={t("aiAnalyses.sheet.outputs")}>
              <dl>
                <SheetField label={t("aiAnalyses.sheet.task")}>{t(`aiAnalyses.tasks.${model.task}`)}</SheetField>
                <SheetField label={t("aiAnalyses.sheet.classes")}>
                  {model.outputClasses.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {model.outputClasses.map((outputClass) => (
                        <li key={outputClass} className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs">
                          {t(`aiAnalyses.classes.${outputClass}`)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    notProvided
                  )}
                </SheetField>
              </dl>
            </SheetSection>

            <SheetSection title={t("aiAnalyses.sheet.trainingData")}>
              {model.trainingData ? <p><bdi>{model.trainingData}</bdi></p> : <p>{notProvided}</p>}
            </SheetSection>

            <SheetSection title={t("aiAnalyses.sheet.metrics")}>
              {model.id === PANNUKE_ID ? (
                <>
                  <PannukeMetrics locale={locale} t={t} />
                  {evaluationSource ? <p className="mt-2 text-xs text-[var(--text-secondary)]">{evaluationSource}</p> : null}
                </>
              ) : model.metrics ? (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-[var(--text-secondary)]">
                        <th scope="col" className="pb-1 text-start font-medium">{t("aiAnalyses.sheet.metric")}</th>
                        <th scope="col" className="pb-1 text-start font-medium">{t("aiAnalyses.sheet.value")}</th>
                        <th scope="col" className="pb-1 text-start font-medium">{t("aiAnalyses.sheet.dataset")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.metrics.map((metric) => (
                        <tr key={metric.key} className="border-t border-[var(--line-soft)]">
                          <th scope="row" className="py-1.5 pe-3 text-start align-top font-normal">{t(`aiAnalyses.metrics.${metric.key}`)}</th>
                          <td className="py-1.5 pe-3 align-top">
                            <bdi dir="ltr" className="font-[var(--font-auth-mono)] tabular-nums">{formatAiMetricValue(metric, locale)}</bdi>
                            {metric.ci95 ? (
                              <span className="block text-xs tabular-nums text-[var(--text-secondary)]">
                                {t("aiAnalyses.evaluation.interval", { range: isolate(formatAiMetricInterval(metric, locale) ?? "") })}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-1.5 align-top">
                            {metric.dataset ? t(`aiAnalyses.datasets.${metric.dataset}`, datasetLabelParams(metric.dataset, locale)) : notProvided}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {model.id === BREAKHIS_ID ? (
                    <p className="mt-2 text-xs font-medium text-[var(--text-primary)]">
                      {t("aiAnalyses.sheet.testPatients", testPatientsParams(locale))}
                    </p>
                  ) : null}
                  {evaluationSource ? <p className="mt-2 text-xs text-[var(--text-secondary)]">{evaluationSource}</p> : null}
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">{t("aiAnalyses.sheet.metricsNote")}</p>
                </>
              ) : (
                <p>{notProvided}</p>
              )}
            </SheetSection>

            {model.classMetrics ? (
              <SheetSection title={t("aiAnalyses.sheet.classMetrics")}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-[var(--text-secondary)]">
                        <th scope="col" className="pb-1 pe-3 text-start font-medium">{t("aiAnalyses.sheet.class")}</th>
                        <th scope="col" className="pb-1 pe-3 text-start font-medium">{t("aiAnalyses.sheet.precision")}</th>
                        <th scope="col" className="pb-1 pe-3 text-start font-medium">{t("aiAnalyses.sheet.recall")}</th>
                        <th scope="col" className="pb-1 pe-3 text-start font-medium">{t("aiAnalyses.sheet.f1")}</th>
                        <th scope="col" className="pb-1 text-start font-medium">{t("aiAnalyses.sheet.auc")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.classMetrics.map((metric) => (
                        <tr key={metric.classKey} className="border-t border-[var(--line-soft)]">
                          <th scope="row" className="py-1.5 pe-3 text-start align-top font-normal">
                            {t(`aiAnalyses.classes.${metric.classKey}`)}
                          </th>
                          <td className="py-1.5 pe-3 align-top font-[var(--font-auth-mono)] tabular-nums">
                            <bdi dir="ltr">{percent.format(metric.precision)}</bdi>
                          </td>
                          <td className="py-1.5 pe-3 align-top font-[var(--font-auth-mono)] tabular-nums">
                            <bdi dir="ltr">{percent.format(metric.recall)}</bdi>
                            {metric.recallCi95 ? (
                              <span className="block text-xs text-[var(--text-secondary)]">
                                {t("aiAnalyses.evaluation.interval", { range: isolate(formatInterval(metric.recallCi95, "percent", locale)) })}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-1.5 pe-3 align-top font-[var(--font-auth-mono)] tabular-nums">
                            {metric.f1 === null ? notProvided : <bdi dir="ltr">{decimal.format(metric.f1)}</bdi>}
                          </td>
                          <td className="py-1.5 align-top font-[var(--font-auth-mono)] tabular-nums">
                            {metric.auc === null ? notProvided : <bdi dir="ltr">{decimal.format(metric.auc)}</bdi>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {model.classMetricsDataset ? (
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    {t(`aiAnalyses.datasets.${model.classMetricsDataset}`, datasetLabelParams(model.classMetricsDataset, locale))}
                  </p>
                ) : null}
              </SheetSection>
            ) : null}

            {model.confusionMatrix ? (
              <SheetSection title={t("aiAnalyses.sheet.confusionMatrix")}>
                <ConfusionMatrixTable
                  caption={t("aiAnalyses.sheet.confusionCaption", {
                    count: isolate(
                      new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ").format(
                        model.confusionMatrix.matrix.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0),
                      ),
                    ),
                  })}
                  locale={locale}
                  matrix={model.confusionMatrix}
                  t={t}
                />
                {evaluationSource ? <p className="mt-2 text-xs text-[var(--text-secondary)]">{evaluationSource}</p> : null}
              </SheetSection>
            ) : null}

            {model.id === CARDIO_SEG_ID ? <CardioVolumeSection locale={locale} t={t} /> : null}

            {model.id === BREAKHIS_ID ? (
              <SheetSection title={t("aiAnalyses.sheet.byMagnification")}>
                <MagnificationTable locale={locale} t={t} />
              </SheetSection>
            ) : null}

            <SheetSection title={t("aiAnalyses.sheet.limitations")}>
              <ul className="list-disc space-y-1.5 ps-5 leading-6">
                {model.knownLimitations.map((limitation) => (
                  <li key={limitation}>{t(`aiAnalyses.limitations.${limitation}`, limitationParams(limitation, locale))}</li>
                ))}
              </ul>
            </SheetSection>

            <SheetSection title={t("aiAnalyses.sheet.populations")}>
              <p>{model.underrepresentedPopulations ?? notProvided}</p>
            </SheetSection>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
