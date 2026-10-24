import { ShieldAlert, TriangleAlert } from "lucide-react";

import { type AiPriority } from "@/features/ai-analyses/ai-analyses.types";
import {
  isFlagged,
  priorityReasons,
  priorityTitle,
  priorityTones,
} from "@/features/ai-analyses/ai-priority";
import { type Locale } from "@/i18n";
import { type TranslationFunction } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const toneClasses = {
  danger: "border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  warning: "border-[var(--warning-line)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
} as const;

type PriorityBadgeProps = {
  locale: Locale;
  priority: AiPriority;
  t: TranslationFunction;
};

// URGENT and HIGH only: a run to read in its turn carries nothing. The level
// is written (never colour alone); the reasons are the tooltip, and also text
// for a keyboard or a screen reader, with the reminder that this is an order
// of reading and not a diagnosis.
export function PriorityBadge({ locale, priority, t }: PriorityBadgeProps) {
  if (!isFlagged(priority) || priority.level === "ROUTINE") return null;

  const tone = priorityTones[priority.level] as keyof typeof toneClasses;
  const Icon = priority.level === "URGENT" ? ShieldAlert : TriangleAlert;

  return (
    <span
      data-priority={priority.level}
      title={priorityTitle(priority, locale, t)}
      tabIndex={0}
      className={cn(
        "inline-flex cursor-help items-center gap-1 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold tracking-[0.03em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        toneClasses[tone],
      )}
    >
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      {t(`aiAnalyses.priority.levels.${priority.level}`)}
      <span className="sr-only">
        {` — ${priorityReasons(priority, locale, t).join(" ")} ${t("aiAnalyses.priority.disclaimerShort")}`}
      </span>
    </span>
  );
}
