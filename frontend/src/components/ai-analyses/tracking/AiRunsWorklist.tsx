"use client";

import {
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileSearch,
  RotateCcw,
  ScanLine,
  SlidersHorizontal,
  UserRoundCheck,
} from "lucide-react";
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
  effectiveSort,
  isUncertainProbability,
  TRACKING_DECISIONS,
  TRACKING_PIPELINES,
  TRACKING_PRIORITIES,
  TRACKING_SORTS,
  TRACKING_STATUSES,
  type TrackingState,
  worklistParams,
} from "@/features/ai-analyses/runs-tracking";
import { formatPatientDateTime } from "@/features/patients/patient-registry";
import { type Locale } from "@/i18n";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { type TranslationFunction } from "@/lib/i18n";
import { type DashboardStatusTone } from "@/types/dashboard";

import { AiRunModelResult } from "../AiRunModelResult";
import { PriorityBadge } from "../PriorityBadge";
import { getPatientDisplayName } from "../wizard/PatientStep";

const MONO = "font-[family-name:var(--font-auth-mono)] tabular-nums";
const fieldClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

type AiRunsWorklistProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  locale: Locale;
  roleBase: string;
  state: TrackingState;
  t: TranslationFunction;
  update: (changes: Partial<TrackingState>) => void;
};

function decisionCell(run: AiRunListItem, t: TranslationFunction): { label: string; tone: DashboardStatusTone; pending: boolean } {
  if (run.status !== "SUCCEEDED") {
    return { label: t(`aiAnalyses.tracking.filters.statuses.${run.status}`), pending: false, tone: "neutral" };
  }
  if (run.decisionStatus === null) {
    return { label: t("aiAnalyses.tracking.worklist.pending"), pending: true, tone: "info" };
  }
  return { label: t(`aiAnalyses.decision.statuses.${run.decisionStatus}`), pending: false, tone: decisionTones[run.decisionStatus] };
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toLocaleUpperCase() || "?";
}

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
    state.pipeline !== DEFAULT_TRACKING_STATE.pipeline ||
    state.priority !== DEFAULT_TRACKING_STATE.priority ||
    Boolean(state.from) ||
    Boolean(state.to) ||
    state.mine;
  const activeFilterCount = [
    state.decision !== DEFAULT_TRACKING_STATE.decision,
    state.status !== DEFAULT_TRACKING_STATE.status,
    state.pipeline !== DEFAULT_TRACKING_STATE.pipeline,
    state.priority !== DEFAULT_TRACKING_STATE.priority,
    Boolean(state.from),
    Boolean(state.to),
    state.mine,
  ].filter(Boolean).length;

  const resetFilters = () => update({
    decision: "pending",
    from: "",
    mine: false,
    page: 1,
    pipeline: "all",
    priority: "all",
    status: "all",
    to: "",
  });

  const getRunView = (run: AiRunListItem) => {
    const top = sortPredictions(run.predictions ?? [])[0] ?? null;
    return {
      date: formatPatientDateTime(run.createdAt, locale),
      decision: decisionCell(run, t),
      patientName: getPatientDisplayName(run.patient, locale),
      succeeded: run.status === "SUCCEEDED",
      top,
    };
  };

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5">
      <h2 id={`${id}-title`} className="sr-only">{t("aiAnalyses.tracking.tabs.worklist")}</h2>

      <form
        aria-label={t("aiAnalyses.tracking.filters.label")}
        className="surface-section grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 xl:grid-cols-4"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line-soft)] pb-4 sm:col-span-2 lg:col-span-3 xl:col-span-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent-dark)] ring-1 ring-[var(--accent-line)]">
              <SlidersHorizontal className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">{t("aiAnalyses.tracking.filters.label")}</p>
              <p className="mt-0.5 text-xs text-[var(--ink-faint)]">{t("aiAnalyses.tracking.worklist.caption")}</p>
            </div>
          </div>
          {isFiltered ? (
            <button type="button" className="clinical-button min-h-9" onClick={resetFilters}>
              <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
              {t("aiAnalyses.tracking.filters.reset")}
              {activeFilterCount ? <span className="clinical-figure rounded bg-[var(--accent)] px-1.5 py-0.5 text-[0.62rem] text-white">{integer.format(activeFilterCount)}</span> : null}
            </button>
          ) : null}
        </div>

        <label className="space-y-1.5" htmlFor={`${id}-decision`}>
          <span className="block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{t("aiAnalyses.tracking.filters.decision")}</span>
          <select id={`${id}-decision`} className={fieldClass} value={state.decision} onChange={(event) => update({ decision: event.target.value as TrackingState["decision"], page: 1 })}>
            {TRACKING_DECISIONS.map((decision) => <option key={decision} value={decision}>{t(`aiAnalyses.tracking.filters.decisions.${decision}`)}</option>)}
          </select>
        </label>

        <label className="space-y-1.5" htmlFor={`${id}-status`}>
          <span className="block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{t("aiAnalyses.tracking.filters.status")}</span>
          <select id={`${id}-status`} className={fieldClass} value={state.status} onChange={(event) => update({ page: 1, status: event.target.value as TrackingState["status"] })}>
            {TRACKING_STATUSES.map((status) => <option key={status} value={status}>{t(`aiAnalyses.tracking.filters.statuses.${status}`)}</option>)}
          </select>
        </label>

        <label className="space-y-1.5" htmlFor={`${id}-pipeline`}>
          <span className="block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{t("aiAnalyses.tracking.filters.pipeline")}</span>
          <select id={`${id}-pipeline`} className={fieldClass} value={state.pipeline} onChange={(event) => update({ page: 1, pipeline: event.target.value as TrackingState["pipeline"] })}>
            {TRACKING_PIPELINES.map((pipeline) => (
              <option key={pipeline} value={pipeline}>
                {pipeline === "all" ? t("aiAnalyses.tracking.filters.pipelines.all") : t(`aiAnalyses.pipelines.${pipeline}.name`)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5" htmlFor={`${id}-priority`}>
          <span className="block text-[0.7rem] font-semibold text-[var(--ink-soft)]">{t("aiAnalyses.priority.filter.label")}</span>
          <select id={`${id}-priority`} className={fieldClass} value={state.priority} onChange={(event) => update({ page: 1, priority: event.target.value as TrackingState["priority"] })}>
            {TRACKING_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority === "all" ? t("aiAnalyses.priority.filter.all") : t(`aiAnalyses.priority.levels.${priority}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5" htmlFor={`${id}-sort`}>
          <span className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-[var(--ink-soft)]"><ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />{t("aiAnalyses.priority.sort.label")}</span>
          {/* A priority filter lists that level in priority order: the sort cannot be changed under it. */}
          <select
            id={`${id}-sort`}
            className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-60`}
            disabled={state.priority !== "all"}
            title={state.priority !== "all" ? t("aiAnalyses.priority.sort.locked") : undefined}
            value={effectiveSort(state)}
            onChange={(event) => update({ page: 1, sort: event.target.value as TrackingState["sort"] })}
          >
            {TRACKING_SORTS.map((sort) => <option key={sort} value={sort}>{t(`aiAnalyses.priority.sort.${sort}`)}</option>)}
          </select>
        </label>

        <label className="space-y-1.5" htmlFor={`${id}-from`}>
          <span className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-[var(--ink-soft)]"><CalendarDays className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />{t("aiAnalyses.tracking.filters.from")}</span>
          <input id={`${id}-from`} type="date" className={fieldClass} value={state.from} max={state.to || undefined} onChange={(event) => update({ from: event.target.value, page: 1 })} />
        </label>

        <label className="space-y-1.5" htmlFor={`${id}-to`}>
          <span className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-[var(--ink-soft)]"><CalendarDays className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />{t("aiAnalyses.tracking.filters.to")}</span>
          <input id={`${id}-to`} type="date" className={fieldClass} value={state.to} min={state.from || undefined} onChange={(event) => update({ page: 1, to: event.target.value })} />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-soft)] px-4 py-3 sm:col-span-2 lg:col-span-3 xl:col-span-4">
          <span className="flex items-center gap-3 text-sm font-medium text-[var(--ink)]">
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--panel)] text-[var(--medical)] ring-1 ring-[var(--line)]"><UserRoundCheck className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /></span>
            {t("aiAnalyses.tracking.filters.mine")}
          </span>
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={state.mine} onChange={(event) => update({ mine: event.target.checked, page: 1 })} />
        </label>
      </form>

      {isVerificationRequiredError(query.error) ? (
        <VerificationRequiredNotice accountType={accountType} t={t} />
      ) : query.isLoading ? (
        <div className="surface-section space-y-3 p-5" aria-live="polite">
          <p className="sr-only">{t("aiAnalyses.tracking.worklist.loading")}</p>
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-14 animate-pulse rounded-[var(--radius-sm)] bg-[var(--panel-soft)]" />)}
        </div>
      ) : query.isError || !page ? (
        <div role="alert" className="surface-section flex flex-col items-center px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger-ink)]"><FileSearch className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
          <p className="mt-4 text-sm font-semibold text-[var(--danger-ink)]">{t("aiAnalyses.tracking.worklist.error")}</p>
        </div>
      ) : page.items.length === 0 ? (
        <div className="surface-section flex flex-col items-center px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[var(--medical)]"><FileSearch className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" /></span>
          <p className="mt-4 text-sm font-semibold text-[var(--ink)]">
            {state.decision === "pending" && !isFiltered ? t("aiAnalyses.tracking.worklist.emptyPending") : t("aiAnalyses.tracking.worklist.empty")}
          </p>
          {isFiltered ? <button type="button" className="clinical-button mt-5" onClick={resetFilters}><RotateCcw className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("aiAnalyses.tracking.filters.reset")}</button> : null}
        </div>
      ) : (
        <div className="surface-section overflow-hidden" aria-busy={query.isFetching}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--medical-soft)] text-[var(--medical)]"><ScanLine className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)]">{t("aiAnalyses.tracking.tabs.worklist")}</h3>
                <p className="mt-0.5 text-xs text-[var(--ink-faint)]" aria-live="polite">{t("aiAnalyses.tracking.worklist.total", { count: isolate(integer.format(page.total)) })}</p>
              </div>
            </div>
            <span className="clinical-figure rounded-full border border-[var(--line)] bg-[var(--panel-soft)] px-3 py-1 text-xs font-medium text-[var(--ink-soft)]">
              {t("aiAnalyses.tracking.worklist.page", { page: isolate(integer.format(page.page)), pages: isolate(integer.format(page.totalPages)) })}
            </span>
          </header>

          <p role="note" className="border-b border-[var(--line-soft)] bg-[var(--panel-soft)] px-5 py-2.5 text-xs leading-5 text-[var(--ink-soft)] sm:px-6">
            {t("aiAnalyses.priority.disclaimer")}
          </p>

          <div className="grid gap-3 p-4 lg:hidden">
            {page.items.map((run) => {
              const view = getRunView(run);
              return (
                <article key={run.id} className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)]">
                  <div className="flex items-start gap-3 border-b border-[var(--line-soft)] p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--medical-soft)] text-xs font-semibold text-[var(--medical)] ring-1 ring-[var(--accent-line)]">{getInitials(view.patientName)}</span>
                    <div className="min-w-0 flex-1">
                      <Link href={`${roleBase}/patients/${encodeURIComponent(run.patient.id)}?tab=imaging`} className="block truncate text-sm font-semibold text-[var(--ink)] hover:text-[var(--accent-dark)] hover:underline">{view.patientName}</Link>
                      <time dateTime={run.createdAt} className={`${MONO} mt-1 block text-xs text-[var(--ink-faint)]`}>{view.date}</time>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <PriorityBadge locale={locale} priority={run.priority} t={t} />
                      <StatusBadge label={view.decision.label} tone={view.decision.tone} />
                    </div>
                  </div>
                  <dl className="grid gap-4 p-4 sm:grid-cols-2">
                    <div><dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-faint)]">{t("aiAnalyses.tracking.worklist.columns.pipeline")}</dt><dd className="mt-1 text-sm text-[var(--ink-soft)]">{t(`aiAnalyses.pipelines.${run.pipeline}.name`)}</dd></div>
                    <div><dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-faint)]">{t("aiAnalyses.tracking.worklist.columns.modelClass")}</dt><dd className="mt-1 text-sm text-[var(--ink)]"><AiRunModelResult empty={t("aiAnalyses.tracking.worklist.none")} figureClassName="text-[var(--ink-faint)]" locale={locale} run={run} t={t} /></dd></div>
                    <div><dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-faint)]">{t("aiAnalyses.tracking.worklist.columns.uncertain")}</dt><dd className="mt-1 text-sm text-[var(--ink-soft)]">{view.succeeded && view.top ? (isUncertainProbability(view.top.probability) ? <StatusBadge label={t("aiAnalyses.tracking.worklist.uncertainYes", { threshold: isolate(percent.format(UNCERTAINTY_THRESHOLD)) })} tone="warning" /> : t("aiAnalyses.tracking.worklist.uncertainNo")) : t("aiAnalyses.tracking.worklist.none")}</dd></div>
                    <div><dt className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--ink-faint)]">{t("aiAnalyses.tracking.worklist.columns.mask")}</dt><dd className="mt-1 text-sm text-[var(--ink-soft)]">{view.succeeded ? (run.hasMask ? t("aiAnalyses.tracking.worklist.maskYes") : t("aiAnalyses.tracking.worklist.maskNo")) : t("aiAnalyses.tracking.worklist.none")}</dd></div>
                  </dl>
                  <div className="border-t border-[var(--line-soft)] bg-[var(--panel-soft)] p-3">
                    <Link href={`${roleBase}/ai-analyses/runs/${encodeURIComponent(run.id)}?patient=${encodeURIComponent(run.patientId)}`} className="clinical-button w-full bg-[var(--panel)]" aria-label={t("aiAnalyses.tracking.worklist.openFor", { date: view.date, patient: view.patientName })}><Eye className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("aiAnalyses.tracking.worklist.open")}</Link>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[72rem] text-sm">
              <caption className="sr-only">{t("aiAnalyses.tracking.worklist.caption")}</caption>
              <thead className="bg-[var(--panel-soft)]">
                <tr className="border-b border-[var(--line)] text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--ink-faint)]">
                  <th scope="col" className="px-4 py-3 text-start font-semibold">{t("aiAnalyses.priority.column")}</th>
                  {(["date", "patient", "pipeline", "modelClass", "uncertain", "mask", "decision"] as const).map((column) => <th key={column} scope="col" className="px-4 py-3 text-start font-semibold">{t(`aiAnalyses.tracking.worklist.columns.${column}`)}</th>)}
                  <th scope="col" className="px-4 py-3 text-end font-semibold">{t("aiAnalyses.tracking.worklist.columns.result")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-soft)]">
                {page.items.map((run) => {
                  const view = getRunView(run);
                  return (
                    <tr key={run.id} className="align-middle transition hover:bg-[var(--panel-soft)]">
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <PriorityBadge locale={locale} priority={run.priority} t={t} />
                        {run.priority.level === "ROUTINE" ? <span className="text-[var(--ink-faint)]" aria-hidden="true">—</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[var(--ink-faint)]"><time dateTime={run.createdAt} className={MONO}>{view.date}</time></td>
                      <td className="px-4 py-3.5">
                        <Link href={`${roleBase}/patients/${encodeURIComponent(run.patient.id)}?tab=imaging`} className="flex items-center gap-2.5 font-medium text-[var(--ink)] hover:text-[var(--accent-dark)] hover:underline">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--medical-soft)] text-[0.65rem] font-semibold text-[var(--medical)]">{getInitials(view.patientName)}</span>
                          <bdi className="max-w-44 truncate">{view.patientName}</bdi>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-[var(--ink-soft)]">{t(`aiAnalyses.pipelines.${run.pipeline}.name`)}</td>
                      <td className="px-4 py-3.5 text-[var(--ink)]"><AiRunModelResult empty={t("aiAnalyses.tracking.worklist.none")} figureClassName="ms-1 text-xs text-[var(--ink-faint)]" locale={locale} run={run} t={t} /></td>
                      <td className="px-4 py-3.5">{view.succeeded && view.top ? (isUncertainProbability(view.top.probability) ? <StatusBadge label={t("aiAnalyses.tracking.worklist.uncertainYes", { threshold: isolate(percent.format(UNCERTAINTY_THRESHOLD)) })} tone="warning" /> : <span className="text-[var(--ink-soft)]">{t("aiAnalyses.tracking.worklist.uncertainNo")}</span>) : t("aiAnalyses.tracking.worklist.none")}</td>
                      <td className="px-4 py-3.5 text-[var(--ink-soft)]">{view.succeeded ? (run.hasMask ? t("aiAnalyses.tracking.worklist.maskYes") : t("aiAnalyses.tracking.worklist.maskNo")) : t("aiAnalyses.tracking.worklist.none")}</td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5">{view.decision.pending ? <Clock3 size={14} strokeWidth={1.8} aria-hidden="true" className="text-[var(--accent-dark)]" /> : null}<StatusBadge label={view.decision.label} tone={view.decision.tone} /></span>
                        {run.decisionStatus === "CORRECTED" && run.decisionLabel ? <p className="mt-1.5 text-xs text-[var(--ink-soft)]">{t("aiAnalyses.record.retained", { class: t(`aiAnalyses.classes.${run.decisionLabel}`) })}</p> : null}
                      </td>
                      <td className="px-4 py-3.5 text-end"><Link href={`${roleBase}/ai-analyses/runs/${encodeURIComponent(run.id)}?patient=${encodeURIComponent(run.patientId)}`} aria-label={t("aiAnalyses.tracking.worklist.openFor", { date: view.date, patient: view.patientName })} className="clinical-button min-h-9 whitespace-nowrap"><Eye className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />{t("aiAnalyses.tracking.worklist.open")}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {page.totalPages > 1 ? (
            <nav aria-label={t("aiAnalyses.tracking.worklist.paginationLabel")} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] bg-[var(--panel-soft)] px-4 py-3 sm:px-5">
              <button type="button" className="clinical-button bg-[var(--panel)] disabled:cursor-not-allowed disabled:opacity-50" disabled={page.page <= 1} onClick={() => update({ page: page.page - 1 })}><ChevronLeft size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />{t("aiAnalyses.tracking.worklist.previous")}</button>
              <p className={`text-sm text-[var(--ink-soft)] ${MONO}`} aria-current="page">{t("aiAnalyses.tracking.worklist.page", { page: isolate(integer.format(page.page)), pages: isolate(integer.format(page.totalPages)) })}</p>
              <button type="button" className="clinical-button bg-[var(--panel)] disabled:cursor-not-allowed disabled:opacity-50" disabled={page.page >= page.totalPages} onClick={() => update({ page: page.page + 1 })}>{t("aiAnalyses.tracking.worklist.next")}<ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" /></button>
            </nav>
          ) : null}
        </div>
      )}
    </section>
  );
}
