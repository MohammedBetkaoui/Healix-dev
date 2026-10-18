"use client";

import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
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
import { ECG_MAX_SAMPLING_RATE, ECG_MIN_SAMPLING_RATE, type AiMagnification, type AiPipelineId, type EcgUnit } from "@/features/ai-analyses/ai-analyses.types";
import { canLaunchPreparedAnalysis, getAcquisitionIssue } from "@/features/ai-analyses/wizard-presentation";
import { findModel, findPipeline } from "@/features/ai-analyses/ai-models.registry";
import { useCreateAiAnalysisRun } from "@/features/ai-analyses/hooks/use-create-ai-analysis-run";
import { useDebouncedValue } from "@/features/ai-analyses/hooks/use-debounced-value";
import { useAiModelsStatus } from "@/features/ai-analyses/hooks/use-ai-models-status";
import { useEcgHeaderProbe } from "@/features/ai-analyses/hooks/use-ecg-header-probe";
import { useImageProbe } from "@/features/ai-analyses/hooks/use-image-probe";
import { evaluateEcgQualityChecks, isEcgArchive, parseSamplingRate } from "@/features/ai-analyses/ecg-quality";
import { evaluateQualityChecks, isDicomDocument } from "@/features/ai-analyses/quality-check";
import {
  ecgRejectionParams,
  getEcgRejection,
  getFailedRunId,
  getLaunchErrorKey,
  getLaunchState,
} from "@/features/ai-analyses/run-presentation";
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

import { HealixSpecialtyArtwork } from "../HealixSpecialtyArtwork";
import { AcquisitionSettings, type EcgReadingInput } from "./AcquisitionSettings";
import { ImageStep } from "./ImageStep";
import { PatientStep, getPatientDisplayName, type ConsentState } from "./PatientStep";
import { QualityStep } from "./QualityStep";
import { ReadingStep } from "./ReadingStep";
import { PreparationSummary } from "./PreparationSummary";
import { WizardStepper } from "./WizardStepper";
import "./ai-analysis-wizard.css";

const steps = ["patient", "image", "quality", "reading"] as const;
const imageDocumentTypes: readonly PatientDocumentType[] = ["MEDICAL_IMAGE", "DICOM"];
// The ECG chain reads signals only, never an image.
const signalDocumentTypes: readonly PatientDocumentType[] = ["ECG_SIGNAL"];
// The nuclei map takes H&E images at 40x only (the backend refuses any other).
const NUCLEI_MAGNIFICATION = 40;

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
  const model = findModel(pipeline?.entryModelId);
  const isEcg = pipelineId === "cardio-ecg";
  const documentTypes = isEcg ? signalDocumentTypes : imageDocumentTypes;
  const roleBase = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";

  const [stepIndex, setStepIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [chosenPatient, setChosenPatient] = useState<Patient | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [impression, setImpression] = useState("");
  // Pathology: the image's magnification (breast), or the 40x H&E confirmation
  // (nuclei); no default, the physician states it for each image.
  const [magnification, setMagnification] = useState<AiMagnification | null>(null);
  const [he40xConfirmed, setHe40xConfirmed] = useState(false);
  // ECG (CSV/TXT): the sampling rate and unit the physician states; no
  // default rate, the file does not say it.
  const [rateChoice, setRateChoice] = useState<number | "other" | null>(null);
  const [otherRate, setOtherRate] = useState("");
  const [ecgUnit, setEcgUnit] = useState<EcgUnit>("mV");
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

  const imageDocuments = (documentsQuery.data ?? []).filter((document) => documentTypes.includes(document.type));
  const selectedDocument = imageDocuments.find((document) => document.id === documentId) ?? null;
  const isDicom = !isEcg && selectedDocument ? isDicomDocument(selectedDocument) : false;
  const isArchive = isEcg && selectedDocument ? isEcgArchive(selectedDocument.fileName) : false;
  // Downloaded (and audited) only once the user reaches the checks; a DICOM
  // file is not displayed at this step, so it is not downloaded at all.
  const documentView = usePatientDocumentView(patientId, selectedDocument?.id ?? null, {
    enabled: stepIndex >= 2 && !isDicom,
  });
  // A signal is never decoded as an image; an image never read as a signal.
  const probe = useImageProbe({ blob: isEcg ? undefined : documentView.data, isDicom, isError: documentView.isError });
  const headerProbe = useEcgHeaderProbe({
    blob: documentView.data,
    enabled: isEcg,
    isArchive,
    isError: documentView.isError,
  });
  const report = isEcg
    ? evaluateEcgQualityChecks({ fileName: selectedDocument?.fileName ?? "", probe: headerProbe })
    : evaluateQualityChecks({
        acceptedFormats: model?.acceptedFormats ?? null,
        fileName: selectedDocument?.fileName ?? "",
        inputConstraints: model?.inputConstraints ?? null,
        probe,
      });
  const samplingRate =
    rateChoice === null ? null : rateChoice === "other" ? parseSamplingRate(otherRate) : rateChoice;
  const acquisitionIssue = getAcquisitionIssue({ pipelineId, magnification, he40xConfirmed, isArchive, samplingRate, rateChoice, otherRate });
  const acquisitionBlocker = acquisitionIssue === "magnification"
    ? t("aiAnalyses.wizard.reading.magnification.required")
    : acquisitionIssue === "he40x"
      ? t("aiAnalyses.wizard.reading.he40x.required")
      : acquisitionIssue === "samplingRateInvalid"
        ? t("aiAnalyses.wizard.ecg.samplingRate.invalid", { min: ECG_MIN_SAMPLING_RATE, max: ECG_MAX_SAMPLING_RATE })
        : acquisitionIssue === "samplingRate"
          ? t("aiAnalyses.wizard.ecg.samplingRate.required")
          : null;

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
    if (createRunMutation.isPending) return;
    hasNavigated.current = true;
    setStepIndex(index);
  };

  const selectPatient = (patient: Patient) => {
    if (patient.id !== selectedPatient?.id) {
      createRunMutation.reset();
      setChosenPatient(patient);
      setDocumentId(null);
      setImpression("");
      setMagnification(null);
      setHe40xConfirmed(false);
      resetSignalInput();
    }
  };

  const selectDocument = (id: string) => {
    if (id !== documentId) {
      createRunMutation.reset();
      setDocumentId(id);
      setImpression("");
      setMagnification(null);
      setHe40xConfirmed(false);
      resetSignalInput();
    }
  };

  function resetSignalInput() {
    setRateChoice(null);
    setOtherRate("");
    setEcgUnit("mV");
  }

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
          : isEcg
            ? t("aiAnalyses.wizard.signal.selectFirst")
            : t("aiAnalyses.wizard.image.selectFirst")
        : stepIndex === 2
          ? report.canContinue
            ? acquisitionBlocker
            : report.checks.some((check) => check.status === "pending")
              ? isEcg
                ? t("aiAnalyses.wizard.ecg.qualityWaiting")
                : t("aiAnalyses.wizard.quality.waiting")
              : isEcg
                ? t("aiAnalyses.wizard.ecg.qualityBlocked")
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
  const launchState = modelsStatusQuery.isFetching ? "loading" : getLaunchState(modelsStatusQuery, pipeline.entryModelId);
  // The magnification the chain sends: none for brain, the chosen one for a
  // breast slide, 40 once the nuclei image is confirmed as H&E at 40x.
  const sentMagnification: AiMagnification | null | undefined =
    pipeline.id === "pathology-breast"
      ? magnification
      : pipeline.id === "pathology-nuclei"
        ? he40xConfirmed
          ? NUCLEI_MAGNIFICATION
          : null
        : undefined;
  // A CSV/TXT signal needs its rate; a WFDB header gives its own.
  const sentSignal = isEcg && !isArchive ? { samplingRate, unit: ecgUnit } : null;
  const canLaunch = canLaunchPreparedAnalysis({
    hasPatient: Boolean(patientId), hasDocument: Boolean(selectedDocument),
    consentSigned: consentState === "signed", qualityPassed: report.canContinue,
    acquisitionIssue, launchState, isLaunching: createRunMutation.isPending,
  });
  const preparationBlocker = consentState !== "signed"
    ? t("aiAnalyses.wizard.workspace.consentChanged")
    : !report.canContinue
      ? t("aiAnalyses.wizard.workspace.qualityChanged")
      : acquisitionBlocker;
  const acquisitionSummary: string[] = pipelineId === "pathology-breast" && magnification
    ? [t("aiAnalyses.wizard.reading.magnification.option", { value: magnification })]
    : pipelineId === "pathology-nuclei" && he40xConfirmed
      ? [t("aiAnalyses.wizard.reading.he40x.label")]
      : isEcg && isArchive
        ? [t("aiAnalyses.wizard.workspace.wfdbSettings")]
        : isEcg && samplingRate
          ? [t("aiAnalyses.wizard.ecg.samplingRate.option", { value: samplingRate }), t(`aiAnalyses.wizard.ecg.unit.${ecgUnit}`)]
          : [];
  const ecgInput: EcgReadingInput | undefined = isEcg ? {
    isArchive, otherRate, rateChoice, samplingRate, unit: ecgUnit,
    onOtherRateChange: (value) => { createRunMutation.reset(); setOtherRate(value); },
    onRateChoiceChange: (value) => { createRunMutation.reset(); setRateChoice(value); },
    onUnitChange: (value) => { createRunMutation.reset(); setEcgUnit(value); },
  } : undefined;
  const qualityState = !selectedDocument || stepIndex < 2 ? "waiting"
    : report.checks.some((check) => check.status === "pending") ? "checking"
      : !report.canContinue ? "failed" : acquisitionIssue ? "incomplete" : "passed";
  const documentStep = pipelineId === "brain" ? "mri" : isEcg ? "signal" : "slide";
  const displaySteps = ["patient", documentStep, "quality", "reading"];
  const stepTitle = step === "patient" ? t("aiAnalyses.wizard.patient.title")
    : step === "image" ? t(`aiAnalyses.wizard.workspace.pipelines.${pipelineId}.documentTitle`)
      : step === "quality" ? t(`aiAnalyses.wizard.workspace.pipelines.${pipelineId}.qualityTitle`)
        : t(`aiAnalyses.wizard.workspace.pipelines.${pipelineId}.readingTitle`);
  const stepHint = step === "patient" ? t("aiAnalyses.wizard.workspace.patientHint")
    : step === "image" ? t(`aiAnalyses.wizard.workspace.pipelines.${pipelineId}.documentHint`)
      : step === "quality" ? t(`aiAnalyses.wizard.workspace.pipelines.${pipelineId}.qualityHint`)
        : t("aiAnalyses.wizard.workspace.readingHint");
  // A refused signal: the wizard says why and stays open (rate or unit to fix).
  const ecgRejection = createRunMutation.isError ? getEcgRejection(createRunMutation.error) : null;

  const launchAnalysis = () => {
    if (!canLaunch || !selectedDocument || !patientId) {
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
        ...(sentMagnification ? { magnification: sentMagnification } : {}),
        ...(sentSignal?.samplingRate ? { samplingRate: sentSignal.samplingRate, unit: sentSignal.unit } : {}),
      },
      {
        onError: (error) => {
          const runId = getFailedRunId(error);
          if (runId && !getEcgRejection(error)) router.push(resultHref(runId));
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
      <div className="ai-wizard" data-pipeline={pipelineId}>
        <header className="ai-wizard-banner">
          <div className="ai-wizard-banner-copy">
            <div className="ai-wizard-banner-top"><p>{t("aiAnalyses.hub.brandEyebrow")}</p>
              <Link href={`${roleBase}/ai-analyses`} className="ai-wizard-back" aria-disabled={createRunMutation.isPending} onClick={(event) => { if (createRunMutation.isPending) event.preventDefault(); }}>
                <ArrowLeft size={14} aria-hidden="true" className="clinical-directional" />{t("aiAnalyses.wizard.backToHub")}
              </Link>
            </div>
            <h1>{pipelineName}</h1>
            <p className="ai-wizard-banner-description">{t(`aiAnalyses.hub.analyses.${pipelineId}.description`)}</p>
            <p className="ai-wizard-model-line">
              {t(`aiAnalyses.modules.${model.module}.title`)}
              {" · "}
              {t(`aiAnalyses.models.${model.id}.name`)}
              {model.version ? <> · <bdi dir="ltr" className="font-[var(--font-auth-mono)]">v{model.version}</bdi></> : null}
            </p>
          </div>
          <div className="ai-wizard-banner-art" aria-hidden="true"><HealixSpecialtyArtwork pipeline={pipelineId} /><span>HealixDz / {t("aiAnalyses.hub.atlasEdition")}</span></div>
        </header>

        {verificationRequired ? (
          <VerificationRequiredNotice accountType={accountType} t={t} />
        ) : (
          <>
            <WizardStepper
              current={stepIndex}
              disabled={createRunMutation.isPending}
              onSelect={goTo}
              steps={displaySteps}
              t={t}
            />
            <div className="ai-wizard-layout" data-reading={step === "reading"}>
            <section aria-labelledby="ai-wizard-step-title" className="ai-wizard-panel" aria-busy={createRunMutation.isPending}>
              <div className="ai-wizard-panel-heading">
                <p className="ai-wizard-step-count">
                  {t("aiAnalyses.wizard.stepOf", { current: stepIndex + 1, total: steps.length })}
                </p>
                <h2 ref={headingRef} id="ai-wizard-step-title" tabIndex={-1}>{stepTitle}</h2>
                <p className="ai-wizard-step-hint">{stepHint}</p>
              </div>

              {step === "reading" && selectedPatient ? <div className="ai-wizard-reading-context"><span>{t("aiAnalyses.wizard.steps.patient")}</span><strong><bdi>{getPatientDisplayName(selectedPatient, locale)}</bdi></strong>{selectedDocument ? <bdi className="ai-wizard-context-file">{selectedDocument.fileName}</bdi> : null}</div> : null}

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
                  copy={isEcg ? "signal" : "image"}
                  acceptedFormats={model.acceptedFormats}
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

              {step === "quality" ? <>
                <QualityStep copy={isEcg ? "signal" : "image"} onChooseAnother={() => goTo(1)} report={report} t={t} />
                <AcquisitionSettings pipelineId={pipelineId} ecg={ecgInput} magnification={magnification} he40xConfirmed={he40xConfirmed}
                  onMagnificationChange={(value) => { createRunMutation.reset(); setMagnification(value); }}
                  onHe40xChange={(value) => { createRunMutation.reset(); setHe40xConfirmed(value); }} t={t} />
              </> : null}

              {step === "reading" && selectedDocument ? (
                <ReadingStep
                  blob={documentView.data ?? null}
                  fileName={selectedDocument.fileName}
                  impression={impression}
                  isDicom={isDicom}
                  isError={documentView.isError}
                  isLaunching={createRunMutation.isPending}
                  launchError={
                    ecgRejection
                      ? {
                          key: null,
                          message: t(
                            `aiAnalyses.ecg.rejections.${ecgRejection.code}`,
                            ecgRejectionParams(ecgRejection.details, locale),
                          ),
                        }
                      : createRunMutation.isError && !getFailedRunId(createRunMutation.error)
                        ? { key: getLaunchErrorKey(createRunMutation.error) }
                        : null
                  }
                  launchState={launchState}
                  module={model.module}
                  onImpressionChange={setImpression}
                  onLaunch={launchAnalysis}
                  canLaunch={canLaunch}
                  preparationBlocker={preparationBlocker}
                  acquisitionSummary={acquisitionSummary}
                  onEditAcquisition={() => goTo(2)}
                  onRetryService={() => void modelsStatusQuery.refetch()}
                  isRefreshingService={modelsStatusQuery.isFetching}
                  pipelineId={pipeline.id}
                  t={t}
                />
              ) : null}
              {step === "reading" && !selectedDocument ? <div className="ai-wizard-invalidated" role="alert"><p>{t("aiAnalyses.wizard.workspace.documentChanged")}</p><button type="button" className="clinical-button" onClick={() => goTo(1)}>{t(`aiAnalyses.wizard.steps.${documentStep}`)}</button></div> : null}

              <footer className="ai-wizard-actions">
                <div>
                  {stepIndex > 0 ? (
                    <button type="button" className="clinical-button" disabled={createRunMutation.isPending} onClick={() => goTo(stepIndex - 1)}>
                      <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
                      {t("aiAnalyses.wizard.previous")}
                    </button>
                  ) : null}
                </div>
                {stepIndex < steps.length - 1 ? (
                  <div className="ai-wizard-next-action">
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
                      {t("aiAnalyses.wizard.workspace.continueTo", { step: t(`aiAnalyses.wizard.steps.${displaySteps[stepIndex + 1]}`) })}
                      <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" className="clinical-directional" />
                    </button>
                  </div>
                ) : null}
              </footer>
            </section>
            <PreparationSummary current={stepIndex} patientName={selectedPatient ? getPatientDisplayName(selectedPatient, locale) : null} document={selectedDocument}
              consentState={consentState} qualityState={qualityState} acquisitionSummary={acquisitionSummary} expectedResult={t(`aiAnalyses.hub.analyses.${pipelineId}.output`)} disabled={createRunMutation.isPending} onEdit={goTo} t={t} />
            </div>
          </>
        )}
        <div role="note" className="ai-wizard-clinical-note"><ShieldCheck size={18} aria-hidden="true" /><div><strong>{t("aiAnalyses.hub.clinicalNote")}</strong><p>{t("aiAnalyses.page.disclaimer")}</p></div></div>
      </div>

      {selectedPatient ? (
        <UploadPatientDocumentModal
          direction={direction}
          documentTypes={documentTypes}
          isOpen={isUploadOpen}
          onClose={() => setUploadOpen(false)}
          onUploaded={(document) => {
            selectDocument(document.id);
            setNotice(isEcg ? t("aiAnalyses.wizard.signal.uploaded") : t("aiAnalyses.wizard.image.uploaded"));
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
