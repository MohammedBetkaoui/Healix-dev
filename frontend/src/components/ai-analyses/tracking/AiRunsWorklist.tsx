"use client";

import { ChevronLeft, ChevronRight, Clock3, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { type AiRunListItem } from "@/features/ai-analyses/ai-analyses.types";
import { UNCERTAINTY_THRESHOLD } from "@/features/ai-analyses/brain-evaluation";
import { isolate } from "@/features/ai-analyses/evaluation-presentation";
import { useAiRunsOverview } from "@/features/ai-analyses/hooks/use-ai-runs-overview";
import { decisionTones } from "@/features/ai-analyses/run-decision";
import { sortPredictions } from "@/features/ai-analyses/run-presentation";
import {
  DEFAULT_TRACKING_STATE,
  isUncertainProbability,
  TRACKING_DECISIONS,
  TRACKING_STATUSES,
  type TrackingState,
  worklistParams,
} from "@/features/ai-analyses/runs-tracking";
import { formatPatientDateTime } from "@/features/patients/patient-registry";
import { type Locale } from "@/i18n";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { type TranslationFunction } from "@/lib/i18n";
import { type DashboardStatusTone } from "@/types/dashboard";

import { getPatientDisplayName } from "../wizard/PatientStep";

const MONO = "font-[family-name:var(--font-auth-mono)] tabular-nums";
const fieldClass =
  "h-10 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]";

type AiRunsWorklistProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  locale: Locale;
  roleBase: string;
  state: TrackingState;
  t: TranslationFunction;
  update: (changes: Partial<TrackingState>) => void;
};

// Decision column: the decision of a SUCCEEDED run ("En attente" until then),
// the run state otherwise. Status colours always come with their text.
function decisionCell(run: AiRunListItem, t: TranslationFunction): { label: string; tone: DashboardStatusTone; pending: boolean } {
  if (run.status !== "SUCCEEDED") {
    return { label: t(`aiAnalyses.tracking.filters.statuses.${run.status}`), pending: false, tone: "neutral" };
  }
  if (run.decisionStatus === null) {
    return { label: t("aiAnalyses.tracking.worklist.pending"), pending: true, tone: "info" };
  }
  return { label: t(`aiAnalyses.decision.statuses.${run.decisionStatus}`), pending: false, tone: decisionTones[run.decisionStatus] };
}

// "File de travail": the runs of every patient in scope, filtered in the URL,
// the runs waiting for a decision first by default.
export function AiRunsWorklist({ accountType, locale, roleBase, state, t, update }: AiRunsWorklistProps) {
  const id = useId();
  const query = useAiRunsOverview(worklistParams(state));
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const percent = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 1, style: "percent" });
  const integer = new Intl.NumberFormat(intlLocale);
  const page = query.data;
  const isFiltered =
    state.decision !== DEFAULT_TRACKING_STATE.decision ||
    state.status !== DEFAULT_TRACKING_STATE.status ||
    Boolean(state.from) ||
    Boolean(state.to) ||
    state.mine;

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <h2 id={`${id}-title`} className="sr-only">{t("aiAnalyses.tracking.tabs.worklist")}</h2>

      <form
        aria-label={t("aiAnalyses.tracking.filters.label")}
        className="surface-section grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="space-y-1">
          <label htmlFor={`${id}-decision`} className="text-xs font-medium text-[var(--text-secondary)]">
            {t("aiAnalyses.tracking.filters.decision")}
          </label>
          <select
            id={`${id}-decision`}
            className={fieldClass}
            value={state.decision}
            onChange={(event) => update({ decision: event.target.value as TrackingState["decision"], page: 1 })}
          >
            {TRACKING_DECISIONS.map((decision) => (
              <option key={decision} value={decision}>{t(`aiAnalyses.tracking.filters.decisions.${decision}`)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-status`} className="text-xs font-medium text-[var(--text-secondary)]">
            {t("aiAnalyses.tracking.filters.status")}
          </label>
          <select
            id={`${id}-status`}
            className={fieldClass}
            value={state.status}
            onChange={(event) => update({ page: 1, status: event.target.value as TrackingState["status"] })}
          >
            {TRACKING_STATUSES.map((status) => (
              <option key={status} value={status}>{t(`aiAnalyses.tracking.filters.statuses.${status}`)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-from`} className="text-xs font-medium text-[var(--text-secondary)]">
            {t("aiAnalyses.tracking.filters.from")}
          </label>
          <input
            id={`${id}-from`}
            type="date"
            className={fieldClass}
            value={state.from}
            max={state.to || undefined}
            onChange={(event) => update({ from: event.target.value, page: 1 })}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-to`} className="text-xs font-medium text-[var(--text-secondary)]">
            {t("aiAnalyses.tracking.filters.to")}
          </label>
          <input
            id={`${id}-to`}
            type="date"
            className={fieldClass}
            value={state.to}
            min={state.from || undefined}
            onChange={(event) => update({ page: 1, to: event.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2 xl:col-span-1">
          <label className="flex h-10 items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              checked={state.mine}
              onChange={(event) => update({ mine: event.target.checked, page: 1 })}
            />
            {t("aiAnalyses.tracking.filters.mine")}
          </label>
          {isFiltered ? (
            <button
              type="button"
              className="clinical-button"
              onClick={() => update({ decision: "pending", from: "", mine: false, page: 1, status: "all", to: "" })}
            >
              <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
              {t("aiAnalyses.tracking.filters.reset")}
            </button>
          ) : null}
        </div>
      </form>

      {isVerificationRequiredError(query.error) ? (
        <VerificationRequiredNotice accountType={accountType} t={t} />
      ) : query.isLoading ? (
        <p className="surface-section p-5 text-sm text-[var(--text-secondary)]" aria-live="polite">
          {t("aiAnalyses.tracking.worklist.loading")}
        </p>
      ) : query.isError || !page ? (
        <p role="alert" className="surface-section p-5 text-sm text-[var(--danger-ink)]">
          {t("aiAnalyses.tracking.worklist.error")}
        </p>
      ) : page.items.length === 0 ? (
        <p className="surface-section p-6 text-center text-sm text-[var(--text-secondary)]">
          {state.decision === "pending" && !isFiltered
            ? t("aiAnalyses.tracking.worklist.emptyPending")
            : t("aiAnalyses.tracking.worklist.empty")}
        </p>
      ) : (
        <div className="surface-section p-4">
          <p className="mb-3 text-sm text-[var(--text-secondary)]" aria-live="polite">
            {t("aiAnalyses.tracking.worklist.total", { count: isolate(integer.format(page.total)) })}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <caption className="sr-only">{t("aiAnalyses.tracking.worklist.caption")}</caption>
              <thead>
                <tr className="border-b border-[var(--border)] text-xs text-[var(--text-secondary)]">
                  {(["date", "patient", "modelClass", "uncertain", "mask", "decision"] as const).map((column) => (
                    <th key={column} scope="col" className="py-2 pe-3 text-start font-medium">
                      {t(`aiAnalyses.tracking.worklist.columns.${column}`)}
                    </th>
                  ))}
                  <th scope="col" className="py-2 text-end font-medium">{t("aiAnalyses.tracking.worklist.columns.result")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-soft)]">
                {page.items.map((run) => {
                  const top = sortPredictions(run.predictions ?? [])[0] ?? null;
                  const decision = decisionCell(run, t);
                  const date = formatPatientDateTime(run.createdAt, locale);
                  const patientName = getPatientDisplayName(run.patient, locale);
                  const succeeded = run.status === "SUCCEEDED";
                  return (
                    <tr key={run.id} className="align-top">
                      <td className="py-2.5 pe-3 text-[var(--text-secondary)]">
                        <time dateTime={run.createdAt} className={MONO}>{date}</time>
                      </td>
                      <td className="py-2.5 pe-3">
                        <Link
                          href={`${roleBase}/patients/${encodeURIComponent(run.patient.id)}?tab=imaging`}
                          className="font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
                        >
                          <bdi>{patientName}</bdi>
                        </Link>
                      </td>
                      <td className="py-2.5 pe-3 text-[var(--text-primary)]">
                        {top ? (
                          <>
                            {t(`aiAnalyses.classes.${top.label}`)}{" "}
                            <bdi dir="ltr" className={`${MONO} text-[var(--text-secondary)]`}>{percent.format(top.probability)}</bdi>
                          </>
                        ) : (
                          t("aiAnalyses.tracking.worklist.none")
                        )}
                      </td>
                      <td className="py-2.5 pe-3">
                        {succeeded && top ? (
                          isUncertainProbability(top.probability) ? (
                            <StatusBadge
                              label={t("aiAnalyses.tracking.worklist.uncertainYes", { threshold: isolate(percent.format(UNCERTAINTY_THRESHOLD)) })}
                              tone="warning"
                            />
                          ) : (
                            <span className="text-[var(--text-secondary)]">{t("aiAnalyses.tracking.worklist.uncertainNo")}</span>
                          )
                        ) : (
                          t("aiAnalyses.tracking.worklist.none")
                        )}
                      </td>
                      <td className="py-2.5 pe-3 text-[var(--text-secondary)]">
                        {succeeded
                          ? run.hasMask
                            ? t("aiAnalyses.tracking.worklist.maskYes")
                            : t("aiAnalyses.tracking.worklist.maskNo")
                          : t("aiAnalyses.tracking.worklist.none")}
                      </td>
                      <td className="py-2.5 pe-3">
                        <span className="inline-flex items-center gap-1.5">
                          {decision.pending ? <Clock3 size={14} strokeWidth={1.8} aria-hidden="true" className="text-[var(--accent-dark)]" /> : null}
                          <StatusBadge label={decision.label} tone={decision.tone} />
                        </span>
                        {run.decisionStatus === "CORRECTED" && run.decisionLabel ? (
                          <p className="mt-1 text-xs text-[var(--text-primary)]">
                            {t("aiAnalyses.record.retained", { class: t(`aiAnalyses.classes.${run.decisionLabel}`) })}
                          </p>
                        ) : null}
                      </td>
                      <td className="py-2.5 text-end">
                        <Link
                          href={`${roleBase}/ai-analyses/runs/${encodeURIComponent(run.id)}?patient=${encodeURIComponent(run.patientId)}`}
                          aria-label={t("aiAnalyses.tracking.worklist.openFor", { date, patient: patientName })}
                          className="font-medium text-[var(--accent-dark)] underline-offset-2 hover:underline"
                        >
                          {t("aiAnalyses.tracking.worklist.open")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {page.totalPages > 1 ? (
            <nav aria-label={t("aiAnalyses.tracking.worklist.paginationLabel")} className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                className="clinical-button disabled:cursor-not-allowed disabled:opacity-50"
                disabled={page.page <= 1}
                onClick={() => update({ page: page.page - 1 })}
              >
                <ChevronLeft size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
                {t("aiAnalyses.tracking.worklist.previous")}
              </button>
              <p className={`text-sm text-[var(--text-secondary)] ${MONO}`} aria-current="page">
                {t("aiAnalyses.tracking.worklist.page", {
                  page: isolate(integer.format(page.page)),
                  pages: isolate(integer.format(page.totalPages)),
                })}
              </p>
              <button
                type="button"
                className="clinical-button disabled:cursor-not-allowed disabled:opacity-50"
                disabled={page.page >= page.totalPages}
                onClick={() => update({ page: page.page + 1 })}
              >
                {t("aiAnalyses.tracking.worklist.next")}
                <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
              </button>
            </nav>
          ) : null}
        </div>
      )}
    </section>
  );
}
