"use client";

import { AlertTriangle, ArrowLeft, Clock3, RefreshCw, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { isAxiosError } from "axios";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import {
  doctorNavSections,
  establishmentNavSections,
} from "@/components/dashboard/layout/navigation";
import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { findModel } from "@/features/ai-analyses/ai-models.registry";
import {
  useAiAnalysisRun,
  useAiAnalysisRunMask,
} from "@/features/ai-analyses/hooks/use-ai-analysis-run";
import {
  getGliomaMissedShare,
  getRunErrorKey,
  getTopLabel,
  shortSha256,
  shouldWarnGliomaRecall,
  sortPredictions,
} from "@/features/ai-analyses/run-presentation";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { formatPatientDateTime } from "@/features/patients/patient-registry";
import { usePatient } from "@/features/patients/hooks/use-patient";
import { usePatientDocumentView } from "@/features/patients/hooks/use-patient-document-view";
import { usePatientDocuments } from "@/features/patients/hooks/use-patient-documents";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";

import { ImageViewer } from "../viewer/ImageViewer";
import { getPatientDisplayName } from "../wizard/PatientStep";
import { AiRunDecisionBadge, AiRunDecisionPanel } from "./AiRunDecisionPanel";

type AiAnalysisRunPageProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  patientId: string;
  runId: string;
};

export function AiAnalysisRunPage({ accountType, patientId, runId }: AiAnalysisRunPageProps) {
  const { locale } = useStoredLocale();
  const { t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  const prefill = useEstablishmentVerificationPrefill({ enabled: accountType === "ESTABLISHMENT" });
  const initials = getAccountInitials(currentUser.data?.fullName);
  const roleBase = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";

  const runQuery = useAiAnalysisRun(patientId, runId);
  const patientQuery = usePatient(patientId);
  const documentsQuery = usePatientDocuments(patientId);
  const run = runQuery.data;
  const sourceDocument = (documentsQuery.data ?? []).find((document) => document.id === run?.sourceDocumentId) ?? null;
  const imageQuery = usePatientDocumentView(patientId, run?.sourceDocumentId ?? null, {
    enabled: run?.status === "SUCCEEDED",
  });
  const maskQuery = useAiAnalysisRunMask(patientId, runId, { enabled: run?.hasMask === true });

  const verificationRequired = [
    runQuery.error,
    patientQuery.error,
    documentsQuery.error,
    imageQuery.error,
    maskQuery.error,
  ].some(isVerificationRequiredError);

  const shellProps = accountType === "ESTABLISHMENT"
    ? {
        accountType: "ESTABLISHMENT" as const,
        navSections: establishmentNavSections,
        user: { accountType: "ESTABLISHMENT" as const, footerSubtitle: t("dashboard.clinical.administration"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.administration"), roleKey: "dashboard.common.roles.establishment", workspaceSubtitle: prefill.data?.establishment.name || t("dashboard.clinical.workspace") },
      }
    : {
        accountType: "INDEPENDENT_DOCTOR" as const,
        navSections: doctorNavSections,
        user: { accountType: "INDEPENDENT_DOCTOR" as const, footerSubtitle: t("dashboard.clinical.doctor.practice"), initials, name: currentUser.data?.fullName || t("dashboard.clinical.doctor.workspace"), roleKey: "dashboard.common.roles.doctor", workspaceSubtitle: t("dashboard.clinical.doctor.workspace") },
      };

  const patientName = patientQuery.data
    ? getPatientDisplayName(patientQuery.data, locale)
    : patientId;
  const predictions = sortPredictions(run?.predictions ?? []);
  const topLabel = getTopLabel(predictions);
  const classifier = findModel(run?.classificationModelId);
  const segmenter = findModel(run?.segmentationModelId);
  const missedGliomaShare = run?.classificationModelId
    ? getGliomaMissedShare(run.classificationModelId)
    : null;
  const usedModels = [classifier, segmenter].filter((model) => model !== undefined);
  const limitations = [...new Set(usedModels.flatMap((model) => model.knownLimitations))];
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const percent = new Intl.NumberFormat(intlLocale, { style: "percent", maximumFractionDigits: 1 });
  const integer = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2 });
  const imageName = sourceDocument?.fileName ?? run?.sourceDocumentId ?? "image";

  const content = () => {
    if (verificationRequired) {
      return <VerificationRequiredNotice accountType={accountType} t={t} />;
    }

    if (runQuery.isLoading) {
      return (
        <section className="surface-section flex items-center gap-3 p-5 text-sm text-[var(--text-secondary)]" aria-live="polite">
          <RefreshCw size={18} className="animate-spin" aria-hidden="true" />
          {t("aiAnalyses.run.loading")}
        </section>
      );
    }

    if (runQuery.isError || !run) {
      const isNotFound = isAxiosError(runQuery.error) && runQuery.error.response?.status === 404;
      return (
        <section role="alert" className="surface-section border-s-[3px] border-s-[color:var(--danger)] p-5">
          <h2 className="font-semibold text-[var(--danger-ink)]">
            {isNotFound ? t("aiAnalyses.run.notFound") : t("aiAnalyses.run.loadError")}
          </h2>
        </section>
      );
    }

    if (run.status === "RUNNING") {
      return (
        <section className="surface-section flex items-start gap-3 p-5" aria-live="polite">
          <Clock3 size={20} className="mt-0.5 shrink-0 text-[var(--warning-ink)]" aria-hidden="true" />
          <p className="text-sm text-[var(--text-primary)]">{t("aiAnalyses.run.running")}</p>
        </section>
      );
    }

    if (run.status === "FAILED" || run.status === "REJECTED_INPUT") {
      return (
        <section role="alert" className="surface-section border-s-[3px] border-s-[color:var(--danger)] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[var(--danger-ink)]" aria-hidden="true" />
            <div>
              <h2 className="font-semibold text-[var(--danger-ink)]">
                {run.status === "REJECTED_INPUT" ? t("aiAnalyses.run.rejectedTitle") : t("aiAnalyses.run.failedTitle")}
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {t(`aiAnalyses.run.errors.${getRunErrorKey(run.errorCode)}`)}
              </p>
            </div>
          </div>
        </section>
      );
    }

    return (
      <>
        {shouldWarnGliomaRecall(topLabel) && missedGliomaShare !== null ? (
          <div role="note" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-s-[3px] border-[var(--warning-line)] border-s-[color:var(--warning)] bg-[var(--warning-soft)] px-4 py-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--warning-ink)]" aria-hidden="true" />
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {t("aiAnalyses.run.gliomaWarning", {
                class: topLabel ? t(`aiAnalyses.classes.${topLabel}`) : "",
                share: percent.format(missedGliomaShare),
              })}
            </p>
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.8fr)]">
          <section aria-labelledby="ai-run-image" className="min-w-0">
            <h2 id="ai-run-image" className="mb-3 text-base font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.image")}
            </h2>
            <ImageViewer
              blob={imageQuery.data ?? null}
              fileName={imageName}
              module="brain"
              overlay={maskQuery.data ? { color: "var(--ai-module-color)", opacity: 0.4, src: maskQuery.data } : undefined}
              placeholder={imageQuery.isError ? t("aiAnalyses.run.imageError") : t("aiAnalyses.run.imageLoading")}
              t={t}
            />
          </section>

          <div className="space-y-5">
            <section aria-labelledby="ai-run-probabilities" className="surface-section p-5">
              <h2 id="ai-run-probabilities" className="text-base font-semibold text-[var(--text-primary)]">
                {t("aiAnalyses.run.probabilities")}
              </h2>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{t("aiAnalyses.run.probabilitiesHint")}</p>
              <ol className="mt-4 space-y-3">
                {predictions.map((prediction, index) => (
                  <li key={prediction.label}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className={index === 0 ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>
                        {t(`aiAnalyses.classes.${prediction.label}`)}
                        {index === 0 ? <span className="ms-2 text-xs font-medium text-[var(--medical)]">— {t("aiAnalyses.run.topClass")}</span> : null}
                      </span>
                      <bdi dir="ltr" className="font-[var(--font-auth-mono)] tabular-nums text-[var(--text-primary)]">
                        {percent.format(prediction.probability)}
                      </bdi>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--line-soft)]" dir="ltr">
                      <div
                        className="h-full rounded-full bg-[var(--specialty-brain)]"
                        style={{ width: `${Math.max(0, Math.min(100, prediction.probability * 100))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="ai-run-segmentation" className="surface-section p-5">
              <h2 id="ai-run-segmentation" className="text-base font-semibold text-[var(--text-primary)]">
                {t("aiAnalyses.run.segmentation")}
              </h2>
              {run.hasMask && run.maskAreaPx !== null && run.maskAreaRatio !== null ? (
                <>
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-[var(--radius-sm)] border border-[var(--line-soft)] p-3">
                      <dt className="text-xs text-[var(--text-secondary)]">{t("aiAnalyses.run.areaPixelsLabel")}</dt>
                      <dd className="mt-1 font-[var(--font-auth-mono)] text-lg font-semibold tabular-nums">
                        {t("aiAnalyses.run.areaPx", { value: integer.format(run.maskAreaPx) })}
                      </dd>
                    </div>
                    <div className="rounded-[var(--radius-sm)] border border-[var(--line-soft)] p-3">
                      <dt className="text-xs text-[var(--text-secondary)]">{t("aiAnalyses.run.areaRatioLabel")}</dt>
                      <dd className="mt-1 font-[var(--font-auth-mono)] text-lg font-semibold tabular-nums">
                        {t("aiAnalyses.run.areaRatio", { value: percent.format(run.maskAreaRatio) })}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">{t("aiAnalyses.run.areaNote")}</p>
                </>
              ) : run.segmentationSkippedReason ? (
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  {t(`aiAnalyses.run.skipped.${run.segmentationSkippedReason}`)}
                </p>
              ) : (
                <p className="mt-3 text-sm text-[var(--text-secondary)]">{t("aiAnalyses.run.none")}</p>
              )}
            </section>
          </div>
        </div>

        <AiRunDecisionPanel locale={locale} patientId={patientId} run={run} t={t} />

        <div className="grid gap-5 lg:grid-cols-2">
          <section aria-labelledby="ai-run-traceability" className="surface-section p-5">
            <h2 id="ai-run-traceability" className="text-base font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.traceability")}
            </h2>
            <dl className="mt-3 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.classificationModel")}</dt>
              <dd className="break-words">{classifier ? t(`aiAnalyses.models.${classifier.id}.name`) : run.classificationModelId}</dd>
              <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.weights")}</dt>
              <dd><bdi dir="ltr" className="font-[var(--font-auth-mono)]">{shortSha256(run.classificationWeightsSha256) ?? t("aiAnalyses.run.none")}</bdi></dd>
              <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.segmentationModel")}</dt>
              <dd className="break-words">{segmenter ? t(`aiAnalyses.models.${segmenter.id}.name`) : run.segmentationModelId ?? t("aiAnalyses.run.none")}</dd>
              <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.weights")}</dt>
              <dd><bdi dir="ltr" className="font-[var(--font-auth-mono)]">{shortSha256(run.segmentationWeightsSha256) ?? t("aiAnalyses.run.none")}</bdi></dd>
              <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.duration")}</dt>
              <dd>{run.durationMs === null ? t("aiAnalyses.run.none") : t("aiAnalyses.run.durationValue", { value: decimal.format(run.durationMs / 1000) })}</dd>
              <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.runDate")}</dt>
              <dd>{formatPatientDateTime(run.createdAt, locale)}</dd>
              <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.runId")}</dt>
              <dd className="break-all font-[var(--font-auth-mono)] text-xs">{run.id}</dd>
            </dl>
          </section>

          <section aria-labelledby="ai-run-limitations" className="surface-section p-5">
            <h2 id="ai-run-limitations" className="text-base font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.limitations")}
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 ps-5 text-sm leading-6 text-[var(--text-secondary)]">
              {limitations.map((limitation) => (
                <li key={limitation}>{t(`aiAnalyses.limitations.${limitation}`)}</li>
              ))}
            </ul>
          </section>
        </div>

        <div role="note" className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-[var(--warning-ink)]" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{t("aiAnalyses.page.disclaimer")}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {run.decisionStatus === null
                ? t("aiAnalyses.run.noValidation")
                : t(`aiAnalyses.decision.recordNotes.${run.decisionStatus}`)}
            </p>
          </div>
        </div>
      </>
    );
  };

  return (
    <DashboardShell
      {...shellProps}
      activeKey="analyses"
      breadcrumbLabel={t("aiAnalyses.run.breadcrumb")}
      titleKey="aiAnalyses.page.title"
    >
      <div className="workspace-stack">
        <header className="workspace-intro">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium text-[var(--medical)]">{t("aiAnalyses.run.context")}</p>
            <h1 className="break-words">{t("aiAnalyses.pipelines.brain.name")}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {t("aiAnalyses.run.patient", { name: patientName })}
              {run ? <> · {t("aiAnalyses.run.date", { date: formatPatientDateTime(run.createdAt, locale) })}</> : null}
            </p>
            {run?.status === "SUCCEEDED" && !verificationRequired ? (
              <div className="mt-2">
                <AiRunDecisionBadge run={run} t={t} />
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {run ? (
              <Link href={`${roleBase}/ai-analyses/new?pipeline=brain&patient=${encodeURIComponent(patientId)}`} className="clinical-button clinical-button-primary">
                {t("aiAnalyses.run.newAnalysis")}
              </Link>
            ) : null}
            <Link href={`${roleBase}/ai-analyses`} className="clinical-button">
              <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
              {t("aiAnalyses.run.backToHub")}
            </Link>
          </div>
        </header>

        {content()}
      </div>
    </DashboardShell>
  );
}
