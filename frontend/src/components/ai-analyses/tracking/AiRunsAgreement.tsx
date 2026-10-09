"use client";

import { Info } from "lucide-react";
import { type ReactNode, useId, useMemo } from "react";

import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { type AiRunsRate, type AiRunsSummary } from "@/features/ai-analyses/ai-analyses.types";
import { isolate } from "@/features/ai-analyses/evaluation-presentation";
import { useAiRunsSummary } from "@/features/ai-analyses/hooks/use-ai-runs-overview";
import {
  formatRate,
  pendingAge,
  periodParams,
  ratesHidden,
  TRACKING_PERIODS,
  type TrackingState,
} from "@/features/ai-analyses/runs-tracking";
import { type Locale } from "@/i18n";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { type TranslationFunction } from "@/lib/i18n";

const MONO = "font-[family-name:var(--font-auth-mono)] tabular-nums";

type AiRunsAgreementProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  locale: Locale;
  state: TrackingState;
  t: TranslationFunction;
  update: (changes: Partial<TrackingState>) => void;
};

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="text-xs font-medium text-[var(--text-secondary)]">{label}</dt>
      <dd className="mt-1.5 space-y-1">{children}</dd>
    </div>
  );
}

// "Accord médecin / modèle": how often the physicians kept the model's class,
// on their own patients. Tables and figures only; no percentage at all under
// the minimum of decisions.
export function AiRunsAgreement({ accountType, locale, state, t, update }: AiRunsAgreementProps) {
  const id = useId();
  // Computed once per period: a new instant each render would refetch endlessly.
  const params = useMemo(() => periodParams(state.period, new Date()), [state.period]);
  const query = useAiRunsSummary(params);
  const integer = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ");
  const percent = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 1, style: "percent" });
  const summary = query.data;

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <h2 id={`${id}-title`} className="sr-only">{t("aiAnalyses.tracking.tabs.agreement")}</h2>

      <p role="note" className="flex items-start gap-2 text-sm leading-6 text-[var(--text-secondary)]">
        <Info size={16} strokeWidth={1.8} aria-hidden="true" className="mt-1 shrink-0" />
        {t("aiAnalyses.tracking.agreement.help")}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor={`${id}-period`} className="block text-xs font-medium text-[var(--text-secondary)]">
            {t("aiAnalyses.tracking.agreement.period")}
          </label>
          <select
            id={`${id}-period`}
            className="h-10 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]"
            value={state.period}
            onChange={(event) => update({ period: event.target.value as TrackingState["period"] })}
          >
            {TRACKING_PERIODS.map((period) => (
              <option key={period} value={period}>{t(`aiAnalyses.tracking.agreement.periods.${period}`)}</option>
            ))}
          </select>
        </div>
      </div>

      {isVerificationRequiredError(query.error) ? (
        <VerificationRequiredNotice accountType={accountType} t={t} />
      ) : query.isLoading ? (
        <p className="surface-section p-5 text-sm text-[var(--text-secondary)]" aria-live="polite">
          {t("aiAnalyses.tracking.agreement.loading")}
        </p>
      ) : query.isError || !summary ? (
        <p role="alert" className="surface-section p-5 text-sm text-[var(--danger-ink)]">
          {t("aiAnalyses.tracking.agreement.error")}
        </p>
      ) : (
        <SummaryView integer={integer} locale={locale} percent={percent} summary={summary} t={t} />
      )}
    </section>
  );
}

function SummaryView({
  integer,
  locale,
  percent,
  summary,
  t,
}: {
  integer: Intl.NumberFormat;
  locale: Locale;
  percent: Intl.NumberFormat;
  summary: AiRunsSummary;
  t: TranslationFunction;
}) {
  const id = useId();
  const hidden = ratesHidden(summary);
  const age = pendingAge(summary.pending.oldestAgeHours);
  const agreement = formatRate(summary.agreement, locale, summary);
  const threshold = isolate(percent.format(summary.uncertainty.threshold));
  const count = (value: number) => isolate(integer.format(value));
  const belowShare = formatRate(summary.uncertainty.belowThreshold, locale, summary);

  const rateCell = (rate: AiRunsRate) => {
    const formatted = formatRate(rate, locale, summary);
    if (formatted) return <span className={MONO}>{formatted.percent}</span>;
    return <span className="text-[var(--text-secondary)]">{hidden ? "—" : t("aiAnalyses.tracking.agreement.notEnough")}</span>;
  };

  return (
    <>
      {hidden ? (
        <p role="status" className="rounded-[var(--radius-md)] border border-s-[3px] border-[var(--border)] border-s-[color:var(--warning)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text-primary)]">
          {t("aiAnalyses.tracking.agreement.insufficient", { minimum: count(summary.minimumDecisions) })}
        </p>
      ) : null}

      <section aria-labelledby={`${id}-figures`}>
        <h3 id={`${id}-figures`} className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
          {t("aiAnalyses.tracking.agreement.figures")}
        </h3>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Figure label={t("aiAnalyses.tracking.agreement.analyses")}>
            <p className={`text-2xl font-semibold text-[var(--text-primary)] ${MONO}`}>{integer.format(summary.analyses)}</p>
          </Figure>
          <Figure label={t("aiAnalyses.tracking.agreement.pending")}>
            <p className={`text-2xl font-semibold text-[var(--text-primary)] ${MONO}`}>{integer.format(summary.pending.count)}</p>
            {age ? (
              <p className="text-xs text-[var(--text-secondary)]">
                {age.unit === "days"
                  ? t("aiAnalyses.tracking.agreement.oldestDays", { count: count(age.value) })
                  : t("aiAnalyses.tracking.agreement.oldestHours", { count: count(age.value) })}
              </p>
            ) : null}
          </Figure>
          <Figure label={t("aiAnalyses.tracking.agreement.agreementRate")}>
            {agreement ? (
              <>
                <p className={`text-2xl font-semibold text-[var(--text-primary)] ${MONO}`}>{agreement.percent}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {t("aiAnalyses.tracking.agreement.rateCounts", { count: isolate(agreement.count), total: isolate(agreement.total) })}
                </p>
              </>
            ) : (
              <>
                <p className={`text-2xl font-semibold text-[var(--text-secondary)] ${MONO}`}>—</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {t("aiAnalyses.tracking.agreement.rateCounts", { count: count(summary.agreement.count), total: count(summary.agreement.total) })}
                </p>
              </>
            )}
          </Figure>
          <Figure label={t("aiAnalyses.tracking.agreement.decisions")}>
            <p className={`text-2xl font-semibold text-[var(--text-primary)] ${MONO}`}>{integer.format(summary.decisions.total)}</p>
            <p className="text-xs text-[var(--text-secondary)]">
              {t("aiAnalyses.tracking.agreement.decisionCounts", {
                corrected: count(summary.decisions.CORRECTED),
                rejected: count(summary.decisions.REJECTED),
                validated: count(summary.decisions.VALIDATED),
              })}
            </p>
          </Figure>
        </dl>
      </section>

      <section aria-labelledby={`${id}-matrix`} className="surface-section p-4">
        <h3 id={`${id}-matrix`} className="text-sm font-semibold text-[var(--text-primary)]">
          {t("aiAnalyses.tracking.agreement.matrixTitle")}
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="mb-2 text-start text-xs leading-5 text-[var(--text-secondary)]">
              {t("aiAnalyses.tracking.agreement.matrixCaption")}
            </caption>
            <thead>
              <tr className="text-xs text-[var(--text-secondary)]">
                <td className="pb-1 pe-2" />
                <th scope="colgroup" colSpan={summary.matrix.retainedLabels.length} className="pb-1 text-start font-medium">
                  {t("aiAnalyses.tracking.agreement.retainedClass")}
                </th>
              </tr>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                <th scope="col" className="py-1.5 pe-2 text-start font-medium">{t("aiAnalyses.tracking.agreement.modelClass")}</th>
                {summary.matrix.retainedLabels.map((label) => (
                  <th key={label} scope="col" className="py-1.5 pe-2 text-end font-medium">{t(`aiAnalyses.classes.${label}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.matrix.modelLabels.map((label, row) => (
                <tr key={label} className="border-b border-[var(--line-soft)]">
                  <th scope="row" className="py-1.5 pe-2 text-start font-normal text-[var(--text-primary)]">{t(`aiAnalyses.classes.${label}`)}</th>
                  {summary.matrix.counts[row].map((cell, column) => {
                    const agreed = summary.matrix.retainedLabels[column] === label;
                    return (
                      <td
                        key={summary.matrix.retainedLabels[column]}
                        className={`py-1.5 pe-2 text-end ${MONO} ${agreed ? "bg-[var(--surface-muted)] font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
                      >
                        <bdi dir="ltr">{integer.format(cell)}</bdi>
                        {agreed ? <span className="sr-only"> ({t("aiAnalyses.tracking.agreement.agreementCell")})</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby={`${id}-threshold`} className="surface-section p-4">
        <h3 id={`${id}-threshold`} className="text-sm font-semibold text-[var(--text-primary)]">
          {t("aiAnalyses.tracking.agreement.thresholdTitle")}
        </h3>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {t("aiAnalyses.tracking.agreement.thresholdCaption", { threshold })}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                <td className="py-1.5 pe-3" />
                <th scope="col" className="py-1.5 pe-3 text-end font-medium">{t("aiAnalyses.tracking.agreement.decisionsColumn")}</th>
                <th scope="col" className="py-1.5 text-end font-medium">{t("aiAnalyses.tracking.agreement.agreementColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["above", summary.uncertainty.agreementAbove],
                  ["below", summary.uncertainty.agreementBelow],
                ] as const
              ).map(([side, rate]) => (
                <tr key={side} className="border-b border-[var(--line-soft)]">
                  <th scope="row" className="py-1.5 pe-3 text-start font-normal text-[var(--text-primary)]">
                    {side === "above"
                      ? t("aiAnalyses.tracking.agreement.above", { threshold })
                      : t("aiAnalyses.tracking.agreement.below", { threshold })}
                  </th>
                  <td className={`py-1.5 pe-3 text-end ${MONO}`}>{integer.format(rate.total)}</td>
                  <td className="py-1.5 text-end">{rateCell(rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--text-secondary)]">
          {belowShare
            ? t("aiAnalyses.tracking.agreement.belowShare", {
                count: isolate(belowShare.count),
                percent: isolate(belowShare.percent),
                total: isolate(belowShare.total),
              })
            : t("aiAnalyses.tracking.agreement.belowShareCounts", {
                count: count(summary.uncertainty.belowThreshold.count),
                total: count(summary.uncertainty.belowThreshold.total),
              })}
        </p>
      </section>
    </>
  );
}
