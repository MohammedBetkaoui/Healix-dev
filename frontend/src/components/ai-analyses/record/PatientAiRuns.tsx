"use client";

import { BrainCircuit, Clock3, Plus } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { type AiAnalysisRun } from "@/features/ai-analyses/ai-analyses.types";
import { useAiAnalysisRuns } from "@/features/ai-analyses/hooks/use-ai-analysis-runs";
import { decisionTones, getDisplayedLabel, getLatestRetainedRun } from "@/features/ai-analyses/run-decision";
import { sortPredictions } from "@/features/ai-analyses/run-presentation";
import { formatPatientDateTime } from "@/features/patients/patient-registry";
import { type Locale } from "@/i18n";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type DashboardStatusTone } from "@/types/dashboard";

type AccountType = "DOCTOR" | "ESTABLISHMENT";

const roleBaseOf = (accountType: AccountType) => (accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor");

export function getNewAiAnalysisHref(accountType: AccountType, patientId: string) {
  return `${roleBaseOf(accountType)}/ai-analyses/new?pipeline=brain&patient=${encodeURIComponent(patientId)}`;
}

function getRunHref(accountType: AccountType, patientId: string, runId: string) {
  return `${roleBaseOf(accountType)}/ai-analyses/runs/${encodeURIComponent(runId)}?patient=${encodeURIComponent(patientId)}`;
}

// Decision column: the decision for a SUCCEEDED run ("non validé" until
// then), the run state otherwise (nothing to decide).
function getDecisionState(run: AiAnalysisRun, t: TranslationFunction): { label: string; pending: boolean; tone: DashboardStatusTone } {
  if (run.status !== "SUCCEEDED") {
    return { label: t(`aiAnalyses.record.runStatuses.${run.status}`), pending: false, tone: "neutral" };
  }
  if (run.decisionStatus === null) {
    return { label: t("aiAnalyses.record.notValidated"), pending: true, tone: "info" };
  }
  return {
    label: t(`aiAnalyses.decision.statuses.${run.decisionStatus}`),
    pending: false,
    tone: decisionTones[run.decisionStatus],
  };
}

type PatientAiRunsSectionProps = {
  accountType: AccountType;
  hasSignedAiConsent: boolean;
  locale: Locale;
  patientId: string;
  t: TranslationFunction;
  title: string;
};

/** Imaging tab of the patient record: the patient's AI analysis runs. */
export function PatientAiRunsSection({ accountType, hasSignedAiConsent, locale, patientId, t, title }: PatientAiRunsSectionProps) {
  const runsQuery = useAiAnalysisRuns(patientId);
  const runs = runsQuery.data ?? [];
  const percent = new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : "fr-DZ", { maximumFractionDigits: 1, style: "percent" });

  return (
    <section aria-labelledby="patient-ai-runs" className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrainCircuit className="h-5 w-5 text-[var(--accent-dark)]" strokeWidth={1.7} aria-hidden="true" />
          <h2 id="patient-ai-runs" className="font-[var(--font-auth-display)] text-xl font-medium text-[var(--ink)]">{title}</h2>
        </div>
        <Link href={getNewAiAnalysisHref(accountType, patientId)} className="clinical-button clinical-button-primary">
          <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
          {t("aiAnalyses.record.newAnalysis")}
        </Link>
      </div>

      {hasSignedAiConsent ? null : (
        <p className="mt-4 text-sm text-[var(--ink-soft)]">{t("aiAnalyses.record.consentMissing")}</p>
      )}

      {isVerificationRequiredError(runsQuery.error) ? (
        <div className="mt-5"><VerificationRequiredNotice accountType={accountType} t={t} /></div>
      ) : runsQuery.isLoading ? (
        <p className="mt-5 text-sm text-[var(--ink-faint)]" aria-live="polite">{t("aiAnalyses.record.loading")}</p>
      ) : runsQuery.isError ? (
        <p role="alert" className="mt-5 text-sm text-[var(--danger-ink)]">{t("aiAnalyses.record.error")}</p>
      ) : runs.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--ink-faint)]">{t("aiAnalyses.record.empty")}</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">{t("aiAnalyses.record.caption")}</caption>
            <thead>
              <tr className="border-b border-[var(--line)] text-start font-[var(--font-auth-mono)] text-[0.6rem] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t("aiAnalyses.record.columns.date")}</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t("aiAnalyses.record.columns.pipeline")}</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t("aiAnalyses.record.columns.topClass")}</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t("aiAnalyses.record.columns.mask")}</th>
                <th scope="col" className="py-2 pe-3 text-start font-medium">{t("aiAnalyses.record.columns.decision")}</th>
                <th scope="col" className="py-2 text-end font-medium">{t("aiAnalyses.record.columns.result")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {runs.map((run) => {
                const top = sortPredictions(run.predictions ?? [])[0];
                const decision = getDecisionState(run, t);
                const displayed = getDisplayedLabel(run);
                const isRejected = run.decisionStatus === "REJECTED";
                const date = formatPatientDateTime(run.createdAt, locale);
                // A rejected run stays listed, struck through, with its "Rejeté" badge.
                const struck = cn(isRejected && "line-through decoration-[color:var(--danger)] decoration-2 text-[var(--ink-faint)]");

                return (
                  <tr key={run.id} className="align-top">
                    <td className={cn("py-3 pe-3 text-[var(--ink-soft)]", struck)}>
                      <time dateTime={run.createdAt}>{date}</time>
                    </td>
                    <td className={cn("py-3 pe-3 text-[var(--ink)]", struck)}>{t(`aiAnalyses.pipelines.${run.pipeline}.name`)}</td>
                    <td className={cn("py-3 pe-3 text-[var(--ink)]", struck)}>
                      {top ? (
                        <>
                          {t(`aiAnalyses.classes.${top.label}`)}{" "}
                          <bdi dir="ltr" className="font-[var(--font-auth-mono)] tabular-nums text-[var(--ink-soft)]">{percent.format(top.probability)}</bdi>
                        </>
                      ) : t("aiAnalyses.record.noClass")}
                    </td>
                    <td className={cn("py-3 pe-3 text-[var(--ink-soft)]", struck)}>
                      {run.hasMask ? t("aiAnalyses.record.maskYes") : t("aiAnalyses.record.maskNo")}
                    </td>
                    <td className="py-3 pe-3">
                      <span className="inline-flex items-center gap-1.5">
                        {decision.pending ? <Clock3 size={14} strokeWidth={1.8} aria-hidden="true" className="text-[var(--accent-dark)]" /> : null}
                        <StatusBadge label={decision.label} tone={decision.tone} />
                      </span>
                      {run.decisionStatus === "CORRECTED" && displayed.source === "physician" ? (
                        <p className="mt-1 text-xs font-medium text-[var(--ink)]">
                          {t("aiAnalyses.record.retained", { class: t(`aiAnalyses.classes.${displayed.label}`) })}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3 text-end">
                      <Link
                        href={getRunHref(accountType, patientId, run.id)}
                        aria-label={t("aiAnalyses.record.openFor", { date })}
                        className="text-sm font-medium text-[var(--accent-dark)] underline-offset-2 hover:underline"
                      >
                        {t("aiAnalyses.record.open")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type LatestRetainedAiRunProps = {
  accountType: AccountType;
  locale: Locale;
  patientId: string;
  t: TranslationFunction;
};

/** Record summary: the class the physician retained on the latest validated or corrected run. */
export function LatestRetainedAiRun({ accountType, locale, patientId, t }: LatestRetainedAiRunProps) {
  const runsQuery = useAiAnalysisRuns(patientId);
  const latest = getLatestRetainedRun(runsQuery.data ?? []);

  if (isVerificationRequiredError(runsQuery.error)) {
    return <p className="mt-1 text-sm text-[var(--ink-soft)]">{t("common.verificationRequired.title")}</p>;
  }
  if (runsQuery.isLoading) {
    return <p className="mt-1 text-sm text-[var(--ink-faint)]">{t("aiAnalyses.record.loading")}</p>;
  }
  if (runsQuery.isError) {
    return <p className="mt-1 text-sm text-[var(--danger-ink)]">{t("aiAnalyses.record.error")}</p>;
  }

  const displayed = latest ? getDisplayedLabel(latest) : null;
  if (!latest || latest.decisionStatus === null || latest.decisionStatus === "REJECTED" || displayed?.source !== "physician") {
    return <p className="mt-1 text-sm font-medium text-[var(--ink)]">{t("aiAnalyses.record.latest.none")}</p>;
  }

  return (
    <div className="mt-1 space-y-1">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--ink)]">
        {t(`aiAnalyses.classes.${displayed.label}`)}
        <StatusBadge label={t(`aiAnalyses.decision.statuses.${latest.decisionStatus}`)} tone={decisionTones[latest.decisionStatus]} />
      </p>
      <p className="text-xs text-[var(--ink-faint)]">
        {t(`aiAnalyses.record.latest.${latest.decisionStatus}`, {
          date: formatPatientDateTime(latest.createdAt, locale),
          doctor: latest.decidedByName ?? t("aiAnalyses.decision.unknownDoctor"),
        })}
        {" · "}
        <Link href={getRunHref(accountType, patientId, latest.id)} className="font-medium text-[var(--accent-dark)] underline-offset-2 hover:underline">
          {t("aiAnalyses.record.latest.open")}
        </Link>
      </p>
    </div>
  );
}
