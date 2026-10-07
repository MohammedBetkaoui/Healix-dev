"use client";

import {
  CircleCheck,
  CircleMinus,
  CircleX,
  Info,
  Loader2,
  type LucideIcon,
} from "lucide-react";

import {
  type QualityCheck,
  type QualityCheckReport,
  type QualityCheckStatus,
} from "@/features/ai-analyses/quality-check";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Each status has its own icon and its own word: color is never the only cue.
const statusPresentation: Record<QualityCheckStatus, { className: string; icon: LucideIcon }> = {
  pass: { className: "text-[var(--success-ink)]", icon: CircleCheck },
  fail: { className: "text-[var(--danger-ink)]", icon: CircleX },
  not_provided: { className: "text-[var(--text-secondary)]", icon: CircleMinus },
  not_applicable: { className: "text-[var(--text-secondary)]", icon: Info },
  pending: { className: "text-[var(--text-secondary)]", icon: Loader2 },
};

function checkDetail(check: QualityCheck, t: TranslationFunction): string | null {
  const detail = check.detail ?? {};

  if (check.key === "format") {
    if (check.status === "not_provided") {
      return t("aiAnalyses.wizard.quality.details.formatNotProvided");
    }

    return t("aiAnalyses.wizard.quality.details.formatAccepted", {
      accepted: detail.accepted ?? "",
      extension: detail.extension || t("aiAnalyses.wizard.quality.details.noExtension"),
    });
  }

  if (check.key === "decodable") {
    if (check.status === "not_applicable") return t("aiAnalyses.wizard.quality.details.dicom");
    if (detail.reason === "undecodable") return t("aiAnalyses.wizard.quality.details.undecodable");
    if (detail.reason === "unavailable") return t("aiAnalyses.wizard.quality.details.unavailable");
    return null;
  }

  if (check.status === "pass" || check.status === "fail") {
    return t("aiAnalyses.wizard.quality.details.dimensions", { height: detail.height, width: detail.width });
  }

  return check.status === "not_applicable" ? t("aiAnalyses.wizard.quality.details.dimensionsUnknown") : null;
}

type QualityStepProps = {
  onChooseAnother: () => void;
  report: QualityCheckReport;
  t: TranslationFunction;
};

export function QualityStep({ onChooseAnother, report, t }: QualityStepProps) {
  const isPending = report.checks.some((check) => check.status === "pending");
  const hasFailure = report.checks.some((check) => check.status === "fail");

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">{t("aiAnalyses.wizard.quality.hint")}</p>

      <ul aria-label={t("aiAnalyses.wizard.quality.listLabel")} className="divide-y divide-[var(--line-soft)] rounded-[var(--radius-sm)] border border-[var(--border)]">
        {report.checks.map((check) => {
          const { className, icon: Icon } = statusPresentation[check.status];
          const detail = checkDetail(check, t);

          return (
            <li key={check.key} className="flex items-start gap-3 px-4 py-3">
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" className={cn("mt-0.5 shrink-0", className, check.status === "pending" && "animate-spin")} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium text-[var(--text-primary)]">
                    {t(`aiAnalyses.wizard.quality.checks.${check.key}`, { min: check.detail?.min ?? "" })}
                  </span>
                  <span className={cn("text-xs font-semibold", className)}>
                    {t(`aiAnalyses.wizard.quality.statuses.${check.status}`)}
                  </span>
                </p>
                {detail ? <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{detail}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div aria-live="polite">
        {isPending ? (
          <p className="text-sm text-[var(--text-secondary)]">{t("aiAnalyses.wizard.quality.waiting")}</p>
        ) : hasFailure ? (
          <div className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--danger-line)] bg-[var(--danger-soft)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[var(--danger-ink)]">{t("aiAnalyses.wizard.quality.blocked")}</p>
            <button type="button" className="clinical-button shrink-0" onClick={onChooseAnother}>
              {t("aiAnalyses.wizard.quality.chooseAnother")}
            </button>
          </div>
        ) : (
          <p className="rounded-[var(--radius-sm)] border border-[var(--success-line)] bg-[var(--success-soft)] px-3 py-2.5 text-sm text-[var(--success-ink)]">
            {t("aiAnalyses.wizard.quality.ready")}
          </p>
        )}
      </div>
    </div>
  );
}
