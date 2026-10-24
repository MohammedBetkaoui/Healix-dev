"use client";

import { Activity, BrainCircuit, CircleCheck, Info, LineChart, ShieldAlert, Table2 } from "lucide-react";
import { useId } from "react";

import {
  alertedModels,
  buildChartData,
  driftStatus,
  entryKey,
  formatDuration,
  formatPercent,
  formatPoints,
  hasRuns,
  modelName,
  monthLabel,
  type DriftStatus,
  type ModelMonitoring,
  type ModelMonitoringEntry,
} from "@/features/ai-analyses/model-monitoring";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

import { CorrectionRateChart } from "./CorrectionRateChart";

const MONO = "font-[family-name:var(--font-auth-mono)] tabular-nums";

const badgeTone: Record<DriftStatus, string> = {
  alert: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  map: "border-[var(--line)] bg-[var(--panel-soft)] text-[var(--ink-soft)]",
  noBaseline: "border-[var(--line)] bg-[var(--panel-soft)] text-[var(--ink-soft)]",
  noDecision: "border-[var(--line)] bg-[var(--panel-soft)] text-[var(--ink-soft)]",
  stable: "border-[var(--success-line)] bg-[var(--success-soft)] text-[var(--success-ink)]",
  tooFewDecisions: "border-[var(--line)] bg-[var(--panel-soft)] text-[var(--ink-soft)]",
};

type BoardProps = {
  data: ModelMonitoring;
  locale: Locale;
  /** Whose figures: the workspace of the user, or every workspace (back-office). */
  scope: "global" | "workspace";
  t: TranslationFunction;
};

// The monitoring board: the alerts, the curve, then one section per model
// with its monthly table and its model → physician matrix. Shared by the
// workspaces' page and the back-office's.
export function ModelMonitoringBoard({ data, locale, scope, t }: BoardProps) {
  const alerts = alertedModels(data);
  const chart = buildChartData(data);

  return (
    <div className="space-y-5">
      <HowToRead data={data} scope={scope} t={t} />

      {alerts.length > 0 ? (
        <section
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-4 py-3 text-[var(--warning-ink)]"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            {t("aiAnalyses.monitoring.alert.title")}
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm leading-6">
            {alerts.map((entry) => (
              <li key={entryKey(entry)}>
                {t("aiAnalyses.monitoring.alert.item", {
                  baseline: formatPercent(entry.alert!.baselineRate, locale),
                  model: modelName(entry.modelId, t),
                  month: monthLabel(entry.alert!.month, locale),
                  months: data.thresholds.baselineMonths,
                  points: formatPoints(entry.alert!.deltaPoints, locale),
                  rate: formatPercent(entry.alert!.rate, locale),
                })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasRuns(data) ? (
        <>
          <section className="surface-section overflow-hidden" aria-label={t("aiAnalyses.monitoring.chart.title")}>
            <header className="flex items-start gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]">
                <LineChart className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[var(--ink)]">{t("aiAnalyses.monitoring.chart.title")}</h2>
                <p className="mt-1 max-w-4xl text-xs leading-5 text-[var(--ink-faint)]">{t("aiAnalyses.monitoring.chart.caption")}</p>
              </div>
            </header>
            <div className="p-4 sm:p-5">
              {chart.series.length > 0 ? (
                <CorrectionRateChart data={chart} locale={locale} t={t} />
              ) : (
                <p className="text-sm text-[var(--ink-soft)]">{t("aiAnalyses.monitoring.chart.empty")}</p>
              )}
            </div>
          </section>

          {data.models.map((entry) => (
            <ModelSection key={entryKey(entry)} data={data} entry={entry} locale={locale} t={t} />
          ))}
        </>
      ) : (
        <div className="surface-section flex flex-col items-center px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--panel-soft)] text-[var(--ink-faint)]">
            <Activity className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <p className="mt-4 max-w-md text-sm text-[var(--ink-soft)]">{t("aiAnalyses.monitoring.empty")}</p>
        </div>
      )}
    </div>
  );
}

function HowToRead({ data, scope, t }: Pick<BoardProps, "data" | "scope" | "t">) {
  const params = {
    minimum: data.thresholds.minDecisions,
    months: data.thresholds.baselineMonths,
    points: data.thresholds.driftPoints,
  };

  return (
    <details className="surface-section group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--ink)] [&::-webkit-details-marker]:hidden sm:px-5">
        <Info className="h-4 w-4 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
        {t("aiAnalyses.monitoring.howTo.title")}
      </summary>
      <ul className="space-y-2 border-t border-[var(--line)] px-4 py-3 text-xs leading-5 text-[var(--ink-soft)] sm:px-5">
        <li>{t(`aiAnalyses.monitoring.howTo.scope.${scope}`)}</li>
        <li>{t("aiAnalyses.monitoring.howTo.rate")}</li>
        <li>{t("aiAnalyses.monitoring.howTo.months")}</li>
        <li>{t("aiAnalyses.monitoring.howTo.drift", params)}</li>
        <li>{t("aiAnalyses.monitoring.howTo.maps")}</li>
      </ul>
    </details>
  );
}

function StatusBadge({ status, minimum, t }: { minimum: number; status: DriftStatus; t: TranslationFunction }) {
  const Icon = status === "alert" ? ShieldAlert : status === "stable" ? CircleCheck : Info;

  return (
    <span
      data-status={status}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", badgeTone[status])}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
      {t(`aiAnalyses.monitoring.model.status.${status}`, { minimum })}
    </span>
  );
}

function ModelSection({ data, entry, locale, t }: { data: ModelMonitoring; entry: ModelMonitoringEntry; locale: Locale; t: TranslationFunction }) {
  const id = useId();
  const name = modelName(entry.modelId, t);
  const status = driftStatus(entry, data.thresholds.minDecisions);
  const integer = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ");
  const count = (value: number) => integer.format(value);
  // The most recent month first: it is the one that matters.
  const months = [...entry.months].reverse();

  return (
    <section aria-labelledby={`${id}-title`} className="surface-section overflow-hidden" data-model={entryKey(entry)}>
      <header className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]">
            <BrainCircuit className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="break-words text-sm font-semibold text-[var(--ink)]">
              <bdi>{name}</bdi>
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--ink-faint)]">
              {t("aiAnalyses.monitoring.model.chain")} : <bdi>{t(`aiAnalyses.pipelines.${entry.pipeline}.name`)}</bdi>
            </p>
          </div>
        </div>
        <StatusBadge minimum={data.thresholds.minDecisions} status={status} t={t} />
      </header>

      <div className="overflow-x-auto p-4 sm:p-5">
        <table className="w-full min-w-[56rem] text-sm">
          <caption className="sr-only">{t("aiAnalyses.monitoring.table.caption", { model: name })}</caption>
          <thead className="bg-[var(--panel-soft)]">
            <tr className="border-b border-[var(--line)] text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-[var(--ink-faint)]">
              <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t("aiAnalyses.monitoring.table.month")}</th>
              {(["runs", "succeeded", "failed", "rejectedInput", "decided", "validated", "corrected", "rejected", "correctionRate", "decisionDelay", "inference"] as const).map((column) => (
                <th key={column} scope="col" className="px-3 py-2.5 text-end font-semibold">{t(`aiAnalyses.monitoring.table.${column}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line-soft)]">
            {months.map((month) => (
              <tr key={month.month} data-drift={month.drift.alert ? "true" : undefined} className={cn("transition hover:bg-[var(--panel-soft)]", month.drift.alert && "bg-[var(--warning-soft)]")}>
                <th scope="row" className="whitespace-nowrap px-3 py-3 text-start font-medium text-[var(--ink)]">{monthLabel(month.month, locale)}</th>
                {[month.runs, month.succeeded, month.failed, month.rejectedInput, month.decided, month.validated, month.corrected, month.rejected].map((value, index) => (
                  <td key={index} className={`px-3 py-3 text-end ${MONO}`}>{count(value)}</td>
                ))}
                <td className="px-3 py-3 text-end">
                  <span className={cn(MONO, month.drift.alert && "font-semibold text-[var(--warning-ink)]")}>{formatPercent(month.correctionRate, locale)}</span>
                  {month.correctionRate !== null && month.drift.deltaPoints !== null && month.drift.baselineRate !== null ? (
                    <span className="block text-[0.7rem] leading-4 text-[var(--ink-faint)]">
                      <bdi dir="ltr">
                        {t("aiAnalyses.monitoring.table.vsBaseline", {
                          baseline: formatPercent(month.drift.baselineRate, locale),
                          points: formatPoints(month.drift.deltaPoints, locale),
                        })}
                      </bdi>
                    </span>
                  ) : null}
                  {month.drift.alert ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-[var(--warning-ink)]">
                      <ShieldAlert className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                      {t("aiAnalyses.monitoring.table.drift")}
                    </span>
                  ) : null}
                </td>
                <td className={`whitespace-nowrap px-3 py-3 text-end ${MONO}`}>{formatDuration(month.medianDecisionMs, locale, t)}</td>
                <td className={`whitespace-nowrap px-3 py-3 text-end ${MONO}`}>{formatDuration(month.medianInferenceMs, locale, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entry.correctionApplicable ? (
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[var(--ink-soft)]">
            <Table2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
            {t("aiAnalyses.monitoring.howTo.maps")}
          </p>
        ) : null}
      </div>

      <ConfusionMatrixSection entry={entry} id={id} integer={integer} t={t} />
    </section>
  );
}

function ConfusionMatrixSection({ entry, id, integer, t }: { entry: ModelMonitoringEntry; id: string; integer: Intl.NumberFormat; t: TranslationFunction }) {
  // The maps and the multi-label ECG have no single class to cross.
  if (!entry.matrix) {
    return entry.correctionApplicable ? (
      <p className="border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--ink-faint)] sm:px-5">{t("aiAnalyses.monitoring.matrix.notApplicable")}</p>
    ) : null;
  }

  const { counts, modelLabels, retainedLabels } = entry.matrix;
  const total = counts.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0);

  return (
    <div className="border-t border-[var(--line)]">
      <header className="px-4 pt-4 sm:px-5">
        <h3 id={`${id}-matrix`} className="text-sm font-semibold text-[var(--ink)]">{t("aiAnalyses.monitoring.matrix.title")}</h3>
        <p className="mt-1 max-w-4xl text-xs leading-5 text-[var(--ink-faint)]">{t("aiAnalyses.monitoring.matrix.caption")}</p>
      </header>
      {total === 0 ? (
        <p className="px-4 py-4 text-sm text-[var(--ink-soft)] sm:px-5">{t("aiAnalyses.monitoring.matrix.none")}</p>
      ) : (
        <div className="overflow-x-auto p-4 sm:p-5">
          <table aria-labelledby={`${id}-matrix`} className="w-full min-w-[34rem] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line)] text-sm">
            <thead className="bg-[var(--panel-soft)]">
              <tr className="text-xs text-[var(--ink-faint)]">
                <td className="px-3 pb-1 pt-3" />
                <th scope="colgroup" colSpan={retainedLabels.length} className="px-3 pb-1 pt-3 text-start font-medium">{t("aiAnalyses.monitoring.matrix.retainedClass")}</th>
              </tr>
              <tr className="border-b border-[var(--line)] text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-[var(--ink-faint)]">
                <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t("aiAnalyses.monitoring.matrix.modelClass")}</th>
                {retainedLabels.map((label) => <th key={label} scope="col" className="px-3 py-2.5 text-end font-semibold">{t(`aiAnalyses.classes.${label}`)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-soft)]">
              {modelLabels.map((label, row) => (
                <tr key={label} className="transition hover:bg-[var(--panel-soft)]">
                  <th scope="row" className="px-3 py-3 text-start font-medium text-[var(--ink)]">{t(`aiAnalyses.classes.${label}`)}</th>
                  {counts[row].map((cell, column) => {
                    const agreed = retainedLabels[column] === label;
                    return (
                      <td key={retainedLabels[column]} className={`px-3 py-3 text-end ${MONO} ${agreed ? "bg-[var(--success-soft)] font-semibold text-[var(--success-ink)]" : "text-[var(--ink-soft)]"}`}>
                        <bdi dir="ltr">{integer.format(cell)}</bdi>
                        {agreed ? <span className="sr-only"> ({t("aiAnalyses.monitoring.matrix.agreementCell")})</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
