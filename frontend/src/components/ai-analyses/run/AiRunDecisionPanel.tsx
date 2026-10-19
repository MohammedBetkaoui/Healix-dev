"use client";

import { CheckCircle2, Clock3, PenLine, ShieldAlert, TriangleAlert, XCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import {
  ecgClasses,
  type AiAnalysisRun,
  type AiPipelineId,
  type AiRunDecision,
  type EcgClass,
} from "@/features/ai-analyses/ai-analyses.types";
import { useDecideAiAnalysisRun } from "@/features/ai-analyses/hooks/use-decide-ai-analysis-run";
import {
  DECISION_REASON_MAX_LENGTH,
  DECISION_REASON_MIN_LENGTH,
  decisionTones,
  getCorrectionOptions,
  getDecisionAgreement,
  getDecisionErrorKey,
  getDecisionOptions,
  getModelLabel,
  getModelLabels,
  normalizeDecisionReason,
  sortEcgLabels,
  toDecisionPayload,
  toggleEcgLabel,
  validateDecisionDraft,
  type DecisionDraft,
} from "@/features/ai-analyses/run-decision";
import { formatPatientDateTime } from "@/features/patients/patient-registry";
import { type Locale } from "@/i18n";
import { getVerificationRequiredMessage } from "@/lib/api/get-mutation-error-message";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const decisionIcons = {
  CORRECTED: PenLine,
  REJECTED: XCircle,
  VALIDATED: CheckCircle2,
} as const;

// A nuclei map is validated or rejected as a map, an ECG keeps a set of
// classes: their options have their own words.
const isMapPipeline = (pipeline: AiPipelineId) =>
  pipeline === "pathology-nuclei" || pipeline === "cardio-seg-mri";
const optionKey = (pipeline: AiPipelineId, status: AiRunDecision) =>
  isMapPipeline(pipeline) ? `aiAnalyses.decision.nucleiOptions.${status}` : `aiAnalyses.decision.options.${status}`;
const optionHintKey = (pipeline: AiPipelineId, status: AiRunDecision) =>
  isMapPipeline(pipeline)
    ? `aiAnalyses.decision.nucleiOptionHints.${status}`
    : pipeline === "cardio-ecg"
      ? `aiAnalyses.decision.ecgOptionHints.${status}`
      : `aiAnalyses.decision.optionHints.${status}`;

/** ECG classes named in a sentence; "none at its threshold" for an empty set. */
function ecgClassesText(labels: readonly EcgClass[] | null, t: TranslationFunction) {
  return labels && labels.length > 0
    ? labels.map((label) => t(`aiAnalyses.classes.${label}`)).join(", ")
    : t("aiAnalyses.decision.noModelClass");
}

// What the decision retains: a class (a set of classes for an ECG), the
// validated map, or nothing.
function retainedText(
  pipeline: AiPipelineId,
  status: AiRunDecision,
  label: string | null,
  t: TranslationFunction,
  labels: readonly EcgClass[] | null = null,
) {
  if (pipeline === "cardio-ecg" && status !== "REJECTED") {
    return labels && labels.length > 0 ? ecgClassesText(labels, t) : t("aiAnalyses.decision.noClassRetained");
  }
  if (label) return t(`aiAnalyses.classes.${label}`);
  if (isMapPipeline(pipeline) && status === "VALIDATED") return t("aiAnalyses.decision.mapAccepted");
  return t("aiAnalyses.decision.noRetainedLabel");
}

// Space-separated ids, empty ones dropped (not cn: ids are not classes).
const describedBy = (...ids: (string | false | null | undefined)[]) => ids.filter(Boolean).join(" ") || undefined;

const fieldClass =
  "w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] aria-[invalid=true]:border-[var(--danger)]";

type AiRunDecisionPanelProps = {
  locale: Locale;
  patientId: string;
  /** A SUCCEEDED run: only those can be decided. */
  run: AiAnalysisRun;
  t: TranslationFunction;
};

/** Badge of the result page header: the decision, or that it is awaited. */
export function AiRunDecisionBadge({ run, t }: { run: AiAnalysisRun; t: TranslationFunction }) {
  if (run.decisionStatus === null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Clock3 size={14} strokeWidth={1.8} aria-hidden="true" className="text-[var(--accent-dark)]" />
        <StatusBadge label={t("aiAnalyses.decision.pending")} tone="info" />
      </span>
    );
  }

  return (
    <StatusBadge
      label={t(`aiAnalyses.decision.statuses.${run.decisionStatus}`)}
      tone={decisionTones[run.decisionStatus]}
    />
  );
}

// "Votre décision": the physician validates, corrects or rejects the result,
// once. Read-only afterwards. The impression typed before the analysis is
// recalled just above the choices.
export function AiRunDecisionPanel({ locale, patientId, run, t }: AiRunDecisionPanelProps) {
  const headingId = useId();
  const mutation = useDecideAiAnalysisRun(patientId, run.id);
  const isDecided = run.decisionStatus !== null;
  // A 409 means another submission landed first: its decision is shown.
  const decidedElsewhere = mutation.isError && getDecisionErrorKey(mutation.error) === "AI_RUN_ALREADY_DECIDED";

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "surface-section space-y-4 border-s-[3px] p-5",
        isDecided ? "border-s-[color:var(--border-strong)]" : "border-s-[color:var(--accent)]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DecisionHeading
          focusOnMount={isDecided && (mutation.isSuccess || decidedElsewhere)}
          id={headingId}
          title={isDecided ? t("aiAnalyses.decision.decidedTitle") : t("aiAnalyses.decision.title")}
        />
        <AiRunDecisionBadge run={run} t={t} />
      </div>

      <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3">
        <h3 className="text-xs font-semibold text-[var(--text-secondary)]">{t("aiAnalyses.decision.impressionReminder")}</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">
          {run.clinicianImpression || t("aiAnalyses.run.noImpression")}
        </p>
      </div>

      {isDecided ? (
        <>
          <div role="status">
            {mutation.isSuccess ? (
              <p className="text-sm font-medium text-[var(--success-ink)]">{t("aiAnalyses.decision.saved")}</p>
            ) : decidedElsewhere ? (
              <p className="text-sm text-[var(--warning-ink)]">{t("aiAnalyses.decision.errors.AI_RUN_ALREADY_DECIDED")}</p>
            ) : null}
          </div>
          <DecisionRecord locale={locale} run={run} t={t} />
        </>
      ) : (
        <DecisionForm mutation={mutation} run={run} t={t} />
      )}
    </section>
  );
}

function DecisionHeading({ focusOnMount, id, title }: { focusOnMount: boolean; id: string; title: string }) {
  const ref = useRef<HTMLHeadingElement>(null);

  // After a decision, the form (and its dialog) is gone: focus moves here.
  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  return (
    <h2 ref={ref} id={id} tabIndex={-1} className="text-base font-semibold text-[var(--text-primary)] focus:outline-none">
      {title}
    </h2>
  );
}

function DecisionRecord({ locale, run, t }: { locale: Locale; run: AiAnalysisRun; t: TranslationFunction }) {
  const status = run.decisionStatus as AiRunDecision;
  const Icon = decisionIcons[status];
  const modelLabel = getModelLabel(run);
  const modelLabels = getModelLabels(run);
  const agreement = getDecisionAgreement(run);
  const agreementText =
    agreement === "pending" || agreement === "notApplicable"
      ? t("aiAnalyses.run.none")
      : modelLabels
        ? t(`aiAnalyses.decision.ecgAgreement.${agreement}`, { classes: ecgClassesText(modelLabels, t) })
        : modelLabel
          ? t(`aiAnalyses.decision.agreement.${agreement}`, { class: t(`aiAnalyses.classes.${modelLabel}`) })
          : t("aiAnalyses.run.none");

  return (
    <>
      <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
        <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.decision.fields.decision")}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <Icon size={16} strokeWidth={1.8} aria-hidden="true" className="text-[var(--text-secondary)]" />
          <StatusBadge label={t(`aiAnalyses.decision.statuses.${status}`)} tone={decisionTones[status]} />
          <span className="text-[var(--text-primary)]">{t(optionKey(run.pipeline, status))}</span>
        </dd>
        <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.decision.fields.retainedLabel")}</dt>
        <dd className="font-semibold text-[var(--text-primary)]">
          {retainedText(run.pipeline, status, run.decisionLabel, t, run.decisionLabels)}
        </dd>
        {/* A nuclei map has no proposed class to agree with. */}
        {agreement !== "notApplicable" ? (
          <>
            <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.decision.fields.agreement")}</dt>
            <dd className="text-[var(--text-primary)]">{agreementText}</dd>
          </>
        ) : null}
        <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.decision.fields.reason")}</dt>
        <dd className="whitespace-pre-wrap break-words text-[var(--text-primary)]">
          {run.decisionReason || t("aiAnalyses.decision.noReason")}
        </dd>
        <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.decision.fields.decidedBy")}</dt>
        <dd className="text-[var(--text-primary)]"><bdi>{run.decidedByName ?? t("aiAnalyses.decision.unknownDoctor")}</bdi></dd>
        <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.decision.fields.decidedAt")}</dt>
        <dd className="text-[var(--text-primary)]">{run.decidedAt ? formatPatientDateTime(run.decidedAt, locale) : t("aiAnalyses.run.none")}</dd>
      </dl>
      <p className="text-xs text-[var(--text-secondary)]">{t("aiAnalyses.decision.final")}</p>
    </>
  );
}

type DecisionMutation = ReturnType<typeof useDecideAiAnalysisRun>;

function DecisionForm({ mutation, run, t }: { mutation: DecisionMutation; run: AiAnalysisRun; t: TranslationFunction }) {
  const id = useId();
  const ids = {
    correctedLabel: `${id}-corrected`,
    correctedLabelError: `${id}-corrected-error`,
    correctedLabelHint: `${id}-corrected-hint`,
    correctedLabels: (label: EcgClass) => `${id}-corrected-${label}`,
    correctedLabelsError: `${id}-corrected-labels-error`,
    option: (status: AiRunDecision) => `${id}-option-${status}`,
    optionHint: (status: AiRunDecision) => `${id}-option-${status}-hint`,
    reason: `${id}-reason`,
    reasonCounter: `${id}-reason-counter`,
    reasonError: `${id}-reason-error`,
    reasonHint: `${id}-reason-hint`,
    statusError: `${id}-status-error`,
  };
  const [draft, setDraft] = useState<DecisionDraft>({ correctedLabel: "", correctedLabels: [], reason: "", status: null });
  const [showErrors, setShowErrors] = useState(false);
  const [isConfirming, setConfirming] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  const modelLabel = getModelLabel(run);
  const modelLabels = getModelLabels(run);
  const isEcg = run.pipeline === "cardio-ecg";
  const modelClass = isEcg
    ? ecgClassesText(modelLabels, t)
    : modelLabel
      ? t(`aiAnalyses.classes.${modelLabel}`)
      : "";
  const errors = validateDecisionDraft(draft, modelLabel, run.pipeline, modelLabels);
  const visible = showErrors ? errors : {};
  const needsReason = draft.status === "CORRECTED" || draft.status === "REJECTED";
  const reasonLength = normalizeDecisionReason(draft.reason).length;
  const limits = { max: DECISION_REASON_MAX_LENGTH, min: DECISION_REASON_MIN_LENGTH };

  const correctedLabelError = visible.correctedLabel === "required"
    ? t("aiAnalyses.decision.draftErrors.correctedLabelRequired")
    : visible.correctedLabel === "matchesModel"
      ? t("aiAnalyses.decision.draftErrors.correctedLabelMatchesModel")
      : null;
  const correctedLabelsError = visible.correctedLabels === "required"
    ? t("aiAnalyses.decision.draftErrors.correctedLabelsRequired")
    : visible.correctedLabels === "normExclusive"
      ? t("aiAnalyses.decision.draftErrors.correctedLabelsNormExclusive")
      : visible.correctedLabels === "matchesModel"
        ? t("aiAnalyses.decision.draftErrors.correctedLabelsMatchesModel")
        : null;
  const reasonError = visible.reason === "required"
    ? t("aiAnalyses.decision.draftErrors.reasonRequired")
    : visible.reason === "tooShort"
      ? t("aiAnalyses.decision.draftErrors.reasonTooShort", limits)
      : visible.reason === "tooLong"
        ? t("aiAnalyses.decision.draftErrors.reasonTooLong", limits)
        : null;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      const target = errors.status
        ? ids.option("VALIDATED")
        : errors.correctedLabels
          ? ids.correctedLabels(ecgClasses[0])
          : errors.correctedLabel
            ? ids.correctedLabel
            : ids.reason;
      document.getElementById(target)?.focus();
      return;
    }
    mutation.reset();
    setConfirming(true);
  };

  return (
    <form noValidate onSubmit={onSubmit} className="space-y-4">
      <fieldset>
        <legend className="text-sm font-semibold text-[var(--text-primary)]">{t("aiAnalyses.decision.choicesLabel")}</legend>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{t("aiAnalyses.decision.pendingHint")}</p>
        <div className="mt-3 grid gap-2">
          {getDecisionOptions(run.pipeline).map((status) => {
            const isSelected = draft.status === status;
            const Icon = decisionIcons[status];

            return (
              <label
                key={status}
                htmlFor={ids.option(status)}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5",
                  isSelected
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]",
                )}
              >
                <input
                  id={ids.option(status)}
                  type="radio"
                  name={`${id}-decision`}
                  value={status}
                  className="mt-1 accent-[var(--accent)]"
                  checked={isSelected}
                  aria-describedby={describedBy(ids.optionHint(status), visible.status && ids.statusError)}
                  onChange={() => setDraft((current) => ({ ...current, status }))}
                />
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--text-secondary)]" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--text-primary)]">{t(optionKey(run.pipeline, status))}</span>
                  <span id={ids.optionHint(status)} className="mt-0.5 block text-xs leading-5 text-[var(--text-secondary)]">
                    {t(optionHintKey(run.pipeline, status), { class: modelClass, classes: modelClass })}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {visible.status ? (
          <p id={ids.statusError} className="mt-2 text-xs font-medium text-[var(--danger-ink)]">
            {t("aiAnalyses.decision.draftErrors.status")}
          </p>
        ) : null}
      </fieldset>

      {draft.status === "CORRECTED" && isEcg ? (
        <fieldset
          className="space-y-2"
          aria-describedby={describedBy(ids.correctedLabelHint, correctedLabelsError && ids.correctedLabelsError)}
        >
          <legend className="text-[.8rem] font-medium text-[var(--text-primary)]">{t("aiAnalyses.decision.correctedLabels")}</legend>
          <p id={ids.correctedLabelHint} className="text-xs text-[var(--text-secondary)]">
            {t("aiAnalyses.decision.correctedLabelsHint", { classes: modelClass })}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ecgClasses.map((label) => {
              const isChecked = (draft.correctedLabels ?? []).includes(label);
              return (
                <label
                  key={label}
                  htmlFor={ids.correctedLabels(label)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2 text-sm",
                    isChecked
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]",
                  )}
                >
                  <input
                    id={ids.correctedLabels(label)}
                    type="checkbox"
                    className="accent-[var(--accent)]"
                    checked={isChecked}
                    aria-invalid={correctedLabelsError ? true : undefined}
                    onChange={() =>
                      setDraft((current) => ({
                        ...current,
                        correctedLabels: toggleEcgLabel(current.correctedLabels ?? [], label),
                      }))
                    }
                  />
                  <span className="text-[var(--text-primary)]">
                    {t(`aiAnalyses.classes.${label}`)} <bdi dir="ltr" className="text-xs text-[var(--text-secondary)]">({label})</bdi>
                  </span>
                </label>
              );
            })}
          </div>
          {correctedLabelsError ? (
            <p id={ids.correctedLabelsError} className="text-xs font-medium text-[var(--danger-ink)]">{correctedLabelsError}</p>
          ) : null}
        </fieldset>
      ) : draft.status === "CORRECTED" ? (
        <div className="space-y-1.5">
          <label htmlFor={ids.correctedLabel} className="text-[.8rem] font-medium text-[var(--text-primary)]">
            {t("aiAnalyses.decision.correctedLabel")}
          </label>
          <select
            id={ids.correctedLabel}
            className={cn(fieldClass, "h-10")}
            value={draft.correctedLabel}
            required
            aria-invalid={correctedLabelError ? true : undefined}
            aria-describedby={describedBy(ids.correctedLabelHint, correctedLabelError && ids.correctedLabelError)}
            onChange={(event) => setDraft((current) => ({ ...current, correctedLabel: event.target.value }))}
          >
            <option value="">{t("aiAnalyses.decision.correctedLabelPlaceholder")}</option>
            {getCorrectionOptions(run.pipeline, modelLabel).map((label) => (
              <option key={label} value={label}>{t(`aiAnalyses.classes.${label}`)}</option>
            ))}
          </select>
          <p id={ids.correctedLabelHint} className="text-xs text-[var(--text-secondary)]">
            {t("aiAnalyses.decision.correctedLabelHint", { class: modelClass })}
          </p>
          {correctedLabelError ? (
            <p id={ids.correctedLabelError} className="text-xs font-medium text-[var(--danger-ink)]">{correctedLabelError}</p>
          ) : null}
        </div>
      ) : null}

      {needsReason ? (
        <div className="space-y-1.5">
          <label htmlFor={ids.reason} className="text-[.8rem] font-medium text-[var(--text-primary)]">
            {t(`aiAnalyses.decision.reasonLabels.${draft.status}`)}
          </label>
          <textarea
            id={ids.reason}
            rows={4}
            maxLength={DECISION_REASON_MAX_LENGTH}
            required
            value={draft.reason}
            className={fieldClass}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={describedBy(ids.reasonHint, ids.reasonCounter, reasonError && ids.reasonError)}
            onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))}
          />
          <div className="flex flex-wrap justify-between gap-2 text-xs text-[var(--text-secondary)]">
            <p id={ids.reasonHint}>{t("aiAnalyses.decision.reasonHint", limits)}</p>
            <p id={ids.reasonCounter}>{t("aiAnalyses.decision.characters", { count: reasonLength, max: DECISION_REASON_MAX_LENGTH })}</p>
          </div>
          {reasonError ? (
            <p id={ids.reasonError} className="text-xs font-medium text-[var(--danger-ink)]">{reasonError}</p>
          ) : null}
        </div>
      ) : null}

      <button ref={submitRef} type="submit" className="clinical-button clinical-button-primary">
        {t("aiAnalyses.decision.submit")}
      </button>

      {isConfirming && draft.status !== null ? (
        <ConfirmDecisionDialog
          draft={{ ...draft, status: draft.status }}
          modelLabel={modelLabel}
          modelLabels={modelLabels}
          mutation={mutation}
          pipeline={run.pipeline}
          t={t}
          onClosed={() => {
            setConfirming(false);
            submitRef.current?.focus();
          }}
        />
      ) : null}
    </form>
  );
}

type ConfirmDecisionDialogProps = {
  draft: DecisionDraft & { status: AiRunDecision };
  modelLabel: string | null;
  /** ECG: the model's positive classes. */
  modelLabels: EcgClass[] | null;
  mutation: DecisionMutation;
  onClosed: () => void;
  pipeline: AiPipelineId;
  t: TranslationFunction;
};

// Native modal <dialog>: focus kept inside, Escape closes (unless sending),
// the page behind is inert.
function ConfirmDecisionDialog({ draft, modelLabel, modelLabels, mutation, onClosed, pipeline, t }: ConfirmDecisionDialogProps) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const payload = toDecisionPayload(draft, pipeline);
  const retainedLabel = draft.status === "VALIDATED" ? modelLabel : draft.status === "CORRECTED" ? draft.correctedLabel : null;
  const retainedLabels =
    draft.status === "VALIDATED" ? modelLabels : draft.status === "CORRECTED" ? sortEcgLabels(draft.correctedLabels ?? []) : null;
  const isPending = mutation.isPending;
  const errorMessage = mutation.isError
    ? getVerificationRequiredMessage(mutation.error, t) ?? t(`aiAnalyses.decision.errors.${getDecisionErrorKey(mutation.error)}`)
    : null;

  // No close() on cleanup: in development React runs this effect twice, and a
  // close() there fires "close", read as a cancellation (onClosed), which
  // unmounted the dialog as soon as it opened. Unmounting removes the dialog
  // from the page anyway.
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-final`}
      className="surface-section surface-raised fixed inset-0 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100%-2rem))] overflow-y-auto p-0 text-[var(--text-primary)] backdrop:bg-[rgb(8_22_28/50%)]"
      onCancel={(event) => {
        if (isPending) event.preventDefault();
      }}
      onClose={onClosed}
    >
      <header className="border-b border-[var(--border)] px-6 py-4">
        <h2 id={`${id}-title`} className="text-base font-semibold">{t("aiAnalyses.decision.confirm.title")}</h2>
      </header>

      <div className="space-y-4 px-6 py-5">
        <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.decision.confirm.decision")}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <StatusBadge label={t(`aiAnalyses.decision.statuses.${draft.status}`)} tone={decisionTones[draft.status]} />
            {t(optionKey(pipeline, draft.status))}
          </dd>
          <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.decision.confirm.retainedLabel")}</dt>
          <dd className="font-semibold">{retainedText(pipeline, draft.status, retainedLabel, t, retainedLabels)}</dd>
          {payload.reason ? (
            <>
              <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.decision.confirm.reason")}</dt>
              <dd className="whitespace-pre-wrap break-words">{payload.reason}</dd>
            </>
          ) : null}
        </dl>

        <p id={`${id}-final`} className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-3 py-2.5 text-sm leading-6">
          <ShieldAlert size={17} strokeWidth={1.8} aria-hidden="true" className="mt-1 shrink-0 text-[var(--warning-ink)]" />
          {t("aiAnalyses.decision.confirm.final")}
        </p>

        {errorMessage ? (
          <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
            <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
            {errorMessage}
          </p>
        ) : null}
      </div>

      <footer className="flex flex-col-reverse gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="clinical-button disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          onClick={() => ref.current?.close()}
        >
          {t("aiAnalyses.decision.confirm.cancel")}
        </button>
        <button
          type="button"
          className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          onClick={() => mutation.mutate(payload)}
        >
          {isPending ? t("aiAnalyses.decision.confirm.pending") : t("aiAnalyses.decision.confirm.confirm")}
        </button>
      </footer>
    </dialog>
  );
}
