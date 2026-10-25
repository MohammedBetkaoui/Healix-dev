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
import { findModel, findPipeline, pipelineLimitations } from "@/features/ai-analyses/ai-models.registry";
import {
  useAiAnalysisRun,
  useAiAnalysisRunMask,
  useAiAnalysisRunOverlay,
  useAiAnalysisRunSlice,
} from "@/features/ai-analyses/hooks/use-ai-analysis-run";
import { limitationParams } from "@/features/ai-analyses/format-ai-metric";
import { getEcgPredictions, getRunErrorKey, shortSha256 } from "@/features/ai-analyses/run-presentation";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { formatPatientDateTime } from "@/features/patients/patient-registry";
import { usePatient } from "@/features/patients/hooks/use-patient";
import { usePatientDocumentView } from "@/features/patients/hooks/use-patient-document-view";
import { usePatientDocuments } from "@/features/patients/hooks/use-patient-documents";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { type AiAnalysisRun } from "@/features/ai-analyses/ai-analyses.types";
import { type TranslationFunction, useStoredLocale, useTranslation } from "@/lib/i18n";

import { getPatientDisplayName } from "../wizard/PatientStep";
import { AiRunDecisionBadge, AiRunDecisionPanel } from "./AiRunDecisionPanel";
import { AiRunReportSection } from "./AiRunReportSection";
import { BrainResult } from "./BrainResult";
import { BreastResult } from "./BreastResult";
import { CardioSegResult } from "./CardioSegResult";
import { CardioVolumeResult } from "./CardioVolumeResult";
import { EcgResult } from "./EcgResult";
import { NucleiResult } from "./NucleiResult";

// The ECG model, its weights, and the signal it read.
function EcgTraceability({ decimal, run, t }: { decimal: Intl.NumberFormat; run: AiAnalysisRun; t: TranslationFunction }) {
  const model = findModel(run.classificationModelId);
  const ecg = getEcgPredictions(run);
  return (
    <>
      <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.model")}</dt>
      <dd className="break-words">{model ? t(`aiAnalyses.models.${model.id}.name`) : run.classificationModelId ?? t("aiAnalyses.run.none")}</dd>
      <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.weights")}</dt>
      <dd><bdi dir="ltr" className="font-[var(--font-auth-mono)]">{shortSha256(run.classificationWeightsSha256) ?? t("aiAnalyses.run.none")}</bdi></dd>
      <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.inputSamplingRate")}</dt>
      <dd>{ecg ? <bdi dir="ltr">{t("aiAnalyses.run.hertz", { value: ecg.inputSamplingRate })}</bdi> : t("aiAnalyses.run.none")}</dd>
      <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.signalDuration")}</dt>
      <dd>{ecg ? <bdi dir="ltr">{t("aiAnalyses.run.seconds", { value: decimal.format(ecg.durationSeconds) })}</bdi> : t("aiAnalyses.run.none")}</dd>
      <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.windows")}</dt>
      <dd>{ecg ? ecg.windows : t("aiAnalyses.run.none")}</dd>
    </>
  );
}

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
  // An ECG's source is a signal file: its trace is fetched by EcgResult.
  const imageQuery = usePatientDocumentView(patientId, run?.sourceDocumentId ?? null, {
    enabled:
      run?.status === "SUCCEEDED" &&
      run.pipeline !== "cardio-ecg" &&
      run.pipeline !== "cardio-seg-mri" &&
      // The source of a cine is an archive of its images, shown slice by slice by its result.
      run.pipeline !== "cardio-volume-mri",
  });
  // The brain mask is shown at once; a nuclei map shows its colour overlay
  // (its label map is fetched by NucleiResult, only to hide types).
  const maskQuery = useAiAnalysisRunMask(patientId, runId, { enabled: run?.hasMask === true && run.pipeline === "brain" });
  const overlayQuery = useAiAnalysisRunOverlay(patientId, runId, { enabled: run?.hasOverlay === true });
  const sliceQuery = useAiAnalysisRunSlice(patientId, runId, {
    enabled: run?.hasSlice === true && run.pipeline === "cardio-seg-mri",
  });

  const verificationRequired = [
    runQuery.error,
    patientQuery.error,
    documentsQuery.error,
    imageQuery.error,
    maskQuery.error,
    overlayQuery.error,
    sliceQuery.error,
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
  // Everything chain-specific (title, link, colour, content) follows run.pipeline.
  const pipeline = findPipeline(run?.pipeline);
  const classifier = findModel(run?.classificationModelId);
  const segmenter = findModel(run?.segmentationModelId);
  const usedModels = [classifier, segmenter].filter((model) => model !== undefined);
  const limitations = pipelineLimitations(run?.pipeline, usedModels);
  const intlLocale = locale === "ar" ? "ar-DZ" : "fr-DZ";
  const decimal = new Intl.NumberFormat(intlLocale, { maximumFractionDigits: 2 });
  const imageName = sourceDocument?.fileName ?? run?.sourceDocumentId ?? "image";
  const imageProps = { imageBlob: imageQuery.data ?? null, imageError: imageQuery.isError, imageName, locale, t };

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
                {run.status !== "REJECTED_INPUT"
                  ? t("aiAnalyses.run.failedTitle")
                  : run.pipeline === "cardio-ecg"
                    ? t("aiAnalyses.run.rejectedSignalTitle")
                    : t("aiAnalyses.run.rejectedTitle")}
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
        {run.pipeline === "cardio-ecg" ? (
          <EcgResult locale={locale} patientId={patientId} run={run} t={t} />
        ) : run.pipeline === "cardio-volume-mri" ? (
          <CardioVolumeResult locale={locale} patientId={patientId} run={run} t={t} />
        ) : run.pipeline === "cardio-seg-mri" ? (
          <CardioSegResult
            locale={locale}
            overlayBlob={overlayQuery.data}
            patientId={patientId}
            run={run}
            sliceBlob={sliceQuery.data}
            sliceError={sliceQuery.isError || !run.hasSlice}
            t={t}
          />
        ) : run.pipeline === "pathology-breast" ? (
          <BreastResult {...imageProps} run={run} />
        ) : run.pipeline === "pathology-nuclei" ? (
          <NucleiResult {...imageProps} overlayBlob={overlayQuery.data} patientId={patientId} run={run} />
        ) : (
          <BrainResult {...imageProps} maskBlob={maskQuery.data} run={run} />
        )}

        <AiRunDecisionPanel locale={locale} patientId={patientId} run={run} t={t} />

        <AiRunReportSection patientId={patientId} run={run} t={t} />

        <div className="grid gap-5 lg:grid-cols-2">
          <section aria-labelledby="ai-run-traceability" className="surface-section p-5">
            <h2 id="ai-run-traceability" className="text-base font-semibold text-[var(--text-primary)]">
              {t("aiAnalyses.run.traceability")}
            </h2>
            <dl className="mt-3 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.pipeline")}</dt>
              <dd className="break-words">{t(`aiAnalyses.pipelines.${run.pipeline}.name`)}</dd>
              {run.pipeline === "brain" ? (
                <>
                  <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.classificationModel")}</dt>
                  <dd className="break-words">{classifier ? t(`aiAnalyses.models.${classifier.id}.name`) : run.classificationModelId}</dd>
                  <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.weights")}</dt>
                  <dd><bdi dir="ltr" className="font-[var(--font-auth-mono)]">{shortSha256(run.classificationWeightsSha256) ?? t("aiAnalyses.run.none")}</bdi></dd>
                  <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.segmentationModel")}</dt>
                  <dd className="break-words">{segmenter ? t(`aiAnalyses.models.${segmenter.id}.name`) : run.segmentationModelId ?? t("aiAnalyses.run.none")}</dd>
                  <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.weights")}</dt>
                  <dd><bdi dir="ltr" className="font-[var(--font-auth-mono)]">{shortSha256(run.segmentationWeightsSha256) ?? t("aiAnalyses.run.none")}</bdi></dd>
                </>
              ) : run.pipeline === "cardio-ecg" ? (
                <EcgTraceability decimal={decimal} run={run} t={t} />
              ) : run.pipeline === "cardio-seg-mri" || run.pipeline === "cardio-volume-mri" ? (
                <>
                  <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.model")}</dt>
                  <dd className="break-words">
                    {segmenter ? t(`aiAnalyses.models.${segmenter.id}.name`) : run.segmentationModelId ?? t("aiAnalyses.run.none")}
                  </dd>
                  <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.weights")}</dt>
                  <dd>
                    <bdi dir="ltr" className="font-[var(--font-auth-mono)]">
                      {shortSha256(run.segmentationWeightsSha256) ?? t("aiAnalyses.run.none")}
                    </bdi>
                  </dd>
                </>
              ) : (
                // One model per pathology chain: the classifier (breast) or the segmenter (nuclei).
                <>
                  <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.model")}</dt>
                  <dd className="break-words">
                    {usedModels[0] ? t(`aiAnalyses.models.${usedModels[0].id}.name`) : run.classificationModelId ?? run.segmentationModelId ?? t("aiAnalyses.run.none")}
                  </dd>
                  <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.weights")}</dt>
                  <dd>
                    <bdi dir="ltr" className="font-[var(--font-auth-mono)]">
                      {shortSha256(run.classificationWeightsSha256 ?? run.segmentationWeightsSha256) ?? t("aiAnalyses.run.none")}
                    </bdi>
                  </dd>
                  <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.run.magnification")}</dt>
                  <dd>
                    {run.magnification === null
                      ? t("aiAnalyses.run.none")
                      : <bdi dir="ltr">{t("aiAnalyses.run.magnificationValue", { value: run.magnification })}</bdi>}
                  </dd>
                </>
              )}
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
                <li key={limitation}>{t(`aiAnalyses.limitations.${limitation}`, limitationParams(limitation, locale))}</li>
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
            <h1 className="break-words">{pipeline ? t(`aiAnalyses.pipelines.${pipeline.id}.name`) : t("aiAnalyses.run.breadcrumb")}</h1>
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
            {run && pipeline ? (
              <Link
                href={`${roleBase}/ai-analyses/new?pipeline=${encodeURIComponent(pipeline.id)}&patient=${encodeURIComponent(patientId)}`}
                className="clinical-button clinical-button-primary"
              >
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
