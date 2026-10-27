"use client";

import { HeartPulse, RefreshCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { getFailedRunId } from "@/features/ai-analyses/run-presentation";
import {
  canLaunchCineMeasure,
  defaultCineStack,
  dicomRunPagePath,
  failedRunPagePath,
} from "@/features/dicom/dicom-analysis";
import { formatBytes } from "@/features/dicom/dicom-import";
import { type CineStack } from "@/features/dicom/dicom.types";
import { useAnalyzeCineStack, useCineStacks } from "@/features/dicom/hooks/use-dicom-studies";
import { usePatientConsents } from "@/features/patients/hooks/use-patient-consents";
import { useReadOnlyAction } from "@/features/subscriptions/hooks/use-read-only-action";
import { getMutationErrorMessage } from "@/lib/api/get-mutation-error-message";
import { type TranslationFunction } from "@/lib/i18n";

type CardiacVolumePanelProps = {
  accountType: "DOCTOR" | "ESTABLISHMENT";
  patientId: string;
  studyId: string;
  t: TranslationFunction;
};

/** The label of a series in the list: its number, its description, what it holds. */
function stackLabel(stack: CineStack, t: TranslationFunction): string {
  const number = stack.number ?? t("dicom.cine.noNumber");
  if (stack.refusal) return t("dicom.cine.optionRefused", { number });
  return stack.description
    ? t("dicom.cine.option", { description: stack.description, number, phases: stack.phases, slices: stack.slices })
    : t("dicom.cine.optionPlain", { number, phases: stack.phases, slices: stack.slices });
}

// "Mesurer le coeur": a cine series of the study (several phases at each slice position), measured whole.
// The backend zips the series into a document of the record and runs the volumetry like any analysis
// (consent, plan, quota, the physician's decision); the page then opens the result. A measure is a write: a
// read-only account sees the panel with the button off. It can take up to 3 minutes, and says so.
export function CardiacVolumePanel({ accountType, patientId, studyId, t }: CardiacVolumePanelProps) {
  const router = useRouter();
  const baseId = useId();
  const write = useReadOnlyAction(t);
  const consents = usePatientConsents(patientId);
  const stacksQuery = useCineStacks(studyId);
  const measure = useAnalyzeCineStack(patientId, studyId);
  const stacks = stacksQuery.data ?? [];
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);

  const stack = stacks.find((item) => item.seriesId === chosenId) ?? defaultCineStack(stacks) ?? stacks[0] ?? null;
  const shortAxisConfirmed = stack !== null && confirmedId === stack.seriesId;
  const consentMissing =
    consents.isSuccess &&
    !consents.data.some((consent) => consent.type === "DIAGNOSTIC_AI" && consent.status === "SIGNED");
  const busy = measure.isPending;
  const canLaunch = canLaunchCineMeasure({ busy, consentMissing, readOnly: write.disabled, shortAxisConfirmed, stack });
  const recordBase = accountType === "ESTABLISHMENT" ? "/establishment" : "/doctor";
  const units = [t("dicom.units.b"), t("dicom.units.kb"), t("dicom.units.mb"), t("dicom.units.gb")] as const;

  const launch = () => {
    if (!stack || !canLaunch) return;
    measure.mutate(
      { seriesId: stack.seriesId },
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
    measure.isError && !getFailedRunId(measure.error)
      ? getMutationErrorMessage(measure.error, t, t("dicom.cine.errorLaunch"))
      : null;

  return (
    <section
      aria-labelledby={`${baseId}-title`}
      className="dicom-tool-panel mt-5 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"
      data-cardiac-volume="true"
    >
      <div className="dicom-tool-heading">
        <span className="dicom-tool-icon dicom-tool-icon-cardiac"><HeartPulse size={19} strokeWidth={1.8} aria-hidden="true" /></span>
        <div className="min-w-0">
          <span className="dicom-tool-kicker">{t("dicom.cine.badge")}</span>
          <h2 id={`${baseId}-title`}>{t("dicom.cine.title")}</h2>
        </div>
      </div>
      <p className="dicom-tool-description">{t("dicom.cine.subtitle")}</p>

      {stacksQuery.isLoading ? (
        <p role="status" className="mt-4 text-sm text-[var(--text-secondary)]">{t("dicom.cine.loading")}</p>
      ) : stacksQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-[var(--danger-ink)]">{t("dicom.cine.error")}</p>
      ) : !stack ? (
        <div className="dicom-empty-state mt-4">
          <span className="dicom-empty-state-icon is-cardiac"><HeartPulse size={20} strokeWidth={1.8} aria-hidden="true" /></span>
          <div>
            <strong>{t("dicom.cine.emptyTitle")}</strong>
            <p>{t("dicom.cine.none")}</p>
            <span>{t("dicom.cine.emptyHint")}</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor={`${baseId}-series`} className="text-xs font-medium text-[var(--ink-soft)]">
              {t("dicom.cine.seriesLabel")}
            </label>
            <select
              id={`${baseId}-series`}
              className="clinical-input mt-1 w-full"
              disabled={busy}
              value={stack.seriesId}
              onChange={(event) => {
                measure.reset();
                setChosenId(event.target.value);
              }}
            >
              {stacks.map((item) => (
                <option key={item.seriesId} value={item.seriesId}>
                  {stackLabel(item, t)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 text-sm" data-cine-series={stack.seriesId}>
            <p className="text-[var(--text-primary)]">
              {t("dicom.cine.facts", {
                count: stack.instances,
                phases: stack.phases,
                size: formatBytes(stack.bytes, units),
                slices: stack.slices,
              })}
            </p>
            {stack.refusal ? (
              <p role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--danger-ink)]">
                <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
                {t(`dicom.cine.refusals.${stack.refusal}`)}
              </p>
            ) : (
              <p className="text-xs text-[var(--text-secondary)]">
                {stack.shortAxisLikely === true
                  ? t("dicom.cine.shortAxisYes")
                  : stack.shortAxisLikely === false
                    ? t("dicom.cine.shortAxisNo")
                    : t("dicom.cine.shortAxisUnknown")}
              </p>
            )}
          </div>

          {!stack.refusal ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-[var(--accent)]"
                disabled={busy}
                checked={shortAxisConfirmed}
                onChange={(event) => setConfirmedId(event.target.checked ? stack.seriesId : null)}
              />
              <span className="text-[var(--ink)]">{t("dicom.cine.shortAxisConfirm")}</span>
            </label>
          ) : null}

          {consentMissing ? (
            <p role="note" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--warning-line)] bg-[var(--warning-soft)] px-3 py-2.5 text-xs leading-relaxed text-[var(--warning-ink)]">
              <TriangleAlert size={15} strokeWidth={1.8} className="mt-px shrink-0" aria-hidden="true" />
              <span>
                {t("dicom.cine.consentMissing")}{" "}
                <Link className="underline" href={`${recordBase}/patients/${encodeURIComponent(patientId)}?tab=consents`}>
                  {t("dicom.cine.openConsents")}
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
              {busy ? t("dicom.cine.launching") : t("dicom.cine.launch")}
            </button>
            {busy ? (
              <span role="status" className="clinical-caption max-w-xl">
                {t("dicom.cine.launchingHint")}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
