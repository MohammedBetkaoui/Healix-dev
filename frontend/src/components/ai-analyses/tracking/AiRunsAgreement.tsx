"use client";

import {
  Activity,
  BarChart3,
  BrainCircuit,
  Clock3,
  Gauge,
  Info,
  ListChecks,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
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

const figureTone = {
  institutional: "bg-[var(--panel-soft)] text-[var(--institutional)] ring-[var(--line)]",
  medical: "bg-[var(--medical-soft)] text-[var(--medical)] ring-[var(--accent-line)]",
  success: "bg-[var(--success-soft)] text-[var(--success-ink)] ring-[var(--success-line)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning-ink)] ring-[var(--warning-line)]",
} as const;

function Figure({ children, icon: Icon, label, tone }: {
  children: ReactNode;
  icon: LucideIcon;
  label: string;
  tone: keyof typeof figureTone;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] p-4 transition hover:border-[var(--accent-line)] hover:shadow-[var(--shadow-raised)]">
      <div className="flex items-start justify-between gap-3">
        <dt className="text-xs font-medium leading-5 text-[var(--ink-soft)]">{label}</dt>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] ring-1 ${figureTone[tone]}`}>
          <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </span>
      </div>
      <dd className="mt-3 space-y-1.5">{children}</dd>
    </div>
  );
}

export function AiRunsAgreement({ accountType, locale, state, t, update }: AiRunsAgreementProps) {
  const id = useId();
  const params = useMemo(() => periodParams(state.period, new Date()), [state.period]);
  const query = useAiRunsSummary(params);
  const integer = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ");
  const percent = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 1, style: "percent" });
  const summary = query.data;

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5">
      <h2 id={`${id}-title`} className="sr-only">{t("aiAnalyses.tracking.tabs.agreement")}</h2>

      <section className="surface-section overflow-hidden" aria-label={t("aiAnalyses.tracking.agreement.period")}>
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-dark)] ring-1 ring-[var(--accent-line)]">
              <BarChart3 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[var(--ink)]">{t("aiAnalyses.tracking.tabs.agreement")}</h3>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--ink-faint)]">{t("aiAnalyses.tracking.agreement.help")}</p>
            </div>
          </div>
          <label className="w-full space-y-1.5 sm:w-56" htmlFor={`${id}-period`}>
            <span className="block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{t("aiAnalyses.tracking.agreement.period")}</span>
            <select
              id={`${id}-period`}
              className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
              value={state.period}
              onChange={(event) => update({ period: event.target.value as TrackingState["period"] })}
            >
              {TRACKING_PERIODS.map((period) => <option key={period} value={period}>{t(`aiAnalyses.tracking.agreement.periods.${period}`)}</option>)}
            </select>
          </label>
        </div>
      </section>

      {isVerificationRequiredError(query.error) ? (
        <VerificationRequiredNotice accountType={accountType} t={t} />
      ) : query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite">
          <p className="sr-only">{t("aiAnalyses.tracking.agreement.loading")}</p>
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="surface-section h-32 animate-pulse bg-[var(--panel-soft)]" />)}
        </div>
      ) : query.isError || !summary ? (
        <div role="alert" className="surface-section flex flex-col items-center px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger-ink)]"><ShieldAlert className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
          <p className="mt-4 text-sm font-semibold text-[var(--danger-ink)]">{t("aiAnalyses.tracking.agreement.error")}</p>
        </div>
      ) : (
        <SummaryView integer={integer} locale={locale} percent={percent} summary={summary} t={t} />
      )}
    </section>
  );
}

function SummaryView({ integer, locale, percent, summary, t }: {
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
    return <span className="text-[var(--ink-faint)]">{hidden ? "—" : t("aiAnalyses.tracking.agreement.notEnough")}</span>;
  };

  return (
    <div className="space-y-5">
      {hidden ? (
        <p role="status" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-4 py-3 text-sm font-medium leading-6 text-[var(--warning-ink)]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
          {t("aiAnalyses.tracking.agreement.insufficient", { minimum: count(summary.minimumDecisions) })}
        </p>
      ) : null}

      <section aria-labelledby={`${id}-figures`}>
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />
          <h3 id={`${id}-figures`} className="text-sm font-semibold text-[var(--ink)]">{t("aiAnalyses.tracking.agreement.figures")}</h3>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Figure icon={Activity} label={t("aiAnalyses.tracking.agreement.analyses")} tone="medical">
            <p className={`text-2xl font-semibold text-[var(--ink)] ${MONO}`}>{integer.format(summary.analyses)}</p>
          </Figure>
          <Figure icon={Clock3} label={t("aiAnalyses.tracking.agreement.pending")} tone="warning">
            <p className={`text-2xl font-semibold text-[var(--ink)] ${MONO}`}>{integer.format(summary.pending.count)}</p>
            {age ? <p className="text-xs leading-5 text-[var(--ink-faint)]">{age.unit === "days" ? t("aiAnalyses.tracking.agreement.oldestDays", { count: count(age.value) }) : t("aiAnalyses.tracking.agreement.oldestHours", { count: count(age.value) })}</p> : null}
          </Figure>
          <Figure icon={Gauge} label={t("aiAnalyses.tracking.agreement.agreementRate")} tone="success">
            {agreement ? (
              <><p className={`text-2xl font-semibold text-[var(--ink)] ${MONO}`}>{agreement.percent}</p><p className="text-xs leading-5 text-[var(--ink-faint)]">{t("aiAnalyses.tracking.agreement.rateCounts", { count: isolate(agreement.count), total: isolate(agreement.total) })}</p></>
            ) : (
              <><p className={`text-2xl font-semibold text-[var(--ink-faint)] ${MONO}`}>—</p><p className="text-xs leading-5 text-[var(--ink-faint)]">{t("aiAnalyses.tracking.agreement.rateCounts", { count: count(summary.agreement.count), total: count(summary.agreement.total) })}</p></>
            )}
          </Figure>
          <Figure icon={ListChecks} label={t("aiAnalyses.tracking.agreement.decisions")} tone="institutional">
            <p className={`text-2xl font-semibold text-[var(--ink)] ${MONO}`}>{integer.format(summary.decisions.total)}</p>
            <p className="text-xs leading-5 text-[var(--ink-faint)]">{t("aiAnalyses.tracking.agreement.decisionCounts", { corrected: count(summary.decisions.CORRECTED), rejected: count(summary.decisions.REJECTED), validated: count(summary.decisions.VALIDATED) })}</p>
          </Figure>
        </dl>
      </section>

      <p role="note" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-3 text-xs leading-5 text-[var(--accent-dark)]">
        <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
        <span><strong className="font-semibold">{t("aiAnalyses.tracking.agreement.brainOnly")}</strong><span className="mt-0.5 block text-[var(--ink-soft)]">{t("aiAnalyses.tracking.agreement.brainOnlyNote")}</span></span>
      </p>

      <section aria-labelledby={`${id}-matrix`} className="surface-section overflow-hidden">
        <header className="flex items-start gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]"><BrainCircuit className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /></span>
          <div><h3 id={`${id}-matrix`} className="text-sm font-semibold text-[var(--ink)]">{t("aiAnalyses.tracking.agreement.matrixTitle")}</h3><p className="mt-1 max-w-4xl text-xs leading-5 text-[var(--ink-faint)]">{t("aiAnalyses.tracking.agreement.matrixCaption")}</p></div>
        </header>
        <div className="overflow-x-auto p-4 sm:p-5">
          <table className="w-full min-w-[40rem] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line)] text-sm">
            <caption className="sr-only">{t("aiAnalyses.tracking.agreement.matrixCaption")}</caption>
            <thead className="bg-[var(--panel-soft)]">
              <tr className="text-xs text-[var(--ink-faint)]"><td className="px-3 pb-1 pt-3" /><th scope="colgroup" colSpan={summary.matrix.retainedLabels.length} className="px-3 pb-1 pt-3 text-start font-medium">{t("aiAnalyses.tracking.agreement.retainedClass")}</th></tr>
              <tr className="border-b border-[var(--line)] text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-[var(--ink-faint)]">
                <th scope="col" className="px-3 py-2.5 text-start font-semibold">{t("aiAnalyses.tracking.agreement.modelClass")}</th>
                {summary.matrix.retainedLabels.map((label) => <th key={label} scope="col" className="px-3 py-2.5 text-end font-semibold">{t(`aiAnalyses.classes.${label}`)}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-soft)]">
              {summary.matrix.modelLabels.map((label, row) => (
                <tr key={label} className="transition hover:bg-[var(--panel-soft)]">
                  <th scope="row" className="px-3 py-3 text-start font-medium text-[var(--ink)]">{t(`aiAnalyses.classes.${label}`)}</th>
                  {summary.matrix.counts[row].map((cell, column) => {
                    const agreed = summary.matrix.retainedLabels[column] === label;
                    return <td key={summary.matrix.retainedLabels[column]} className={`px-3 py-3 text-end ${MONO} ${agreed ? "bg-[var(--success-soft)] font-semibold text-[var(--success-ink)]" : "text-[var(--ink-soft)]"}`}><bdi dir="ltr">{integer.format(cell)}</bdi>{agreed ? <span className="sr-only"> ({t("aiAnalyses.tracking.agreement.agreementCell")})</span> : null}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby={`${id}-threshold`} className="surface-section overflow-hidden">
        <header className="flex items-start gap-3 border-b border-[var(--line)] px-4 py-4 sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--success-soft)] text-[var(--success-ink)]"><Gauge className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /></span>
          <div><h3 id={`${id}-threshold`} className="text-sm font-semibold text-[var(--ink)]">{t("aiAnalyses.tracking.agreement.thresholdTitle")}</h3><p className="mt-1 text-xs leading-5 text-[var(--ink-faint)]">{t("aiAnalyses.tracking.agreement.thresholdCaption", { threshold })}</p></div>
        </header>
        <div className="overflow-x-auto p-4 sm:p-5">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-[var(--panel-soft)]"><tr className="border-b border-[var(--line)] text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-[var(--ink-faint)]"><td className="px-3 py-2.5" /><th scope="col" className="px-3 py-2.5 text-end font-semibold">{t("aiAnalyses.tracking.agreement.decisionsColumn")}</th><th scope="col" className="px-3 py-2.5 text-end font-semibold">{t("aiAnalyses.tracking.agreement.agreementColumn")}</th></tr></thead>
            <tbody className="divide-y divide-[var(--line-soft)]">
              {([ ["above", summary.uncertainty.agreementAbove], ["below", summary.uncertainty.agreementBelow] ] as const).map(([side, rate]) => (
                <tr key={side} className="transition hover:bg-[var(--panel-soft)]"><th scope="row" className="px-3 py-3 text-start font-medium text-[var(--ink)]">{side === "above" ? t("aiAnalyses.tracking.agreement.above", { threshold }) : t("aiAnalyses.tracking.agreement.below", { threshold })}</th><td className={`px-3 py-3 text-end ${MONO}`}>{integer.format(rate.total)}</td><td className="px-3 py-3 text-end">{rateCell(rate)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[var(--ink-soft)]"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--medical)]" strokeWidth={1.8} aria-hidden="true" />{belowShare ? t("aiAnalyses.tracking.agreement.belowShare", { count: isolate(belowShare.count), percent: isolate(belowShare.percent), total: isolate(belowShare.total) }) : t("aiAnalyses.tracking.agreement.belowShareCounts", { count: count(summary.uncertainty.belowThreshold.count), total: count(summary.uncertainty.belowThreshold.total) })}</p>
        </div>
      </section>
    </div>
  );
}
