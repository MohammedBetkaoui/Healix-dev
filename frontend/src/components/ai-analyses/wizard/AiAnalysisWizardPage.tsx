"use client";

import { ArrowLeft, ArrowRight, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { DashboardShell } from "@/components/dashboard/layout/DashboardShell";
import {
  doctorNavSections,
  establishmentNavSections,
} from "@/components/dashboard/layout/navigation";
import { UploadPatientDocumentModal } from "@/components/patients/UploadPatientDocumentModal";
import { VerificationRequiredNotice } from "@/components/shared/VerificationRequiredNotice";
import { type AiPipelineId } from "@/features/ai-analyses/ai-analyses.types";
import { findModel, findPipeline } from "@/features/ai-analyses/ai-models.registry";
import { useCreateAiAnalysisRun } from "@/features/ai-analyses/hooks/use-create-ai-analysis-run";
import { useDebouncedValue } from "@/features/ai-analyses/hooks/use-debounced-value";
import { useAiModelsStatus } from "@/features/ai-analyses/hooks/use-ai-models-status";
import { useImageProbe } from "@/features/ai-analyses/hooks/use-image-probe";
import { evaluateQualityChecks, isDicomDocument } from "@/features/ai-analyses/quality-check";
import { getFailedRunId, getLaunchState } from "@/features/ai-analyses/run-presentation";
import { useCurrentUser } from "@/features/auth/hooks/use-current-user";
import { usePatient } from "@/features/patients/hooks/use-patient";
import { usePatientConsents } from "@/features/patients/hooks/use-patient-consents";
import { usePatientDocumentView } from "@/features/patients/hooks/use-patient-document-view";
import { usePatientDocuments } from "@/features/patients/hooks/use-patient-documents";
import { usePatients } from "@/features/patients/hooks/use-patients";
import { useEstablishmentVerificationPrefill } from "@/features/verification/hooks/use-establishment-verification-prefill";
import { isVerificationRequiredError } from "@/lib/api/api-error";
import { getAccountInitials } from "@/lib/format/get-account-initials";
import { useStoredLocale, useTranslation } from "@/lib/i18n";
import { type Patient, type PatientDocumentType } from "@/types/patient";

import { ImageStep } from "./ImageStep";
import { PatientStep, getPatientDisplayName, type ConsentState } from "./PatientStep";
import { QualityStep } from "./QualityStep";
import { ReadingStep } from "./ReadingStep";
import { WizardStepper } from "./WizardStepper";

const steps = ["patient", "image", "quality", "reading"] as const;
const imageDocumentTypes: readonly PatientDocumentType[] = ["MEDICAL_IMAGE", "DICOM"];

type AiAnalysisWizardPageProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  /** Already checked by the route (findPipeline). */
  pipelineId: AiPipelineId;
  /** ?patient= of the route, preselected when it is in the caller's scope. */
  initialPatientId?: string;
};

export function AiAnalysisWizardPage({ accountType, initialPatientId, pipelineId }: AiAnalysisWizardPageProps) {
  const router = useRouter();
  const { locale } = useStoredLocale();
  const { direction, t } = useTranslation(locale);
  const currentUser = useCurrentUser(undefined, { enabled: true });
  // Establishment name for the workspace subtitle; skipped for doctor
  // accounts (ESTABLISHMENT_ADMIN-only endpoint).
  const prefill = useEstablishmentVerificationPrefill({ enabled: accountType === "ESTABLISHMENT" });
  const initials = getAccountInitials(currentUser.data?.fullName);
  const pipeline = findPipeline(pipelineId);
  const model = findModel(pipeline?.classifierId);
  const roleBase = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";

  const [stepIndex, setStepIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [chosenPatient, setChosenPatient] = useState<Patient | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [impression, setImpression] = useState("");
  const [isUploadOpen, setUploadOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasNavigated = useRef(false);
  const modelsStatusQuery = useAiModelsStatus({ enabled: stepIndex === steps.length - 1 });

  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const patientsQuery = usePatients({ limit: 20, search: debouncedSearch || undefined });
  const preselected = usePatient(initialPatientId ?? "");
  const selectedPatient = chosenPatient ?? preselected.data ?? null;
  const patientId = selectedPatient?.id ?? "";
  const createRunMutation = useCreateAiAnalysisRun(patientId);
  const consentsQuery = usePatientConsents(patientId);

  const consentState: ConsentState = !selectedPatient
    ? "idle"
    : consentsQuery.isLoading
      ? "loading"
      : consentsQuery.isError
        ? "error"
        : (consentsQuery.data ?? []).some((consent) => consent.type === "DIAGNOSTIC_AI" && consent.status === "SIGNED")
          ? "signed"
          : "missing";

  // The record's documents are only listed once the AI consent is confirmed.
  const documentsQuery = usePatientDocuments(consentState === "signed" ? patientId : "");

  const imageDocuments = (documentsQuery.data ?? []).filter((document) => imageDocumentTypes.includes(document.type));
  const selectedDocument = imageDocuments.find((document) => document.id === documentId) ?? null;
  const isDicom = selectedDocument ? isDicomDocument(selectedDocument) : false;
  // Downloaded (and audited) only once the user reaches the checks; a DICOM
  // file is not displayed at this step, so it is not downloaded at all.
  const documentView = usePatientDocumentView(patientId, selectedDocument?.id ?? null, {
    enabled: stepIndex >= 2 && !isDicom,
  });
  const probe = useImageProbe({ blob: documentView.data, isDicom, isError: documentView.isError });
  const report = evaluateQualityChecks({
    acceptedFormats: model?.acceptedFormats ?? null,
    fileName: selectedDocument?.fileName ?? "",
    probe,
  });

  const verificationRequired = [
    patientsQuery.error,
    preselected.error,
    consentsQuery.error,
    documentsQuery.error,
    documentView.error,
    modelsStatusQuery.error,
    createRunMutation.error,
  ].some(isVerificationRequiredError);

  // Focus follows the step change (not the first render).
  useEffect(() => {
    if (hasNavigated.current) {
      headingRef.current?.focus();
    }
  }, [stepIndex]);

  const goTo = (index: number) => {
    hasNavigated.current = true;
    setStepIndex(index);
  };

  const selectPatient = (patient: Patient) => {
    if (patient.id !== selectedPatient?.id) {
      createRunMutation.reset();
      setChosenPatient(patient);
      setDocumentId(null);
      setImpression("");
    }
  };

  const selectDocument = (id: string) => {
    if (id !== documentId) {
      createRunMutation.reset();
      setDocumentId(id);
      setImpression("");
    }
  };

  const blockedReason =
    stepIndex === 0
      ? !selectedPatient
        ? t("aiAnalyses.wizard.patient.selectFirst")
        : consentState === "signed"
          ? null
          : consentState === "loading"
            ? t("aiAnalyses.wizard.patient.consentLoading")
            : consentState === "error"
              ? t("aiAnalyses.wizard.patient.consentError")
              : t("aiAnalyses.wizard.patient.consentMissing")
      : stepIndex === 1
        ? selectedDocument
          ? null
          : t("aiAnalyses.wizard.image.selectFirst")
        : stepIndex === 2
          ? report.canContinue
            ? null
            : report.checks.some((check) => check.status === "pending")
              ? t("aiAnalyses.wizard.quality.waiting")
              : t("aiAnalyses.wizard.quality.blocked")
          : null;

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

  if (!pipeline || !model) {
    return null;
  }

  const pipelineName = t(`aiAnalyses.pipelines.${pipeline.id}.name`);
  const step = steps[stepIndex];
  const blockedId = "ai-wizard-blocked";
  const launchState = getLaunchState(modelsStatusQuery, pipeline.classifierId);

  const launchAnalysis = () => {
    if (!selectedDocument || !patientId || launchState !== "ready") {
      return;
    }

    const resultHref = (runId: string) =>
      `${roleBase}/ai-analyses/runs/${encodeURIComponent(runId)}?patient=${encodeURIComponent(patientId)}`;
    const trimmedImpression = impression.trim();

    createRunMutation.mutate(
      {
        pipeline: pipeline.id,
        sourceDocumentId: selectedDocument.id,
        ...(trimmedImpression ? { clinicianImpression: trimmedImpression } : {}),
      },
      {
        onError: (error) => {
          const runId = getFailedRunId(error);
          if (runId) router.push(resultHref(runId));
        },
        onSuccess: (run) => router.push(resultHref(run.id)),
      },
    );
  };

  return (
    <DashboardShell
      {...shellProps}
      activeKey="analyses"
      breadcrumbLabel={t("aiAnalyses.wizard.breadcrumb")}
      titleKey="aiAnalyses.page.title"
    >
      <div className="workspace-stack">
        <header className="workspace-intro">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium text-[var(--medical)]">{t("aiAnalyses.wizard.context")}</p>
            <h1 className="break-words">{pipelineName}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {t(`aiAnalyses.modules.${model.module}.title`)}
              {" · "}
              {t(`aiAnalyses.models.${model.id}.name`)}
              {model.version ? <> · <bdi dir="ltr" className="font-[var(--font-auth-mono)]">v{model.version}</bdi></> : null}
            </p>
          </div>
          <Link href={`${roleBase}/ai-analyses`} className="clinical-button">
            <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
            {t("aiAnalyses.wizard.backToHub")}
          </Link>
        </header>

        <div
          role="note"
          className="flex items-start gap-3 rounded-[var(--radius-md)] border border-s-[3px] border-[var(--border)] border-s-[color:var(--warning)] bg-[var(--surface)] px-4 py-3"
        >
          <ShieldAlert size={18} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--warning-ink)]" />
          <p className="text-sm font-medium text-[var(--text-primary)]">{t("aiAnalyses.page.disclaimer")}</p>
        </div>

        {verificationRequired ? (
          <VerificationRequiredNotice accountType={accountType} t={t} />
        ) : (
          <>
            <WizardStepper current={stepIndex} onSelect={goTo} steps={steps} t={t} />

            <section aria-labelledby="ai-wizard-step-title" className="surface-section p-5">
              <div className="mb-5">
                <p className="clinical-caption">
                  {t("aiAnalyses.wizard.stepOf", { current: stepIndex + 1, total: steps.length })}
                </p>
                <h2 ref={headingRef} id="ai-wizard-step-title" tabIndex={-1} className="mt-1 text-lg font-semibold text-[var(--text-primary)] focus:outline-none">
                  {t(`aiAnalyses.wizard.${step}.title`)}
                </h2>
              </div>

              {step === "patient" ? (
                <PatientStep
                  consentState={consentState}
                  consentsHref={selectedPatient ? `${roleBase}/patients/${encodeURIComponent(selectedPatient.id)}?tab=consents` : null}
                  isError={patientsQuery.isError}
                  isLoading={patientsQuery.isLoading}
                  locale={locale}
                  onSearchChange={setSearch}
                  onSelect={selectPatient}
                  patients={patientsQuery.data?.data ?? []}
                  preselectedError={Boolean(initialPatientId) && preselected.isError && !chosenPatient}
                  search={search}
                  selected={selectedPatient}
                  t={t}
                />
              ) : null}

              {step === "image" && selectedPatient ? (
                <ImageStep
                  documents={imageDocuments}
                  isError={documentsQuery.isError}
                  isLoading={documentsQuery.isLoading}
                  locale={locale}
                  onImport={() => setUploadOpen(true)}
                  onSelect={selectDocument}
                  patientName={getPatientDisplayName(selectedPatient, locale)}
                  selectedId={documentId}
                  t={t}
                />
              ) : null}

              {step === "quality" ? (
                <QualityStep onChooseAnother={() => goTo(1)} report={report} t={t} />
              ) : null}

              {step === "reading" && selectedDocument ? (
                <ReadingStep
                  blob={documentView.data ?? null}
                  fileName={selectedDocument.fileName}
                  impression={impression}
                  isDicom={isDicom}
                  isError={documentView.isError}
                  isLaunching={createRunMutation.isPending}
                  launchError={createRunMutation.isError && !getFailedRunId(createRunMutation.error)}
                  launchState={launchState}
                  module={model.module}
                  onImpressionChange={setImpression}
                  onLaunch={launchAnalysis}
                  t={t}
                />
              ) : null}

              <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                <div>
                  {stepIndex > 0 ? (
                    <button type="button" className="clinical-button" onClick={() => goTo(stepIndex - 1)}>
                      <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
                      {t("aiAnalyses.wizard.previous")}
                    </button>
                  ) : null}
                </div>
                {stepIndex < steps.length - 1 ? (
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    {blockedReason ? (
                      <p id={blockedId} className="text-xs text-[var(--text-secondary)]">{blockedReason}</p>
                    ) : null}
                    <button
                      type="button"
                      className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={blockedReason !== null}
                      aria-describedby={blockedReason ? blockedId : undefined}
                      onClick={() => goTo(stepIndex + 1)}
                    >
                      {t("aiAnalyses.wizard.next")}
                      <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
                    </button>
                  </div>
                ) : null}
              </footer>
            </section>
          </>
        )}
      </div>

      {selectedPatient ? (
        <UploadPatientDocumentModal
          direction={direction}
          documentTypes={imageDocumentTypes}
          isOpen={isUploadOpen}
          onClose={() => setUploadOpen(false)}
          onUploaded={(document) => {
            selectDocument(document.id);
            setNotice(t("aiAnalyses.wizard.image.uploaded"));
            window.setTimeout(() => setNotice(""), 3200);
          }}
          patientId={selectedPatient.id}
          t={t}
        />
      ) : null}

      <div role="status" aria-live="polite" className="sr-only">{notice}</div>
    </DashboardShell>
  );
}
