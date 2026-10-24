"use client";

import { Brain, HeartPulse, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import { getFailedRunId } from "@/features/ai-analyses/run-presentation";
import {
  analysableInstances,
  analysableSeries,
  canLaunchDicomAnalysis,
  DICOM_ANALYSIS_PIPELINES,
  dicomRunPagePath,
  failedRunPagePath,
  formatDicomSlice,
  type DicomAnalysisPipeline,
} from "@/features/dicom/dicom-analysis";
import { type DicomStudyDetail } from "@/features/dicom/dicom.types";
import { useAnalyzeDicomInstance, useDicomPreview } from "@/features/dicom/hooks/use-dicom-studies";
import { usePatientConsents } from "@/features/patients/hooks/use-patient-consents";
import { useReadOnlyAction } from "@/features/subscriptions/hooks/use-read-only-action";
import { getMutationErrorMessage } from "@/lib/api/get-mutation-error-message";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type DicomAnalysisPanelProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  /** A chain already chosen; none by default: the physician decides. */
  initialPipeline?: DicomAnalysisPipeline;
  patientId: string;
  study: DicomStudyDetail;
  t: TranslationFunction;
};

const pipelineIcons = { brain: Brain, "cardio-seg-mri": HeartPulse } as const;

function SlicePreview({ alt, blob, error, loading, t }: { alt: string; blob: Blob | undefined; error: boolean; loading: boolean; t: TranslationFunction }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  // A frame of fixed size, before and after loading: the slider does not jump.
  return (
    <div className="flex aspect-square w-full max-w-[22rem] items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line)] bg-black text-xs text-white/70">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={alt} className="h-full w-full object-contain" src={url} />
      ) : error ? (
        <span role="alert">{t("dicom.analysis.previewError")}</span>
      ) : loading ? (
        <span>{t("dicom.analysis.previewLoading")}</span>
      ) : null}
    </div>
  );
}

// "Analyser cette coupe": one slice of an MRI series of the study, one of the
// two chains that read a slice. The backend stores the slice as a document of
// the record and runs the chain like any analysis (consent, plan, quota,
// physician's decision); the page then opens the result. An analysis is a
// write: a read-only account sees the panel with the button off.
export function DicomAnalysisPanel({ accountType, initialPipeline, patientId, study, t }: DicomAnalysisPanelProps) {
  const router = useRouter();
  const baseId = useId();
  const write = useReadOnlyAction(t);
  const consents = usePatientConsents(patientId);
  const analyze = useAnalyzeDicomInstance(patientId);
  const series = useMemo(() => analysableSeries(study), [study]);
  const [chosenSeriesId, setChosenSeriesId] = useState<string | null>(null);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [pipeline, setPipeline] = useState<DicomAnalysisPipeline | null>(initialPipeline ?? null);

  const currentSeries = series.find((item) => item.id === chosenSeriesId) ?? series[0] ?? null;
  const instances = useMemo(() => (currentSeries ? analysableInstances(currentSeries) : []), [currentSeries]);
  // The middle of the stack until the physician moves: the most informative slice.
  const index = Math.min(chosenIndex ?? Math.floor(instances.length / 2), Math.max(instances.length - 1, 0));
  const instance = instances[index] ?? null;
  const preview = useDicomPreview(instance?.id ?? null);

  const consentMissing =
    consents.isSuccess &&
    !consents.data.some((consent) => consent.type === "DIAGNOSTIC_AI" && consent.status === "SIGNED");
  const busy = analyze.isPending;
  const canLaunch = canLaunchDicomAnalysis({ busy, consentMissing, hasSlice: instance !== null, pipeline, readOnly: write.disabled });
  const recordBase = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";

  const launch = () => {
    if (!instance || !pipeline || !canLaunch) return;
    analyze.mutate(
      { instanceId: instance.id, pipeline },
      {
        // A run the service refused is recorded all the same: its page says why.
        onError: (error) => {
          const href = failedRunPagePath(accountType, patientId, error);
          if (href) router.push(href);
        },
        onSuccess: (run) => router.push(dicomRunPagePath(accountType, patientId, run.id)),
      },
    );
  };

  const errorMessage =
    analyze.isError && !getFailedRunId(analyze.error)
      ? getMutationErrorMessage(analyze.error, t, t("dicom.analysis.error"))
      : null;

  const position = index + 1;
  const total = instances.length;

  return (
    <section aria-labelledby={`${baseId}-title`} className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5" data-dicom-analysis="true">
      <h2 id={`${baseId}-title`} className="font-[var(--font-auth-display)] text-xl font-medium text-[var(--ink)]">
        {t("dicom.analysis.title")}
      </h2>
      <p className="clinical-caption mt-0.5">{t("dicom.analysis.subtitle")}</p>

      {!currentSeries || !instance ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">{t("dicom.analysis.noSeries")}</p>
      ) : (
        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="space-y-3">
            <SlicePreview
              alt={t("dicom.analysis.previewAlt", { position, total })}
              blob={preview.data}
              error={preview.isError}
              loading={preview.isLoading}
              t={t}
            />
            <div>
              <label htmlFor={`${baseId}-slice`} className="flex items-baseline justify-between gap-2 text-xs text-[var(--ink-soft)]">
                <span>{t("dicom.analysis.sliderLabel")}</span>
                <span aria-live="polite">{t("dicom.analysis.sliceCounter", { position, total })}</span>
              </label>
              <input
                id={`${baseId}-slice`}
                type="range"
                className="mt-1 w-full"
                disabled={busy || total < 2}
                max={Math.max(total - 1, 0)}
                min={0}
                step={1}
                value={index}
                aria-valuetext={t("dicom.analysis.sliceCounter", { position, total })}
                onChange={(event) => {
                  analyze.reset();
                  setChosenIndex(Number(event.target.value));
                }}
              />
              <p className="clinical-caption mt-1" data-slice-name="true">
                {formatDicomSlice({ instanceNumber: instance.instanceNumber, seriesNumber: currentSeries.number }, t)}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {series.length > 1 ? (
              <div>
                <label htmlFor={`${baseId}-series`} className="text-xs font-medium text-[var(--ink-soft)]">
                  {t("dicom.analysis.seriesLabel")}
                </label>
                <select
                  id={`${baseId}-series`}
                  className="clinical-input mt-1 w-full"
                  disabled={busy}
                  value={currentSeries.id}
                  onChange={(event) => {
                    analyze.reset();
                    setChosenSeriesId(event.target.value);
                    setChosenIndex(null);
                  }}
                >
                  {series.map((item) => {
                    const count = analysableInstances(item).length;
                    const number = item.number ?? t("dicom.analysis.noNumber");
                    return (
                      <option key={item.id} value={item.id}>
                        {item.description
                          ? t("dicom.analysis.seriesOption", { count, description: item.description, number })
                          : t("dicom.analysis.seriesOptionPlain", { count, number })}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : null}

            <fieldset disabled={busy} className="min-w-0">
              <legend className="text-xs font-medium text-[var(--ink-soft)]">{t("dicom.analysis.chain")}</legend>
              <div className="mt-1.5 space-y-2">
                {DICOM_ANALYSIS_PIPELINES.map((id) => {
                  const Icon = pipelineIcons[id];
                  const selected = pipeline === id;
                  return (
                    <label
                      key={id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border px-3 py-2.5 text-sm transition",
                        selected ? "border-[var(--accent)] bg-[var(--surface-muted)]" : "border-[var(--line)] hover:border-[var(--border-strong)]",
                      )}
                    >
                      <input
                        type="radio"
                        name={`${baseId}-pipeline`}
                        className="mt-1"
                        checked={selected}
                        value={id}
                        onChange={() => {
                          analyze.reset();
                          setPipeline(id);
                        }}
                      />
                      <Icon size={18} strokeWidth={1.7} className="mt-0.5 shrink-0 text-[var(--accent-dark)]" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block font-medium text-[var(--ink)]">{t(`aiAnalyses.pipelines.${id}.name`)}</span>
                        <span className="clinical-caption block">{t(`dicom.analysis.pipelineHints.${id}`)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {consentMissing ? (
              <p role="note" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--warning-ink)]">
                <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                <span>
                  {t("dicom.analysis.consentMissing")}{" "}
                  <Link className="underline" href={`${recordBase}/patients/${encodeURIComponent(patientId)}?tab=consents`}>
                    {t("dicom.analysis.openConsents")}
                  </Link>
                </span>
              </p>
            ) : null}

            {errorMessage ? (
              <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                {errorMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="clinical-button clinical-button-primary disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!canLaunch}
                title={write.title}
                onClick={launch}
              >
                {busy ? <RefreshCw size={16} className="animate-spin" aria-hidden="true" /> : null}
                {busy ? t("dicom.analysis.launching") : t("dicom.analysis.launch")}
              </button>
              {!pipeline && !busy ? <span className="clinical-caption">{t("dicom.analysis.pipelineRequired")}</span> : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
