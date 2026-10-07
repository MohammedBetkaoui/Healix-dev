"use client";

import { Clock3, FileText, ScanLine } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { StatusBadge } from "@/components/dashboard/shared/StatusBadge";
import {
  type AiModel,
  type AiModelStatus,
} from "@/features/ai-analyses/ai-analyses.types";
import { formatAiMetricValue } from "@/features/ai-analyses/format-ai-metric";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type DashboardStatusTone } from "@/types/dashboard";

// Workflow status colors, never the specialty ones; the badge text carries
// the status, the tone only reinforces it. "exploring" is neutral: an early
// study, not a problem.
export const aiModelStatusTone: Record<AiModelStatus, DashboardStatusTone> = {
  available: "success",
  in_design: "warning",
  exploring: "neutral",
};

type AiModelCardProps = {
  locale: Locale;
  model: AiModel;
  /** "New analysis" route of the account's role, with ?model= set. */
  newAnalysisHref: string;
  onOpenSheet: () => void;
  t: TranslationFunction;
};

export function AiModelCard({ locale, model, newAnalysisHref, onOpenSheet, t }: AiModelCardProps) {
  const id = useId();
  const nameId = `${id}-name`;
  const name = t(`aiAnalyses.models.${model.id}.name`);
  const notProvided = t("aiAnalyses.card.notProvided");
  const isAvailable = model.status === "available";
  const mainMetric = model.metrics?.[0] ?? null;

  return (
    <article
      aria-labelledby={nameId}
      className={cn(
        "flex h-full flex-col rounded-[var(--radius-md)] border p-4",
        isAvailable
          ? "border-[var(--border)] bg-[var(--surface)]"
          : "border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={nameId} className="min-w-0 break-words text-sm font-semibold text-[var(--text-primary)]">
          {name}
        </h3>
        <StatusBadge label={t(`aiAnalyses.statuses.${model.status}`)} tone={aiModelStatusTone[model.status]} />
      </div>

      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.card.version")}</dt>
        <dd className="text-[var(--text-primary)]">
          {model.version ? <bdi dir="ltr" className="font-[var(--font-auth-mono)]">v{model.version}</bdi> : notProvided}
        </dd>
        <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.card.task")}</dt>
        <dd className="text-[var(--text-primary)]">{t(`aiAnalyses.tasks.${model.task}`)}</dd>
        <dt className="text-[var(--text-secondary)]">{t("aiAnalyses.card.modality")}</dt>
        <dd className="text-[var(--text-primary)]">
          {model.inputModality ? t(`aiAnalyses.modalities.${model.inputModality}`) : notProvided}
        </dd>
      </dl>

      <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--line-soft)] px-3 py-2.5">
        <p className="text-xs text-[var(--text-secondary)]">
          {t("aiAnalyses.card.mainMetric")}
          {mainMetric ? <> · {t("aiAnalyses.card.internalValidation")}</> : null}
        </p>
        {mainMetric ? (
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <bdi dir="ltr" className="font-[var(--font-auth-mono)] text-lg font-semibold tabular-nums text-[var(--text-primary)]">
              {formatAiMetricValue(mainMetric, locale)}
            </bdi>
            <span className="text-xs text-[var(--text-secondary)]">{t(`aiAnalyses.metrics.${mainMetric.key}`)}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{notProvided}</p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        <button
          type="button"
          className="clinical-button"
          aria-haspopup="dialog"
          aria-label={t("aiAnalyses.card.openSheetFor", { name })}
          onClick={onOpenSheet}
        >
          <FileText size={16} strokeWidth={1.8} aria-hidden="true" />
          {t("aiAnalyses.card.openSheet")}
        </button>
        {isAvailable ? (
          <Link
            href={newAnalysisHref}
            className="clinical-button clinical-button-primary"
            aria-label={t("aiAnalyses.card.newAnalysisFor", { name })}
          >
            <ScanLine size={16} strokeWidth={1.8} aria-hidden="true" />
            {t("aiAnalyses.card.newAnalysis")}
          </Link>
        ) : (
          <button type="button" className="clinical-button clinical-button-unavailable" disabled>
            <Clock3 size={16} strokeWidth={1.8} aria-hidden="true" />
            {t("aiAnalyses.card.comingSoon")}
          </button>
        )}
      </div>
    </article>
  );
}
