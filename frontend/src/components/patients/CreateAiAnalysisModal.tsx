"use client";

import { BrainCircuit, TriangleAlert, X } from "lucide-react";
import { useId } from "react";
import { useForm } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useCreatePatientAiAnalysis } from "@/features/patients/hooks/use-create-patient-ai-analysis";
import { usePatientDocuments } from "@/features/patients/hooks/use-patient-documents";
import { getMutationErrorMessage } from "@/lib/api/get-mutation-error-message";
import { type Direction, type TranslationFunction } from "@/lib/i18n";
import { type PatientAiAnalysisResult, type PatientAiAnalysisType } from "@/types/patient";

type CreateAiAnalysisModalProps = {
  direction: Direction;
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  patientId: string;
  t: TranslationFunction;
};

// Form values stay strings (select/input values); they are converted to
// CreatePatientAiAnalysisPayload on submit.
type AiAnalysisFormValues = {
  modelName: string;
  modelVersion: string;
  result: PatientAiAnalysisResult | "";
  score: string;
  sourceDocumentId: string;
  type: PatientAiAnalysisType | "";
};

const analysisTypes: PatientAiAnalysisType[] = ["MRI", "CT_SCAN", "XRAY", "ECG"];
const analysisResults: PatientAiAnalysisResult[] = ["NORMAL", "ANOMALY_DETECTED"];

// Mirrors backend/src/patients/dto/create-patient-ai-analysis.dto.ts.
const SCORE_MIN = 0;
const SCORE_MAX = 100;
const MODEL_NAME_MIN_LENGTH = 2;
const MODEL_NAME_MAX_LENGTH = 120;
const MODEL_VERSION_MAX_LENGTH = 40;

const defaultValues: AiAnalysisFormValues = {
  modelName: "",
  modelVersion: "",
  // No preselected type/result: a clinical result must be an explicit choice,
  // never a default that could be saved by mistake.
  result: "",
  score: "",
  sourceDocumentId: "",
  type: "",
};

const fieldClass = "h-[42px] rounded-[var(--radius-sm)] border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-primary)] shadow-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";
const labelClass = "text-[.8rem] font-medium text-[var(--text-primary)]";

function RequiredMark() {
  return <span aria-hidden="true" className="text-[var(--danger-ink)]"> *</span>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-xs text-[var(--danger-ink)]">{message}</p> : null;
}

export function CreateAiAnalysisModal({
  isOpen,
  ...dialogProps
}: CreateAiAnalysisModalProps) {
  // Mounting the dialog only while open gives every opening a fresh form and
  // mutation state without resetting them in an effect.
  if (!isOpen) return null;

  return <CreateAiAnalysisDialog {...dialogProps} />;
}

function CreateAiAnalysisDialog({
  direction,
  onClose,
  onCreated,
  patientId,
  t,
}: Omit<CreateAiAnalysisModalProps, "isOpen">) {
  const baseId = useId();
  const ids = {
    modelName: `${baseId}-model-name`,
    modelVersion: `${baseId}-model-version`,
    result: `${baseId}-result`,
    score: `${baseId}-score`,
    sourceDocument: `${baseId}-source-document`,
    subtitle: `${baseId}-subtitle`,
    title: `${baseId}-title`,
    type: `${baseId}-type`,
  };
  const createAiAnalysisMutation = useCreatePatientAiAnalysis();
  const { data: documents } = usePatientDocuments(patientId);
  const isLocked = createAiAnalysisMutation.isPending;
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<AiAnalysisFormValues>({ defaultValues });

  const submit = (values: AiAnalysisFormValues) => {
    // Guaranteed by the `required` rules below; narrows the "" option away.
    if (!values.type || !values.result) return;
    const modelVersion = values.modelVersion.trim();

    createAiAnalysisMutation.mutate(
      {
        patientId,
        payload: {
          modelName: values.modelName.trim(),
          // The backend's @IsOptional() only skips undefined/null, so empty
          // optional fields are omitted rather than sent as "".
          modelVersion: modelVersion || undefined,
          result: values.result,
          score: Number(values.score),
          sourceDocumentId: values.sourceDocumentId || undefined,
          type: values.type,
        },
      },
      {
        onSuccess: () => {
          onCreated();
          onClose();
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--scrim)]"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isLocked) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
        <div
          aria-describedby={ids.subtitle}
          aria-labelledby={ids.title}
          aria-modal="true"
          className="surface-section surface-raised w-full max-w-xl overflow-hidden"
          dir={direction}
          role="dialog"
        >
          <header className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="healix-mark"><BrainCircuit size={18} strokeWidth={1.8} aria-hidden="true" /></span>
              <div>
                <h2 id={ids.title} className="text-base font-semibold text-[var(--text-primary)]">{t("patients.modal.createAiAnalysis.title")}</h2>
                <p id={ids.subtitle} className="clinical-caption mt-0.5">{t("patients.modal.createAiAnalysis.subtitle")}</p>
              </div>
            </div>
            {isLocked ? null : (
              <button type="button" className="clinical-icon-button -me-2 -mt-1.5 shrink-0" onClick={onClose} aria-label={t("patients.actions.close")}>
                <X size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
          </header>

          <form onSubmit={handleSubmit(submit)} noValidate>
            <div className="space-y-5 px-6 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={ids.type} className={labelClass}>{t("patients.modal.createAiAnalysis.typeLabel")}<RequiredMark /></Label>
                  <Select
                    id={ids.type}
                    className={fieldClass}
                    aria-invalid={errors.type ? true : undefined}
                    aria-describedby={errors.type ? `${ids.type}-error` : undefined}
                    {...register("type", { required: true })}
                  >
                    <option value="">{t("patients.modal.createAiAnalysis.selectType")}</option>
                    {analysisTypes.map((type) => (
                      <option key={type} value={type}>{t(`patients.ai.types.${type}`)}</option>
                    ))}
                  </Select>
                  <FieldError id={`${ids.type}-error`} message={errors.type ? t("patients.modal.createAiAnalysis.errors.type") : undefined} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={ids.result} className={labelClass}>{t("patients.modal.createAiAnalysis.resultLabel")}<RequiredMark /></Label>
                  <Select
                    id={ids.result}
                    className={fieldClass}
                    aria-invalid={errors.result ? true : undefined}
                    aria-describedby={errors.result ? `${ids.result}-error` : undefined}
                    {...register("result", { required: true })}
                  >
                    <option value="">{t("patients.modal.createAiAnalysis.selectResult")}</option>
                    {analysisResults.map((result) => (
                      <option key={result} value={result}>{t(`patients.ai.results.${result}`)}</option>
                    ))}
                  </Select>
                  <FieldError id={`${ids.result}-error`} message={errors.result ? t("patients.modal.createAiAnalysis.errors.result") : undefined} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div className="space-y-1.5">
                  <Label htmlFor={ids.score} className={labelClass}>{t("patients.modal.createAiAnalysis.scoreLabel")}<RequiredMark /></Label>
                  <Input
                    id={ids.score}
                    className={fieldClass}
                    type="number"
                    inputMode="decimal"
                    min={SCORE_MIN}
                    max={SCORE_MAX}
                    step="any"
                    dir="ltr"
                    aria-invalid={errors.score ? true : undefined}
                    aria-describedby={errors.score ? `${ids.score}-error` : undefined}
                    {...register("score", {
                      validate: (value) => {
                        if (value.trim() === "") return false;
                        const score = Number(value);
                        return Number.isFinite(score) && score >= SCORE_MIN && score <= SCORE_MAX;
                      },
                    })}
                  />
                  <FieldError id={`${ids.score}-error`} message={errors.score ? t("patients.modal.createAiAnalysis.errors.score") : undefined} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={ids.modelName} className={labelClass}>{t("patients.modal.createAiAnalysis.modelNameLabel")}<RequiredMark /></Label>
                  <Input
                    id={ids.modelName}
                    className={fieldClass}
                    maxLength={MODEL_NAME_MAX_LENGTH}
                    placeholder={t("patients.modal.createAiAnalysis.modelNamePlaceholder")}
                    aria-invalid={errors.modelName ? true : undefined}
                    aria-describedby={errors.modelName ? `${ids.modelName}-error` : undefined}
                    {...register("modelName", {
                      validate: (value) => {
                        const length = value.trim().length;
                        return length >= MODEL_NAME_MIN_LENGTH && length <= MODEL_NAME_MAX_LENGTH;
                      },
                    })}
                  />
                  <FieldError id={`${ids.modelName}-error`} message={errors.modelName ? t("patients.modal.createAiAnalysis.errors.modelName") : undefined} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <div className="space-y-1.5">
                  <Label htmlFor={ids.modelVersion} className={labelClass}>{t("patients.modal.createAiAnalysis.modelVersionLabel")}</Label>
                  <Input
                    id={ids.modelVersion}
                    className={fieldClass}
                    maxLength={MODEL_VERSION_MAX_LENGTH}
                    dir="ltr"
                    aria-invalid={errors.modelVersion ? true : undefined}
                    aria-describedby={errors.modelVersion ? `${ids.modelVersion}-error` : undefined}
                    {...register("modelVersion", {
                      validate: (value) => value.trim().length <= MODEL_VERSION_MAX_LENGTH,
                    })}
                  />
                  <FieldError id={`${ids.modelVersion}-error`} message={errors.modelVersion ? t("patients.modal.createAiAnalysis.errors.modelVersion") : undefined} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={ids.sourceDocument} className={labelClass}>{t("patients.modal.createAiAnalysis.sourceDocumentLabel")}</Label>
                  <Select id={ids.sourceDocument} className={fieldClass} {...register("sourceDocumentId")}>
                    <option value="">{t("patients.modal.createAiAnalysis.sourceDocumentNone")}</option>
                    {(documents ?? []).map((document) => (
                      <option key={document.id} value={document.id}>{document.fileName}</option>
                    ))}
                  </Select>
                </div>
              </div>

              {createAiAnalysisMutation.isError ? (
                <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                  <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                  {/* A missing/withdrawn consent (403) already carries its own
                      server message; the fallback only covers errors without
                      one (network, timeout), so it must stay generic. */}
                  {getMutationErrorMessage(createAiAnalysisMutation.error, t, t("patients.modal.createAiAnalysis.submitError"))}
                </p>
              ) : null}
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 sm:flex-row sm:justify-end">
              <button type="button" className="clinical-button disabled:cursor-not-allowed disabled:opacity-60" onClick={onClose} disabled={isLocked}>{t("patients.actions.cancel")}</button>
              <button type="submit" className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60" disabled={isLocked}>
                <BrainCircuit size={16} strokeWidth={1.8} aria-hidden="true" />
                {isLocked ? t("patients.modal.createAiAnalysis.submitting") : t("patients.modal.createAiAnalysis.submit")}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
}
