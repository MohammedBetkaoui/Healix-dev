"use client";

import { type UseQueryResult } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { useId } from "react";

import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import {
  MONITORING_PERIODS,
  type ModelMonitoring,
  type MonitoringMonths,
} from "@/features/ai-analyses/model-monitoring";
import { type Locale } from "@/i18n";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { type TranslationFunction } from "@/lib/i18n";

import { ModelMonitoringBoard } from "./ModelMonitoringBoard";

type PeriodSelectProps = {
  months: MonitoringMonths;
  onChange: (months: MonitoringMonths) => void;
  t: TranslationFunction;
};

export function MonitoringPeriodSelect({ months, onChange, t }: PeriodSelectProps) {
  const id = useId();

  return (
    <label className="w-full space-y-1.5 sm:w-56" htmlFor={id}>
      <span className="block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{t("aiAnalyses.monitoring.period.label")}</span>
      <select
        id={id}
        className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
        value={months}
        onChange={(event) => onChange(Number(event.target.value) as MonitoringMonths)}
      >
        {MONITORING_PERIODS.map((period) => (
          <option key={period} value={period}>{t(`aiAnalyses.monitoring.period.${period}`)}</option>
        ))}
      </select>
    </label>
  );
}

type ContentProps = {
  /** The account asking, for the notice of an account not verified yet; none in the back-office. */
  accountType?: "DOCTOR" | "ESTABLISHMENT";
  locale: Locale;
  query: Pick<UseQueryResult<ModelMonitoring>, "data" | "error" | "isError" | "isLoading">;
  scope: "global" | "workspace";
  t: TranslationFunction;
};

// The board of a query: loading, failure, or the figures.
export function ModelMonitoringContent({ accountType, locale, query, scope, t }: ContentProps) {
  if (accountType && isVerificationRequiredError(query.error)) {
    return <VerificationRequiredNotice accountType={accountType} t={t} />;
  }

  if (query.isLoading) {
    return (
      <div className="space-y-3" aria-live="polite">
        <p className="sr-only">{t("aiAnalyses.monitoring.loading")}</p>
        {Array.from({ length: 2 }, (_, index) => <div key={index} className="surface-section h-48 animate-pulse bg-[var(--panel-soft)]" />)}
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div role="alert" className="surface-section flex flex-col items-center px-6 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger-ink)]">
          <ShieldAlert className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <p className="mt-4 text-sm font-semibold text-[var(--danger-ink)]">{t("aiAnalyses.monitoring.error")}</p>
      </div>
    );
  }

  return <ModelMonitoringBoard data={query.data} locale={locale} scope={scope} t={t} />;
}
